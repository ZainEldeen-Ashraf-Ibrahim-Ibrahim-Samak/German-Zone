import { create } from 'zustand'
import type { Expense } from '../types/index.js'
import { friendlyError } from '../utils/errors.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

interface ExpensesState {
  expenses: Expense[]
  isLoading: boolean
  error: string | null
  currentYear: number

  setYear: (year: number) => void
  fetchExpenses: () => Promise<void>
  updateExpense: (args: {
    item: string
    month: string
    year: number
    amount: number
    category?: string | null
    notes?: string | null
  }) => Promise<Expense | null>
  addItem: (args: { item: string; category?: string | null }) => Promise<boolean>
  removeItem: (item: string) => Promise<boolean>
  clearError: () => void

  // Computed helpers (not reactive, call inline)
  getDistinctItems: () => string[]
  getItemTotal: (item: string) => number
  getMonthTotal: (month: string) => number
  getGrandTotal: () => number
}

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  expenses: [],
  isLoading: false,
  error: null,
  currentYear: new Date().getFullYear(),

  setYear: (year) => {
    set({ currentYear: year })
    get().fetchExpenses()
  },

  fetchExpenses: async () => {
    set({ isLoading: true, error: null })
    try {
      const year = get().currentYear
      const result = await window.api.expenses.get({ year })
      set({ expenses: result, isLoading: false })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch expenses')
      set({ error: errorMsg, isLoading: false })
    }
  },

  updateExpense: async (args) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.expenses.update(args)
      // Update in local state
      set((state) => {
        const updated = state.expenses.map((e) =>
          e.item === args.item && e.month === args.month && e.year === args.year ? result : e
        )
        // If it was a virtual row (id=0), replace it
        const found = updated.find(
          (e) => e.item === args.item && e.month === args.month && e.year === args.year
        )
        if (!found) {
          return { expenses: [...state.expenses, result], isLoading: false }
        }
        return { expenses: updated, isLoading: false }
      })
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update expense')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  addItem: async (args) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.expenses.addItem(args)
      // Refresh the full grid
      await get().fetchExpenses()
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to add expense item')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  removeItem: async (item) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.expenses.removeItem({ item })
      set((state) => ({
        expenses: state.expenses.filter((e) => e.item !== item),
        isLoading: false
      }))
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to remove expense item')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),

  getDistinctItems: () => {
    const expenses = get().expenses
    return [...new Set(expenses.map((e) => e.item))].sort()
  },

  getItemTotal: (item) => {
    return get()
      .expenses.filter((e) => e.item === item)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getMonthTotal: (month) => {
    return get()
      .expenses.filter((e) => e.month === month)
      .reduce((sum, e) => sum + e.amount, 0)
  },

  getGrandTotal: () => {
    return get().expenses.reduce((sum, e) => sum + e.amount, 0)
  }
}))

export { arabicMonths }
