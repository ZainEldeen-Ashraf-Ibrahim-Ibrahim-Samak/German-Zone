import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { CalendarEntry } from '../types/index.js'

interface CalendarState {
  year: number
  month: number
  entries: CalendarEntry[]
  selectedDate: string | null
  dayEntries: CalendarEntry[]
  isLoading: boolean
  error: string | null
  setMonth: (year: number, month: number) => void
  fetchMonth: () => Promise<void>
  selectDay: (date: string) => Promise<void>
  clearSelection: () => void
}

const now = new Date()

export const useCalendarStore = create<CalendarState>((set, get) => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  entries: [],
  selectedDate: null,
  dayEntries: [],
  isLoading: false,
  error: null,

  setMonth: (year, month) => set({ year, month }),

  fetchMonth: async () => {
    const { year, month } = get()
    set({ isLoading: true, error: null })
    try {
      const entries = await window.api.calendar.getMonth(year, month)
      set({ entries, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch calendar'), isLoading: false })
    }
  },

  selectDay: async (date) => {
    set({ selectedDate: date, isLoading: true, error: null })
    try {
      const result = await window.api.calendar.getDay(date)
      set({ dayEntries: result.entries, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch day schedule'), isLoading: false })
    }
  },

  clearSelection: () => set({ selectedDate: null, dayEntries: [] }),
}))
