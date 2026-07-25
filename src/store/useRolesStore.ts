import { create } from 'zustand'
import type { EmployeeRole } from '../types/index.js'

interface RolesState {
  roles: EmployeeRole[]
  isLoading: boolean
  error: string | null
  fetchRoles: () => Promise<void>
  addRole: (name: string) => Promise<EmployeeRole | null>
  updateRole: (id: number, patch: { name?: string; salary_type_id?: number | null }) => Promise<EmployeeRole | null>
  deleteRole: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useRolesStore = create<RolesState>((set) => ({
  roles: [],
  isLoading: false,
  error: null,

  fetchRoles: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.roles.list()
      set({ roles: result, isLoading: false })
    } catch (err: any) {
      let msg = err.message || 'Failed to fetch roles'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
    }
  },

  addRole: async (name) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.roles.add({ name })
      set((state) => ({ roles: [...state.roles, result].sort((a, b) => a.name.localeCompare(b.name)), isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to add role'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  updateRole: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.roles.update({ id, patch })
      set((state) => ({ roles: state.roles.map((r) => (r.id === id ? result : r)), isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to update role'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  deleteRole: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.roles.delete({ id })
      set((state) => ({ roles: state.roles.filter((r) => r.id !== id), isLoading: false }))
      return true
    } catch (err: any) {
      let msg = err.message || 'Failed to delete role'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
