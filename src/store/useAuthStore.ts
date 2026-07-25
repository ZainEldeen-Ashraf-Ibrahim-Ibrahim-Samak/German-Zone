import { create } from 'zustand'
import type { User } from '../types/index.js'
import { friendlyError } from '../utils/errors.js'

const TOKEN_STORAGE_KEY = 'nursery_auth_token'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkCurrent: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  
  login: async (username, password) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.auth.login({ username, password })
      // Persist the token so the session survives an app restart
      if (result.token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, result.token)
      }
      set({
        user: result.user,
        token: result.token,
        isAuthenticated: true,
        isLoading: false,
      })
      return true
    } catch (err: any) {
      // Extract the raw message if wrapped by Electron IPC
      const errorMsg = friendlyError(err, 'Login failed')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },
  
  logout: async () => {
    set({ isLoading: true })
    try {
      await window.api.auth.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    }
  },
  
  checkCurrent: async () => {
    set({ isLoading: true })
    try {
      // First try the in-memory main-process session (same app run)
      let result = await window.api.auth.current()

      // On a fresh app start the in-memory session is gone — restore it from the
      // persisted JWT so the user stays logged in across restarts.
      if (!result || !result.user) {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY)
        if (token) {
          result = await window.api.auth.restore({ token })
        }
      }

      if (result && result.user) {
        set({
          user: result.user,
          token: localStorage.getItem(TOKEN_STORAGE_KEY),
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        // No valid session — clear any stale token
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    } catch (err) {
      console.error('Check current session failed:', err)
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },
  
  clearError: () => set({ error: null })
}))
