import { create } from 'zustand'
import type { AttendanceEditRequest } from '../types/index.js'

interface AttendanceEditRequestsState {
  requests: AttendanceEditRequest[]
  isLoading: boolean
  error: string | null
  fetchRequests: (args?: { status?: string; child_id?: number; teacher_id?: number }) => Promise<void>
  requestEdit: (args: {
    attendance_record_id: number
    requested_status: string
    requested_excuse_notes?: string | null
    requested_teacher_status?: string | null
    reason: string
  }) => Promise<AttendanceEditRequest | null>
  decide: (id: number, decision: 'approve' | 'reject', decision_notes?: string | null) => Promise<boolean>
  clearError: () => void
}

export const useAttendanceEditRequestsStore = create<AttendanceEditRequestsState>((set) => ({
  requests: [],
  isLoading: false,
  error: null,

  fetchRequests: async (args) => {
    set({ isLoading: true, error: null })
    try {
      const requests = await window.api.attendance.listEditRequests(args)
      set({ requests, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch edit requests', isLoading: false })
    }
  },

  requestEdit: async (args) => {
    set({ isLoading: true, error: null })
    try {
      const created = await window.api.attendance.requestEdit(args)
      set({ isLoading: false })
      return created
    } catch (err: any) {
      set({ error: err.message || 'Failed to submit edit request', isLoading: false })
      return null
    }
  },

  decide: async (id, decision, decision_notes) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.attendance.decideEditRequest({ id, decision, decision_notes })
      set((state) => ({
        isLoading: false,
        requests: state.requests.map((r) =>
          r.id === id ? { ...r, status: decision === 'approve' ? 'approved' : 'rejected' } : r
        ) as AttendanceEditRequest[]
      }))
      return true
    } catch (err: any) {
      set({ error: err.message || 'Failed to decide edit request', isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
