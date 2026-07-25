import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Child } from '../types/index.js'

interface ChildrenFilters {
  search: string
  service: string
  activeOnly: boolean
}

interface ChildrenState {
  children: Child[]
  isLoading: boolean
  error: string | null
  filters: ChildrenFilters
  setFilters: (filters: Partial<ChildrenFilters>) => void
  resetFilters: () => void
  fetchChildren: () => Promise<void>
  addChild: (childInput: Omit<Child, 'id' | 'created_at' | 'updated_at' | 'synced' | 'is_active'>) => Promise<Child | null>
  updateChild: (id: number, patch: Partial<Omit<Child, 'id' | 'created_at' | 'updated_at' | 'synced'>>) => Promise<Child | null>
  deactivateChild: (id: number) => Promise<boolean>
  deleteChild: (id: number) => Promise<boolean>
  clearError: () => void
}

const initialFilters: ChildrenFilters = {
  search: '',
  service: '',
  activeOnly: true,
}

export const useChildrenStore = create<ChildrenState>((set, get) => ({
  children: [],
  isLoading: false,
  error: null,
  filters: { ...initialFilters },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }))
    get().fetchChildren()
  },

  resetFilters: () => {
    set({ filters: { ...initialFilters } })
    get().fetchChildren()
  },

  fetchChildren: async () => {
    set({ isLoading: true, error: null })
    try {
      const { search, service, activeOnly } = get().filters
      const results = await window.api.children.get({
        search,
        service: service || undefined,
        activeOnly,
      })
      set({ children: results, isLoading: false })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch children')
      set({ error: errorMsg, isLoading: false })
    }
  },

  addChild: async (childInput) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.children.add(childInput)
      set((state) => ({
        children: [...state.children, result].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to add child')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  updateChild: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.children.update({ id, patch })
      set((state) => ({
        children: state.children.map((child) => (child.id === id ? result : child)),
        isLoading: false,
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update child')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  deactivateChild: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.children.deactivate({ id })
      // Refresh list or update status locally
      const { activeOnly } = get().filters
      if (activeOnly) {
        set((state) => ({
          children: state.children.filter((child) => child.id !== id),
          isLoading: false,
        }))
      } else {
        set((state) => ({
          children: state.children.map((child) =>
            child.id === id ? { ...child, is_active: 0 } : child
          ),
          isLoading: false,
        }))
      }
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to deactivate child')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  deleteChild: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.children.delete({ id })
      set((state) => ({
        children: state.children.filter((child) => child.id !== id),
        isLoading: false,
      }))
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to delete child')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
