import { create } from 'zustand'
import type { Notification } from '../types/index.js'

interface NotificationsState {
  notifications: Notification[]
  isLoading: boolean
  fetchNotifications: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  unreadCount: () => number
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true })
    try {
      const notifications = await window.api.notifications.list()
      set({ notifications, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  markRead: async (id) => {
    try {
      await window.api.notifications.markRead({ id })
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      }))
    } catch { /* best-effort */ }
  },

  markAllRead: async () => {
    try {
      await window.api.notifications.markRead({ all: true })
      const now = new Date().toISOString()
      set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read_at: n.read_at ?? now })) }))
    } catch { /* best-effort */ }
  },

  unreadCount: () => get().notifications.filter((n) => !n.read_at).length,
}))
