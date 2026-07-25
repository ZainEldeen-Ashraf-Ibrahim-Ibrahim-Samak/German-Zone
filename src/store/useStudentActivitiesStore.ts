import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { StudentActivity, StudentIllnessCase } from '../types/index.js'

interface StudentActivitiesState {
  openCase: StudentIllnessCase | null
  activities: StudentActivity[]
  isLoading: boolean
  error: string | null
  fetchAll: (studentId: number) => Promise<void>
  addActivity: (studentId: number, args: { activity_date?: string; note?: string; media_data_url?: string; media_type?: 'photo' | 'video' | 'file' }) => Promise<boolean>
  openIllnessCase: (studentId: number, description?: string) => Promise<boolean>
  resolveIllnessCase: (id: number, studentId: number) => Promise<boolean>
  deleteActivity: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useStudentActivitiesStore = create<StudentActivitiesState>((set, get) => ({
  openCase: null,
  activities: [],
  isLoading: false,
  error: null,

  fetchAll: async (studentId) => {
    set({ isLoading: true, error: null })
    try {
      const [openCase, activities] = await Promise.all([
        window.api.studentIllnessCases.getOpen(studentId),
        window.api.studentActivities.list(studentId),
      ])
      set({ openCase, activities, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch student health/activity data'), isLoading: false })
    }
  },

  addActivity: async (studentId, args) => {
    try {
      const activity = await window.api.studentActivities.create({ student_id: studentId, ...args })
      set((s) => ({ activities: [activity, ...s.activities] }))
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to add activity') })
      return false
    }
  },

  openIllnessCase: async (studentId, description) => {
    try {
      const openCase = await window.api.studentIllnessCases.create({ student_id: studentId, description })
      set({ openCase })
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to open illness case') })
      return false
    }
  },

  resolveIllnessCase: async (id, studentId) => {
    try {
      await window.api.studentIllnessCases.resolve({ id })
      set({ openCase: null })
      await get().fetchAll(studentId)
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to resolve illness case') })
      return false
    }
  },

  deleteActivity: async (id) => {
    try {
      await window.api.studentActivities.delete(id)
      set((s) => ({ activities: s.activities.filter(a => a.id !== id) }))
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to delete activity') })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
