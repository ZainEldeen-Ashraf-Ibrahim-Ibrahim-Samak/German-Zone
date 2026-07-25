import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/salariesIPC.js'
import '../../electron/ipc/attendanceIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Net Salary on the Salaries page reflects the teacher\'s own rate (30), not a shared salary-type rate (40)', () => {
  let db: any
  let teacherId: number
  let childId: number

  const record = getHandler('attendance:record')
  const salaryGet = getHandler('salary:get')

  beforeAll(async () => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    // A shared salary type with a DIFFERENT rate (40) than the teacher's own rate (30) —
    // this is the old, role-level concept that must no longer win for a configured teacher.
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at)
      VALUES ('Teacher Salary Type', 'per_session_fixed', 40, ?, ?)
    `).run(now, now).lastInsertRowid)

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate, salary_type_override_id)
      VALUES ('Ahmed', 'Teacher', 0, 0, 1, ?, 30, ?)
    `).run(now, salaryTypeId).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    const session1 = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)`).run(now, now).lastInsertRowid)
    const session2 = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-06', ?, ?)`).run(now, now).lastInsertRowid)

    await record(null, { session_id: session1, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    await record(null, { session_id: session2, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
  })

  it('Net Salary is 2 sessions × 30 = 60, not 2 × 40 = 80', async () => {
    const rows = await salaryGet(null, { month: 'يوليو', year: 2026 })
    const ahmedRow = rows.find((r: any) => r.employee_id === teacherId)
    expect(ahmedRow.payable_sessions).toBe(2)
    expect(ahmedRow.net_salary).toBe(60)
  })
})
