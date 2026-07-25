import { create } from 'zustand'
import type { ServiceDefinition } from '../types/index.js'

interface ServiceDefinitionsState {
  services: ServiceDefinition[]
  isLoading: boolean
  error: string | null
  fetchServices: () => Promise<void>
  addService: (input: { name: string; price_monthly?: number | null; price_daily?: number | null; price_hourly?: number | null }) => Promise<ServiceDefinition | null>
  updateService: (id: number, patch: Partial<Pick<ServiceDefinition, 'name' | 'price_monthly' | 'price_daily' | 'price_hourly'>>) => Promise<ServiceDefinition | null>
  deleteService: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useServiceDefinitionsStore = create<ServiceDefinitionsState>((set) => ({
  services: [],
  isLoading: false,
  error: null,

  fetchServices: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.serviceDefinitions.list()
      set({ services: result, isLoading: false })
    } catch (err: any) {
      let msg = err.message || 'Failed to fetch services'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
    }
  },

  addService: async (input) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.serviceDefinitions.add(input)
      set((state) => ({ services: [...state.services, result], isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to add service'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  updateService: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.serviceDefinitions.update({ id, patch })
      set((state) => ({ services: state.services.map((s) => (s.id === id ? result : s)), isLoading: false }))
      return result
    } catch (err: any) {
      let msg = err.message || 'Failed to update service'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return null
    }
  },

  deleteService: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.serviceDefinitions.delete({ id })
      set((state) => ({ services: state.services.filter((s) => s.id !== id), isLoading: false }))
      return true
    } catch (err: any) {
      let msg = err.message || 'Failed to delete service'
      if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      set({ error: msg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
