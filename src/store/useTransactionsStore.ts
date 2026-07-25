import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Transaction } from '../types/index.js'

export type TransactionRange = 'day' | 'week' | 'month' | 'custom'

interface TransactionsState {
  range: TransactionRange
  date: string
  from: string
  to: string
  transactions: Transaction[]
  isLoading: boolean
  error: string | null
  setRange: (range: TransactionRange) => void
  setDate: (date: string) => void
  setFrom: (from: string) => void
  setTo: (to: string) => void
  fetchTransactions: () => Promise<void>
}

const today = new Date().toISOString().slice(0, 10)

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  range: 'day',
  date: today,
  from: today,
  to: today,
  transactions: [],
  isLoading: false,
  error: null,

  setRange: (range) => set({ range }),
  setDate: (date) => set({ date }),
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),

  fetchTransactions: async () => {
    const { range, date, from, to } = get()
    set({ isLoading: true, error: null })
    try {
      const args = range === 'custom' ? { range, from, to } : { range, date }
      const rows = await window.api.transactions.list(args as any)
      set({ transactions: rows, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch transactions'), isLoading: false })
    }
  },
}))
