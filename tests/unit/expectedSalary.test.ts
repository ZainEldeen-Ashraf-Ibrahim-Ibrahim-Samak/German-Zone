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

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('salary:getExpected — remaining-schedule forecast (per_child_session mode)', () => {
  let db: any
  let teacherId: number

  const getExpected = getHandler('salary:getExpected')

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Child', 'per_child_session', 130, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    // Teacher has a flat rate of 90 that must NOT be used in per_child_session mode —
    // and neither must the child's service price (200); pay comes from the salary type (130).
    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id, teacher_session_rate)
      VALUES ('PerChild Teacher', 'Teacher', 0, 0, 1, ?, ?, 90)
    `).run(now, salaryTypeId).lastInsertRowid)

    const childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Hana', 'Guardian', '0104', 'جلسة', 'جلسة', 200, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    // Enrollment: price 200 (must NOT drive pay), every weekday scheduled.
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, lesson_days, created_at, updated_at, synced)
      VALUES (?, 'جلسة', 'جلسة', 200, ?, '[0,1,2,3,4,5,6]', ?, ?, 0)
    `).run(childId, teacherId, now, now)
  })

  it('expected_total = remaining scheduled sessions (today onward) × the salary type\'s session rate, regardless of attendance', async () => {
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const month = String(today.getMonth() + 1)
    const year = today.getFullYear()
    // Every day is a lesson day, so for the month in progress the projection covers
    // today (inclusive) through the end of the month — elapsed days don't inflate it.
    const remainingDays = daysInMonth - today.getDate() + 1

    const result = await getExpected(null, { employee_id: teacherId, month, year })

    // No attendance recorded at all — the expected total must still be the remaining schedule
    // at the salary type's session rate (130), not the child's price (200), not the
    // teacher's flat rate (90), and not 0.
    expect(result.expected_total).toBe(remainingDays * 130)
    expect(result.actual_to_date).toBe(0)
    expect(result.projected_remaining).toBe(remainingDays * 130)
  })
})
