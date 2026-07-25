import { create } from 'zustand'

interface PendingCounts {
  children: number
  child_services: number
  payments: number
  employees: number
  salary_payments: number
  expenses: number
  users: number
  settings: number
  imported_snapshots: number
  tombstones: number
}

interface SyncStatus {
  connected: boolean
  error: string | null
  uri: string | null
  pending: PendingCounts
  lastSync: { created_at: string; status: string; action: string } | null
}

interface PushPullResults {
  [entityName: string]: {
    pushed?: number
    pulled?: number
    merged?: number
    skipped?: number
    failed?: number
    errors?: { recordId: string; message: string }[]
    skipReasons?: { recordId: string; message: string }[]
  }
}

interface SyncState {
  status: SyncStatus | null
  isConnecting: boolean
  isPushing: boolean
  isPulling: boolean
  isLoading: boolean
  lastPushResults: PushPullResults | null
  lastPullResults: PushPullResults | null
  error: string | null
  autoSyncEnabled: boolean
  autoSyncIntervalMinutes: number

  fetchStatus: () => Promise<void>
  connect: (uri: string) => Promise<boolean>
  reconnect: () => Promise<boolean>
  disconnect: () => Promise<void>
  push: (force?: boolean) => Promise<void>
  pull: (force?: boolean) => Promise<void>
  setAutoSync: (enabled: boolean, intervalMinutes?: number) => Promise<void>
  clearError: () => void
}

const handleError = (err: any): string => {
  let msg = err.message || 'Sync error'
  if (msg.includes('Error invoking remote method')) {
    msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
  }
  return msg
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: null,
  isConnecting: false,
  isPushing: false,
  isPulling: false,
  isLoading: false,
  lastPushResults: null,
  lastPullResults: null,
  error: null,
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 1,

  fetchStatus: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.sync.status()
      // Rehydrate the auto-sync toggle from the persisted setting so it survives
      // an app restart instead of always showing "Off".
      const next: any = { status: result, isLoading: false }
      if (typeof result?.autoSyncEnabled === 'boolean') {
        next.autoSyncEnabled = result.autoSyncEnabled
        if (result.autoSyncIntervalMinutes) {
          next.autoSyncIntervalMinutes = result.autoSyncIntervalMinutes
        }
      }
      set(next)
    } catch (err: any) {
      set({ error: handleError(err), isLoading: false })
    }
  },

  connect: async (uri: string) => {
    set({ isConnecting: true, error: null })
    try {
      await window.api.sync.connect({ uri })
      await get().fetchStatus()
      set({ isConnecting: false })
      return true
    } catch (err: any) {
      set({ error: handleError(err), isConnecting: false })
      return false
    }
  },

  reconnect: async () => {
    set({ isConnecting: true, error: null })
    try {
      await window.api.sync.reconnect()
      await get().fetchStatus()
      set({ isConnecting: false })
      return true
    } catch (err: any) {
      set({ error: handleError(err), isConnecting: false })
      return false
    }
  },

  disconnect: async () => {
    try {
      await window.api.sync.disconnect()
      await get().fetchStatus()
    } catch (err: any) {
      set({ error: handleError(err) })
    }
  },

  push: async (force = false) => {
    set({ isPushing: true, error: null, lastPushResults: null })
    try {
      const result = await window.api.sync.push(force)
      set({ lastPushResults: result.results, isPushing: false })
      await get().fetchStatus()
    } catch (err: any) {
      set({ error: handleError(err), isPushing: false })
    }
  },

  pull: async (force = false) => {
    set({ isPulling: true, error: null, lastPullResults: null })
    try {
      const result = await window.api.sync.pull(force)
      set({ lastPullResults: result.results, isPulling: false })
      await get().fetchStatus()
    } catch (err: any) {
      set({ error: handleError(err), isPulling: false })
    }
  },

  setAutoSync: async (enabled: boolean, intervalMinutes = 30) => {
    try {
      await window.api.sync.autoSync({ enabled, intervalMinutes })
      set({ autoSyncEnabled: enabled, autoSyncIntervalMinutes: intervalMinutes })
    } catch (err: any) {
      set({ error: handleError(err) })
    }
  },

  clearError: () => set({ error: null })
}))
