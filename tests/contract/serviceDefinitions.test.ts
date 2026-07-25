import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__sdHandlers = handlers
  return {
    ipcMain: { handle: (ch: string, fn: Function) => { handlers[ch] = fn } },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/serviceDefinitionsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('serviceDefinitions IPC contract', () => {
  const h = () => (globalThis as any).__sdHandlers

  beforeAll(async () => {
    const db = initDb()
    runMigrations(db)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  it('serviceDefinitions:list returns built-in services', async () => {
    const rows = await h()['serviceDefinitions:list']({})
    expect(Array.isArray(rows)).toBe(true)
    // Migration 015 seeds at least nursery/hosting/session
    const names = rows.map((r: any) => r.name)
    expect(names.some((n: string) => n === 'حضانة')).toBe(true)
  })

  it('serviceDefinitions:add creates custom service', async () => {
    const svc = await h()['serviceDefinitions:add']({}, { name: 'OT Program', price_monthly: 1500, price_daily: 80 })
    expect(svc.is_custom).toBe(1)
    expect(svc.price_monthly).toBe(1500)
  })

  it('serviceDefinitions:delete blocks built-in', async () => {
    const rows = await h()['serviceDefinitions:list']({})
    const builtin = rows.find((r: any) => r.is_custom === 0)
    if (builtin) {
      await expect(h()['serviceDefinitions:delete']({}, { id: builtin.id })).rejects.toThrow()
    }
  })

  it('serviceDefinitions:list allowed for employee', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const rows = await h()['serviceDefinitions:list']({})
    expect(Array.isArray(rows)).toBe(true)
  })

  it('serviceDefinitions:add blocked for employee', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    await expect(h()['serviceDefinitions:add']({}, { name: 'Hack', price_monthly: 0 })).rejects.toThrow()
  })
})
