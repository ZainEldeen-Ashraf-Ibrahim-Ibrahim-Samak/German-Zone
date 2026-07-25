import { create } from 'zustand'
import type { SalaryType, SalaryMode } from '../types/index.js'

interface SalaryTypesState {
  salaryTypes: SalaryType[]
  isLoading: boolean
  error: string | null
  fetchSalaryTypes: () => Promise<void>
  addSalaryType: (input: { name: string; mode: SalaryMode; monthly_rate?: number | null; session_rate?: number | null; session_pct?: number | null }) => Promise<SalaryType | null>
  updateSalaryType: (id: number, patch: Partial<Omit<SalaryType, 'id' | 'created_at' | 'updated_at' | 'synced'>>) => Promise<SalaryType | null>
  deleteSalaryType: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useSalaryTypesStore = create<SalaryTypesState>((set) => ({
  salaryTypes: [],
  isLoading: false,
  error: null,

  fetchSalaryTypes: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.salaryTypes.list()
      set({ salaryTypes: result, isLoading: false })
    } catch (err: any) {
      let msg = err.message || 'Failed to fetch salary types'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
    }
  },

  addSalaryType: async (input) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.salaryTypes.add(input)
      set((state) => ({ salaryTypes: [...state.salaryTypes, result].sort((a, b) => a.name.localeCompare(b.name)), isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to add salary type'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  updateSalaryType: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.salaryTypes.update({ id, patch })
      set((state) => ({ salaryTypes: state.salaryTypes.map((s) => (s.id === id ? result : s)), isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to update salary type'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  deleteSalaryType: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.salaryTypes.delete({ id })
      set((state) => ({ salaryTypes: state.salaryTypes.filter((s) => s.id !== id), isLoading: false }))
      return true
    } catch (err: any) {
      let msg = err.message || 'Failed to delete salary type'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
