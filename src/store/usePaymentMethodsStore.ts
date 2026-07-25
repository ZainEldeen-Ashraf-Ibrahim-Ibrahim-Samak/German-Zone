import { create } from 'zustand'

export interface PaymentMethod {
  id: number
  name: string
  is_active: number
  created_at: string
  updated_at: string
}

interface PaymentMethodsState {
  methods: PaymentMethod[]
  isLoading: boolean
  error: string | null
  fetchMethods: () => Promise<void>
  addMethod: (name: string) => Promise<PaymentMethod>
  updateMethod: (id: number, patch: { name?: string; is_active?: number }) => Promise<PaymentMethod>
  deleteMethod: (id: number) => Promise<void>
  clearError: () => void
}

export const usePaymentMethodsStore = create<PaymentMethodsState>((set) => ({
  methods: [],
  isLoading: false,
  error: null,

  fetchMethods: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await window.api.paymentMethods.list()
      set({ methods: rows, isLoading: false })
    } catch (e: any) {
      set({ error: e.message, isLoading: false })
    }
  },

  addMethod: async (name) => {
    const m = await window.api.paymentMethods.add({ name })
    set((s) => ({ methods: [...s.methods, m] }))
    return m
  },

  updateMethod: async (id, patch) => {
    const m = await window.api.paymentMethods.update({ id, patch })
    set((s) => ({ methods: s.methods.map((x) => (x.id === id ? m : x)) }))
    return m
  },

  deleteMethod: async (id) => {
    await window.api.paymentMethods.delete({ id })
    set((s) => ({ methods: s.methods.filter((x) => x.id !== id) }))
  },

  clearError: () => set({ error: null }),
}))
