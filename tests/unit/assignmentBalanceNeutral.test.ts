import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/childServicesIPC.js'
import '../../electron/ipc/salariesIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Assigning children to a teacher never drains their balance (US1, FR-001)', () => {
  let db: any
  let teacherId: number
  let childId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate)
      VALUES ('Ahmed', 'Teacher', 5000, 5000, 1, ?, 150)
    `).run(now).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  const addChildService = getHandler('childServices:add')

  it('leaves employees.net_salary and base_salary unchanged after assigning children', async () => {
    const before = db.prepare('SELECT base_salary, net_salary FROM employees WHERE id = ?').get(teacherId)

    for (let i = 0; i < 5; i++) {
      await addChildService(null, { childId, service: `Service ${i}`, unit: 'جلسة', price: 100 })
    }

    const after = db.prepare('SELECT base_salary, net_salary FROM employees WHERE id = ?').get(teacherId)
    expect(after).toEqual(before)
  })

  it('creates no teacher_payments rows purely from assignment (no attendance recorded)', async () => {
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM teacher_payments WHERE teacher_id = ?').get(teacherId) as any).cnt
    expect(count).toBe(0)
  })
})
