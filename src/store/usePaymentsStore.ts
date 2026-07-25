import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Payment } from '../types/index.js'

interface PaymentSummary {
  totalInvoiced: number
  totalCollected: number
  arrears: number
}

interface PaymentsState {
  payments: Payment[]
  byChild: any[]
  summary: PaymentSummary
  isLoading: boolean
  error: string | null
  currentMonth: string
  currentYear: number
  setPeriod: (month: string, year: number) => void
  fetchPayments: () => Promise<void>
  generatePayments: () => Promise<number>
  updatePayment: (args: {
    id: number
    quantity?: number
    paid?: number
    notes?: string
    payment_method_id?: number | null
  }) => Promise<Payment | null>
  bulkPay: (ids: number[], payment_method_id?: number | null) => Promise<number>
  deleteChildPayments: (child_id: number) => Promise<boolean>
  deleteSelectedPayments: (ids: number[]) => Promise<number>
  deleteAllPayments: () => Promise<number>
  clearError: () => void
}

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

const now = new Date()
const defaultMonth = arabicMonths[now.getMonth()]
const defaultYear = now.getFullYear()

export const usePaymentsStore = create<PaymentsState>((set, get) => ({
  payments: [],
  byChild: [],
  summary: { totalInvoiced: 0, totalCollected: 0, arrears: 0 },
  isLoading: false,
  error: null,
  currentMonth: defaultMonth,
  currentYear: defaultYear,

  setPeriod: (month, year) => {
    set({ currentMonth: month, currentYear: year })
    get().fetchPayments()
  },

  fetchPayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const month = get().currentMonth
      const year = get().currentYear
      const result = await window.api.payments.get({ month, year })
      set({
        payments: result.payments,
        byChild: result.byChild,
        summary: result.summary,
        isLoading: false,
      })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch payments')
      set({ error: errorMsg, isLoading: false })
    }
  },

  generatePayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const month = get().currentMonth
      const year = get().currentYear
      const result = await window.api.payments.generate({ month, year })
      await get().fetchPayments()
      return result.created
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to generate payments')
      set({ error: errorMsg, isLoading: false })
      return 0
    }
  },

  updatePayment: async ({ id, quantity, paid, notes, payment_method_id }) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.payments.update({ id, quantity, paid, notes, payment_method_id })
      
      // Update byChild as well (simplified approach: just call fetchPayments instead of manual recalcs)
      // Since we want to be fast, maybe we should just call fetchPayments anyway.
      // Actually, let's keep it simple and just do a full refetch after update.
      await get().fetchPayments()
      
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update payment')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  bulkPay: async (ids, payment_method_id) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.payments.bulkPay({ ids, payment_method_id })
      await get().fetchPayments()
      return result.updated
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to process bulk payments')
      set({ error: errorMsg, isLoading: false })
      return 0
    }
  },

  deleteChildPayments: async (child_id) => {
    set({ isLoading: true, error: null })
    try {
      const month = get().currentMonth
      const year = get().currentYear
      await window.api.payments.deleteForChild({ child_id, month, year })
      await get().fetchPayments()
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to delete child payments')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  deleteSelectedPayments: async (ids) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.payments.deleteBulk(ids)
      await get().fetchPayments()
      return result.deleted
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to delete selected payments')
      set({ error: errorMsg, isLoading: false })
      return 0
    }
  },

  deleteAllPayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const month = get().currentMonth
      const year = get().currentYear
      const result = await window.api.payments.deleteAll({ month, year })
      await get().fetchPayments()
      return result.deleted
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to delete all payments')
      set({ error: errorMsg, isLoading: false })
      return 0
    }
  },

  clearError: () => set({ error: null }),
}))
