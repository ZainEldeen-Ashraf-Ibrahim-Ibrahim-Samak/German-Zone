import { create } from 'zustand'
import type { SessionTimeLog } from '../types/index.js'

export interface HourlyEmployee {
  id: number
  name: string
  role: string
  effective_hourly_rate: number | null
}

/** Strips Electron's IPC wrapper off an error so the UI shows the handler's own message. */
function cleanMessage(err: any, fallback: string): string {
  let msg = err?.message || fallback
  if (msg.includes('Error invoking remote method')) msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
  return msg
}

interface SessionTimersState {
  logs: SessionTimeLog[]
  running: SessionTimeLog[]
  hourlyEmployees: HourlyEmployee[]
  isLoading: boolean
  error: string | null
  fetchLogs: (filters?: { employee_id?: number; session_id?: number; from?: string; to?: string }) => Promise<void>
  fetchRunning: () => Promise<void>
  fetchHourlyEmployees: () => Promise<void>
  startTimer: (employee_id: number, session_id?: number | null, notes?: string | null) => Promise<SessionTimeLog | null>
  stopTimer: (id: number) => Promise<SessionTimeLog | null>
  logManual: (input: { employee_id: number; session_id?: number | null; work_date?: string; duration_minutes: number; notes?: string | null }) => Promise<SessionTimeLog | null>
  voidLog: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useSessionTimersStore = create<SessionTimersState>((set, get) => ({
  logs: [],
  running: [],
  hourlyEmployees: [],
  isLoading: false,
  error: null,

  fetchLogs: async (filters = {}) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.sessionTimers.list(filters)
      set({ logs: result, isLoading: false })
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to load time logs'), isLoading: false })
    }
  },

  fetchRunning: async () => {
    try {
      const result = await window.api.sessionTimers.active()
      set({ running: result })
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to load running timers') })
    }
  },

  fetchHourlyEmployees: async () => {
    try {
      const result = await window.api.sessionTimers.hourlyEmployees()
      set({ hourlyEmployees: result })
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to load hourly employees') })
    }
  },

  startTimer: async (employee_id, session_id = null, notes = null) => {
    set({ error: null })
    try {
      const result = await window.api.sessionTimers.start({ employee_id, session_id, notes })
      await get().fetchRunning()
      return result
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to start timer') })
      return null
    }
  },

  stopTimer: async (id) => {
    set({ error: null })
    try {
      const result = await window.api.sessionTimers.stop({ id })
      await get().fetchRunning()
      return result
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to stop timer') })
      return null
    }
  },

  logManual: async (input) => {
    set({ error: null })
    try {
      const result = await window.api.sessionTimers.logManual(input)
      return result
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to log worked time') })
      return null
    }
  },

  voidLog: async (id) => {
    set({ error: null })
    try {
      await window.api.sessionTimers.void({ id })
      set((state) => ({ logs: state.logs.map((l) => (l.id === id ? { ...l, status: 'void' as const } : l)) }))
      return true
    } catch (err: any) {
      set({ error: cleanMessage(err, 'Failed to void time log') })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
