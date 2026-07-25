import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/payrollIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('payroll:report — monthly per-teacher aggregation (US8)', () => {
  let db: any
  let ahmedId: number
  let saraId: number
  let childId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    const addEmp = (name: string, rate: number) => Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate)
      VALUES (?, 'Teacher', 0, 0, 1, ?, ?)
    `).run(name, now, rate).lastInsertRowid)
    ahmedId = addEmp('Ahmed', 200)
    saraId = addEmp('Sara', 250)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    const insertPayment = (teacher: number, date: string, status: string, cost: number) => {
      const sessionId = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES (?, ?, ?)`).run(date, now, now).lastInsertRowid)
      const arId = Number(db.prepare(`
        INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at, attended_teacher_id, teacher_status)
        VALUES (?, ?, 'attended', ?, ?, ?, 'present')
      `).run(sessionId, childId, now, now, teacher).lastInsertRowid)
      db.prepare(`
        INSERT INTO teacher_payments (teacher_id, child_id, attendance_record_id, attendance_date, session_cost, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(teacher, childId, arId, date, cost, status, now, now)
    }

    // Ahmed: 2 pending + 1 paid in July 2026 = 3 sessions paid, 600 total
    insertPayment(ahmedId, '2026-07-04', 'pending', 200)
    insertPayment(ahmedId, '2026-07-06', 'pending', 200)
    insertPayment(ahmedId, '2026-07-11', 'paid', 200)
    // Ahmed: 1 void session in July — must be excluded
    insertPayment(ahmedId, '2026-07-13', 'void', 200)
    // Sara: 1 session in July, 250 total
    insertPayment(saraId, '2026-07-05', 'pending', 250)
    // Sara: 1 session in a different month — must be excluded
    insertPayment(saraId, '2026-08-05', 'pending', 250)
  })

  const report = getHandler('payroll:report')

  it('aggregates sessions_paid and total_salary per teacher for the selected month, excluding void', async () => {
    const rows = await report(null, { month: 7, year: 2026 })
    const ahmedRow = rows.find((r: any) => r.teacher_id === ahmedId)
    const saraRow = rows.find((r: any) => r.teacher_id === saraId)

    expect(ahmedRow.sessions_paid).toBe(3)
    expect(ahmedRow.total_salary).toBe(600)
    expect(saraRow.sessions_paid).toBe(1)
    expect(saraRow.total_salary).toBe(250)
  })

  it('excludes teachers with zero qualifying sessions in the selected month', async () => {
    const rows = await report(null, { month: 8, year: 2026 })
    expect(rows.find((r: any) => r.teacher_id === ahmedId)).toBeUndefined()
    expect(rows.find((r: any) => r.teacher_id === saraId)?.sessions_paid).toBe(1)
  })
})
