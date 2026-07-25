import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { ScheduledSession } from '../types/index.js'

interface SessionsState {
  sessions: ScheduledSession[]
  isLoading: boolean
  error: string | null
  fetchSessions: (from?: string, to?: string) => Promise<void>
  addSession: (data: Partial<ScheduledSession>) => Promise<ScheduledSession | null>
  updateSession: (id: number, patch: Partial<ScheduledSession>) => Promise<ScheduledSession | null>
  deleteSession: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useSessionsStore = create<SessionsState>((set) => ({
  sessions: [],
  isLoading: false,
  error: null,

  fetchSessions: async (from?: string, to?: string) => {
    set({ isLoading: true, error: null })
    try {
      const rows = await window.api.sessions.list({ from, to })
      set({ sessions: rows, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch sessions'), isLoading: false })
    }
  },

  addSession: async (data) => {
    try {
      const result = await window.api.sessions.add(data)
      set((s) => ({ sessions: [...s.sessions, result] }))
      return result
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to add session') })
      return null
    }
  },

  updateSession: async (id, patch) => {
    try {
      const result = await window.api.sessions.update(id, patch)
      set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? result : x)) }))
      return result
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to update session') })
      return null
    }
  },

  deleteSession: async (id) => {
    try {
      await window.api.sessions.delete(id)
      set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }))
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to delete session') })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
