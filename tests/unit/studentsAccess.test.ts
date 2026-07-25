import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron — capture registered ipcMain handlers (feature 004).
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {}
  ;(globalThis as any).__accessHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, cb: Function) => {
        ;(globalThis as any).__accessHandlers[channel] = cb
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/childrenIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Children access & validation (feature 004)', () => {
  let db: any
  const handlers = () => (globalThis as any).__accessHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM children').run()
    setCurrentUser(null)
  })

  const employee = () => setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })

  const validChild = {
    name: 'طفل',
    guardian: 'ولي الأمر',
    guardian_phone: '01012345678',
    reg_date: '2026-06-01',
    services: [{ service: 'حضانة', unit: 'شهر', price: 2500 }]
  }

  it('allows an employee to add a child (FR-012)', async () => {
    employee()
    const result = await handlers()['children:add'](null, validChild)
    expect(result.id).toBeGreaterThan(0)
    expect(result.guardian_phone).toBe('01012345678')
  })

  it('rejects an invalid guardian phone on add (FR-001)', async () => {
    employee()
    await expect(
      handlers()['children:add'](null, { ...validChild, guardian_phone: '0123' })
    ).rejects.toThrow()
  })

  it('computes monthly_fee = (8 + extra) * session_price (FR-011)', async () => {
    employee()
    const result = await handlers()['children:add'](null, {
      ...validChild,
      extra_lessons: 2,
      session_price: 100
    })
    const row = db.prepare('SELECT monthly_fee, sessions_baseline, extra_lessons FROM children WHERE id = ?').get(result.id) as any
    expect(row.sessions_baseline).toBe(8)
    expect(row.extra_lessons).toBe(2)
    expect(row.monthly_fee).toBe(1000)
  })

  it('still forbids a non-admin from updating a child', async () => {
    // Seed a child directly, then try to update as an employee.
    employee()
    const created = await handlers()['children:add'](null, validChild)
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
    await expect(
      handlers()['children:update'](null, { id: created.id, patch: { name: 'x' } })
    ).rejects.toThrow(/FORBIDDEN/)
  })
})
