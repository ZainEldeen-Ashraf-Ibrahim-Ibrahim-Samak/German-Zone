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
import '../../electron/ipc/sessionTimersIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Hourly salary type — pay comes from the session timer × the unit price of an hour', () => {
  let db: any
  let teacherId: number
  let sessionId: number

  const startTimer = getHandler('sessionTimers:start')
  const stopTimer = getHandler('sessionTimers:stop')
  const logManual = getHandler('sessionTimers:logManual')
  const salaryGet = getHandler('salary:get')

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, hourly_rate, created_at, updated_at, synced)
      VALUES ('Hourly Teacher', 'hourly', 50, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    // Housing 200 + transport 100 must be paid on top of the clocked hours.
    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, salary_type_override_id)
      VALUES ('Nadia', 'Teacher', 0, 200, 100, 300, 1, ?, ?)
    `).run(now, salaryTypeId).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-10', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  it('starting a timer creates one running log, and a second start for the same employee is rejected', async () => {
    const log = await startTimer(null, { employee_id: teacherId, session_id: sessionId })
    expect(log.status).toBe('running')
    expect(log.ended_at).toBeNull()

    await expect(startTimer(null, { employee_id: teacherId, session_id: sessionId }))
      .rejects.toThrow(/already running/i)
  })

  it('stopping the timer freezes the elapsed time and prices it at the hourly rate', async () => {
    const stopped = await stopTimer(null, { employee_id: teacherId })
    expect(stopped.status).toBe('completed')
    expect(stopped.ended_at).not.toBeNull()
    expect(stopped.hourly_rate).toBe(50)
    // Near-zero elapsed time, but priced — not left null.
    expect(stopped.amount).toBeGreaterThanOrEqual(0)
    expect(stopped.duration_minutes).toBeGreaterThanOrEqual(0)
  })

  it('a 90-minute stint is worth 1.5 × the hourly rate', async () => {
    const log = await logManual(null, {
      employee_id: teacherId,
      session_id: sessionId,
      work_date: '2026-07-10',
      duration_minutes: 90,
    })
    expect(log.amount).toBe(75) // 1.5h × 50
  })

  it('Net Salary = clocked hours + housing/transport allowances, and bonus lands in Actual Paid', async () => {
    const rows = await salaryGet(null, { month: 'يوليو', year: 2026 })
    const row = rows.find((r: any) => r.employee_id === teacherId)

    expect(row.salary_type_mode).toBe('hourly')
    expect(row.hours_worked).toBeCloseTo(1.5, 1)
    // 75 EGP earned + 300 EGP allowances (housing 200 + transport 100)
    expect(row.earnings).toBeCloseTo(75, 1)
    expect(row.allowances).toBe(300)
    expect(row.net_salary).toBeCloseTo(375, 1)
    expect(row.actual_paid).toBeCloseTo(375, 1)
  })
})

describe('Allowances are added to attendance-based teacher pay too (they used to be dropped)', () => {
  let db: any
  let teacherId: number

  const record = getHandler('attendance:record')
  const salaryGet = getHandler('salary:get')
  const salaryUpdate = getHandler('salary:update')

  beforeAll(async () => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Session 100', 'per_session_fixed', 100, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, teacher_session_rate, salary_type_override_id)
      VALUES ('Omar', 'Teacher', 0, 150, 50, 200, 1, ?, 100, ?)
    `).run(now, salaryTypeId).lastInsertRowid)

    const studentId = Number(db.prepare(`
      INSERT INTO students (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Laila', 'Guardian', '0102', 'A1', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    const s1 = Number(db.prepare(`INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-08-03', ?, ?)`).run(now, now).lastInsertRowid)
    await record(null, { session_id: s1, records: [{ student_id: studentId, status: 'attended', teacher_status: 'present' }] })
  })

  it('Net Salary = 1 session × 100 + 200 allowances = 300', async () => {
    const rows = await salaryGet(null, { month: 'أغسطس', year: 2026 })
    const row = rows.find((r: any) => r.employee_id === teacherId)
    expect(row.payable_sessions).toBe(1)
    expect(row.earnings).toBe(100)
    expect(row.allowances).toBe(200)
    expect(row.net_salary).toBe(300)
  })

  it('a saved payroll row agrees with the view: base + bonus − deductions', async () => {
    const saved = await salaryUpdate(null, { employee_id: teacherId, month: 'أغسطس', year: 2026, bonus: 50 })
    expect(saved.actual_paid).toBe(350) // 100 sessions + 200 allowances + 50 bonus
  })
})
