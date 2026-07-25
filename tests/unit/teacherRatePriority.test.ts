import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/attendanceIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Teacher rate priority: own rate (30) must win from the very first save', () => {
  let db: any
  let teacherId: number
  let childId: number
  let sessionId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate)
      VALUES ('Ahmed', 'Teacher', 0, 0, 1, ?, 30)
    `).run(now).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  const record = getHandler('attendance:record')

  it('uses the teacher\'s own rate (30) on the very first payment', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const row = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    expect(row).toBeDefined()
    expect(row.session_cost).toBe(30)
  })

  it('what employees:get actually returns for this teacher (sanity check on storage)', () => {
    const row = db.prepare('SELECT teacher_session_rate FROM employees WHERE id = ?').get(teacherId) as any
    expect(row.teacher_session_rate).toBe(30)
    expect(typeof row.teacher_session_rate).toBe('number')
  })
})
