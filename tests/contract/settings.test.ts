import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__settingsHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, cb: Function) => {
        ;(globalThis as any).__settingsHandlers[channel] = cb
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/settingsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('settings IPC contract', () => {
  let db: any
  const h = (name: string) => (globalThis as any).__settingsHandlers[name]

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    setCurrentUser(null)
  })

  const admin = () => setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  const employee = () => setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })

  describe('settings:get', () => {
    it('is accessible without auth (public read)', async () => {
      const result = await h('settings:get')(null)
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('returns a flat key/value object', async () => {
      const result = await h('settings:get')(null)
      for (const [k, v] of Object.entries(result)) {
        expect(typeof k).toBe('string')
        expect(typeof v).toBe('string')
      }
    })

    it('seed settings are present (brand_app_name at minimum)', async () => {
      const result = await h('settings:get')(null)
      expect(result.brand_app_name).toBeDefined()
    })
  })

  describe('settings:update', () => {
    it('blocks employees from updating settings', () => {
      employee()
      expect(() => h('settings:update')(null, { brand_app_name: 'Hack' })).toThrow('FORBIDDEN')
    })

    it('blocks anonymous from updating settings', () => {
      expect(() => h('settings:update')(null, { brand_app_name: 'Hack' })).toThrow('UNAUTHORIZED')
    })

    it('allows admin to update a single setting', async () => {
      admin()
      const result = h('settings:update')(null, { brand_app_name: 'Test Nursery Updated' })
      expect(result.ok).toBe(true)

      const verify = await h('settings:get')(null)
      expect(verify.brand_app_name).toBe('Test Nursery Updated')
    })

    it('upserts multiple settings in one call', async () => {
      admin()
      h('settings:update')(null, {
        nursery_monthly: '3500',
        hosting_monthly: '2500',
        session_hourly: '200'
      })

      const result = await h('settings:get')(null)
      expect(result.nursery_monthly).toBe('3500')
      expect(result.hosting_monthly).toBe('2500')
      expect(result.session_hourly).toBe('200')
    })

    it('overwrites existing setting on repeat call (idempotent)', async () => {
      admin()
      h('settings:update')(null, { target_profit_pct: '0.20' })
      h('settings:update')(null, { target_profit_pct: '0.30' })

      const result = await h('settings:get')(null)
      expect(result.target_profit_pct).toBe('0.30')
    })

    it('persists new custom keys (extensible settings)', async () => {
      admin()
      h('settings:update')(null, { custom_note: 'Hello World' })
      const result = await h('settings:get')(null)
      expect(result.custom_note).toBe('Hello World')
    })
  })
})
