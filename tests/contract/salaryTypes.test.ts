import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__stHandlers = handlers
  return {
    ipcMain: { handle: (ch: string, fn: Function) => { handlers[ch] = fn } },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/salaryTypesIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('salaryTypes IPC contract', () => {
  const h = () => (globalThis as any).__stHandlers

  beforeAll(async () => {
    const db = initDb()
    runMigrations(db)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  it('salaryTypes:list returns array', async () => {
    const rows = await h()['salaryTypes:list']({})
    expect(Array.isArray(rows)).toBe(true)
  })

  it('salaryTypes:add fixed_monthly', async () => {
    const st = await h()['salaryTypes:add']({}, { name: 'Fixed Test', mode: 'fixed_monthly', monthly_rate: 3000 })
    expect(st.mode).toBe('fixed_monthly')
    expect(st.monthly_rate).toBe(3000)
  })

  it('salaryTypes:add per_session_pct validates range', async () => {
    await expect(h()['salaryTypes:add']({}, { name: 'Bad Pct', mode: 'per_session_pct', session_pct: 1.5 }))
      .rejects.toThrow()
  })

  it('salaryTypes:update changes mode', async () => {
    const st = await h()['salaryTypes:add']({}, { name: 'Upd Test', mode: 'fixed_monthly', monthly_rate: 1000 })
    const updated = await h()['salaryTypes:update']({}, { id: st.id, patch: { mode: 'per_session_fixed', session_rate: 50 } })
    expect(updated.mode).toBe('per_session_fixed')
  })

  it('salaryTypes:list blocked for non-admin', async () => {
    setCurrentUser(null)
    await expect(h()['salaryTypes:list']({})).rejects.toThrow('UNAUTHORIZED')
  })
})
