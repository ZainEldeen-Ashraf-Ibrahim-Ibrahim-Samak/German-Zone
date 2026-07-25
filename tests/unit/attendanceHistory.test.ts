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

describe('attendance:getStudentHistory — complete per-student attendance history (US7, FR-019)', () => {
  let db: any
  let teacherId: number
  let studentId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate)
      VALUES ('Ahmed', 'Teacher', 0, 0, 1, ?, 150)
    `).run(now).lastInsertRowid)

    studentId = Number(db.prepare(`
      INSERT INTO students (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)
  })

  const record = getHandler('attendance:record')
  const getStudentHistory = getHandler('attendance:getStudentHistory')

  it('returns one row per attendance date with teacher, statuses, payment flag, and cost, newest first', async () => {
    const sessionA = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)`).run(new Date().toISOString(), new Date().toISOString()).lastInsertRowid)
    const sessionB = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-06', ?, ?)`).run(new Date().toISOString(), new Date().toISOString()).lastInsertRowid)

    await record(null, { session_id: sessionA, records: [{ student_id: studentId, status: 'attended', teacher_status: 'present' }] })
    await record(null, { session_id: sessionB, records: [{ student_id: studentId, status: 'absent_excused', teacher_status: 'present' }] })

    const history = await getStudentHistory(null, { student_id: studentId })
    expect(history.length).toBe(2)
    expect(history[0].attendance_date).toBe('2026-07-06')
    expect(history[0].payment_generated).toBe(false)
    expect(history[1].attendance_date).toBe('2026-07-04')
    expect(history[1].teacher_name).toBe('Ahmed')
    expect(history[1].payment_generated).toBe(true)
    expect(history[1].session_cost).toBe(150)
  })
})
