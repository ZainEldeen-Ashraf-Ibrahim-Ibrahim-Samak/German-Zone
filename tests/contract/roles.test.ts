import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__rolesHandlers = handlers
  return {
    ipcMain: { handle: (ch: string, fn: Function) => { handlers[ch] = fn } },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/rolesIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('roles IPC contract', () => {
  const h = () => (globalThis as any).__rolesHandlers

  beforeAll(async () => {
    const db = initDb()
    runMigrations(db)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  it('roles:list returns array', async () => {
    const rows = await h()['roles:list']({})
    expect(Array.isArray(rows)).toBe(true)
  })

  it('roles:add creates a role', async () => {
    const role = await h()['roles:add']({}, { name: 'Test Teacher' })
    expect(role).toMatchObject({ name: 'Test Teacher' })
    expect(role.id).toBeTruthy()
  })

  it('roles:update changes name', async () => {
    const role = await h()['roles:add']({}, { name: 'Old Name' })
    const updated = await h()['roles:update']({}, { id: role.id, patch: { name: 'New Name' } })
    expect(updated.name).toBe('New Name')
  })

  it('roles:delete removes role with no employees', async () => {
    const role = await h()['roles:add']({}, { name: 'Temp Role' })
    const result = await h()['roles:delete']({}, { id: role.id })
    expect(result.ok).toBe(true)
  })

  it('roles:list blocked for anonymous user', async () => {
    setCurrentUser(null)
    await expect(h()['roles:list']({})).rejects.toThrow('UNAUTHORIZED')
  })
})
