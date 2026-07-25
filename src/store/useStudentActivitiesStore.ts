import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { ChildActivity, ChildIllnessCase } from '../types/index.js'

interface ChildActivitiesState {
  openCase: ChildIllnessCase | null
  activities: ChildActivity[]
  isLoading: boolean
  error: string | null
  fetchAll: (childId: number) => Promise<void>
  addActivity: (childId: number, args: { activity_date?: string; note?: string; media_data_url?: string; media_type?: 'photo' | 'video' | 'file' }) => Promise<boolean>
  openIllnessCase: (childId: number, description?: string) => Promise<boolean>
  resolveIllnessCase: (id: number, childId: number) => Promise<boolean>
  deleteActivity: (id: number) => Promise<boolean>
  clearError: () => void
}

export const useChildActivitiesStore = create<ChildActivitiesState>((set, get) => ({
  openCase: null,
  activities: [],
  isLoading: false,
  error: null,

  fetchAll: async (childId) => {
    set({ isLoading: true, error: null })
    try {
      const [openCase, activities] = await Promise.all([
        window.api.childIllnessCases.getOpen(childId),
        window.api.childActivities.list(childId),
      ])
      set({ openCase, activities, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to fetch child health/activity data'), isLoading: false })
    }
  },

  addActivity: async (childId, args) => {
    try {
      const activity = await window.api.childActivities.create({ child_id: childId, ...args })
      set((s) => ({ activities: [activity, ...s.activities] }))
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to add activity') })
      return false
    }
  },

  openIllnessCase: async (childId, description) => {
    try {
      const openCase = await window.api.childIllnessCases.create({ child_id: childId, description })
      set({ openCase })
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to open illness case') })
      return false
    }
  },

  resolveIllnessCase: async (id, childId) => {
    try {
      await window.api.childIllnessCases.resolve({ id })
      set({ openCase: null })
      await get().fetchAll(childId)
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to resolve illness case') })
      return false
    }
  },

  deleteActivity: async (id) => {
    try {
      await window.api.childActivities.delete(id)
      set((s) => ({ activities: s.activities.filter(a => a.id !== id) }))
      return true
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to delete activity') })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
