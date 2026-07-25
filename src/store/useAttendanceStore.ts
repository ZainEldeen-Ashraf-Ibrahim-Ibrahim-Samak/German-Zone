import { create } from 'zustand'
import type { AttendanceRecord, AttendanceSummary } from '../types/index.js'

interface AttendanceState {
  sheet: AttendanceRecord[]
  summary: AttendanceSummary | null
  isLoading: boolean
  error: string | null
  fetchSheet: (sessionId: number) => Promise<void>
  recordBulk: (sessionId: number, records: { child_id: number; teacher_id?: number | null; status: string; excuse_notes?: string; teacher_status?: 'present' | 'absent' }[]) => Promise<boolean>
  fetchSummary: (employeeId: number, month: string, year: number) => Promise<void>
  clearError: () => void
}

export const useAttendanceStore = create<AttendanceState>((set) => ({
  sheet: [],
  summary: null,
  isLoading: false,
  error: null,

  fetchSheet: async (sessionId) => {
    set({ isLoading: true, error: null })
    try {
      const rows = await window.api.attendance.getSheet(sessionId)
      set({ sheet: rows, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch sheet', isLoading: false })
    }
  },

  recordBulk: async (sessionId, records) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.attendance.record(sessionId, records)
      set({ isLoading: false })
      return true
    } catch (err: any) {
      set({ error: err.message || 'Failed to save attendance', isLoading: false })
      return false
    }
  },

  fetchSummary: async (employeeId, month, year) => {
    set({ isLoading: true, error: null })
    try {
      const data = await window.api.attendance.getSummary(employeeId, month, year)
      set({ summary: data, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch summary', isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
