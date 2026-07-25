import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb, getDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/attendanceIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Attendance-based teacher payments — duplicate protection & void/requalify (US5/US6)', () => {
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
      VALUES ('Ahmed', 'Teacher', 0, 0, 1, ?, 150)
    `).run(now).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at)
      VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  const record = getHandler('attendance:record')

  it('generates exactly one pending payment when teacher present + child attended', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').all(teacherId, childId)
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].session_cost).toBe(150)
  })

  it('does not create a duplicate when the same attendance is saved again unchanged', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').all(teacherId, childId)
    expect(rows.length).toBe(1)
  })

  it('voids the payment (does not delete it) when the edit disqualifies it', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'absent_excused', teacher_status: 'present' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').all(teacherId, childId)
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('void')
  })

  it('requalifies a void payment back to pending with a fresh snapshot, still exactly one row', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').all(teacherId, childId)
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('pending')
  })

  it('never auto-mutates a paid payment', async () => {
    db.prepare(`UPDATE teacher_payments SET status = 'paid' WHERE teacher_id = ? AND child_id = ?`).run(teacherId, childId)
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'absent_excused', teacher_status: 'present' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').all(teacherId, childId)
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('paid')
  })

  it('does not generate a payment when the teacher is absent, even if the child attended', async () => {
    const otherSession = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-06', ?, ?)
    `).run(new Date().toISOString(), new Date().toISOString()).lastInsertRowid)
    await record(null, { session_id: otherSession, records: [{ child_id: childId, status: 'attended', teacher_status: 'absent' }] })
    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ? AND attendance_date = ?').all(teacherId, childId, '2026-07-06')
    expect(rows.length).toBe(0)
  })

  it('never generates a payment for a teacher who has no per-session rate configured by the admin and no org-wide default set', async () => {
    const now = new Date().toISOString()
    const noRateTeacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at)
      VALUES ('Unrated Teacher', 'Teacher', 0, 0, 1, ?)
    `).run(now).lastInsertRowid)
    const noRateChildId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Layla', 'Guardian', '0101', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, noRateTeacherId).lastInsertRowid)
    const noRateSession = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-08', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: noRateSession, records: [{ child_id: noRateChildId, status: 'attended', teacher_status: 'present' }] })

    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').all(noRateTeacherId)
    expect(rows.length).toBe(0)
  })

  it('re-snapshots session_cost on a still-pending payment when the teacher rate is corrected afterward', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Session (Fallback 40)', 'per_session_fixed', 40, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    const teacher = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id)
      VALUES ('Corrected Rate Teacher', 'Teacher', 0, 0, 1, ?, ?)
    `).run(now, salaryTypeId).lastInsertRowid)
    const child = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Omar', 'Guardian', '0103', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacher).lastInsertRowid)
    const session = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-10', ?, ?)
    `).run(now, now).lastInsertRowid)

    // First save: teacher has no rate of their own yet, so their assigned salary type's
    // session_rate (40) applies.
    await record(null, { session_id: session, records: [{ child_id: child, status: 'attended', teacher_status: 'present' }] })
    let rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').all(teacher)
    expect(rows[0].session_cost).toBe(40)

    // Admin now sets the teacher's own rate to 30. Re-saving the same (still-pending) attendance
    // must pick up 30, not keep the stale 40 snapshot.
    db.prepare(`UPDATE employees SET teacher_session_rate = 30 WHERE id = ?`).run(teacher)
    await record(null, { session_id: session, records: [{ child_id: child, status: 'attended', teacher_status: 'present' }] })
    rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').all(teacher)
    expect(rows.length).toBe(1)
    expect(rows[0].session_cost).toBe(30)
  })

  it('does NOT re-snapshot a payment that has already been marked paid, even if the rate changes', async () => {
    db.prepare(`UPDATE teacher_payments SET status = 'paid' WHERE teacher_id = ? AND child_id = ?`).run(teacherId, childId)
    const before = db.prepare('SELECT session_cost FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    db.prepare(`UPDATE employees SET teacher_session_rate = 999 WHERE id = ?`).run(teacherId)
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const after = db.prepare('SELECT session_cost, status FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    expect(after.status).toBe('paid')
    expect(after.session_cost).toBe(before.session_cost)
  })

  it('falls back to the employee\'s assigned salary type session rate when the teacher has no rate of their own', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Session (Fallback 120)', 'per_session_fixed', 120, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    const noRateTeacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id)
      VALUES ('Fallback Teacher', 'Teacher', 0, 0, 1, ?, ?)
    `).run(now, salaryTypeId).lastInsertRowid)
    const noRateChildId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Nour', 'Guardian', '0102', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, noRateTeacherId).lastInsertRowid)
    const session = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-09', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: session, records: [{ child_id: noRateChildId, status: 'attended', teacher_status: 'present' }] })

    const rows = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').all(noRateTeacherId)
    expect(rows.length).toBe(1)
    expect(rows[0].session_cost).toBe(120)
  })

  it('per_child_session mode pays the salary type\'s own session rate when no per-child override is set', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Child', 'per_child_session', 130, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    // Teacher also has a flat rate of 90 and the child's service price is 200 — the salary
    // type's own session rate (130) must win in per_child_session mode.
    const perChildTeacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id, teacher_session_rate)
      VALUES ('PerChild Teacher', 'Teacher', 0, 0, 1, ?, ?, 90)
    `).run(now, salaryTypeId).lastInsertRowid)
    const perChildChildId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Hana', 'Guardian', '0104', 'جلسة', 'جلسة', 200, '2026-01-01', ?, ?, ?)
    `).run(now, now, perChildTeacherId).lastInsertRowid)
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, created_at, updated_at, synced)
      VALUES (?, 'جلسة', 'جلسة', 200, ?, ?, ?, 0)
    `).run(perChildChildId, perChildTeacherId, now, now)
    const session = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-12', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: session, records: [{ child_id: perChildChildId, status: 'attended', teacher_status: 'present' }] })

    const row = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').get(perChildTeacherId) as any
    expect(row.session_cost).toBe(130)
  })

  it('per_child_session mode never uses the teacher\'s flat rate nor the child\'s price — pays the salary type rate even without a (child, teacher) enrollment row', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Child Strict', 'per_child_session', 110, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    // Teacher has a flat rate of 75, the child's own price is 180, and there is NO
    // child_services row linking them to this child (attendance came from the child-level
    // teacher field). Pay must come from the salary type's session rate (110) — not the
    // teacher's 75 and not the child's 180.
    const strictTeacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id, teacher_session_rate)
      VALUES ('Strict PerChild Teacher', 'Teacher', 0, 0, 1, ?, ?, 75)
    `).run(now, salaryTypeId).lastInsertRowid)
    const strictChildId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Malak', 'Guardian', '0105', 'جلسة', 'جلسة', 180, '2026-01-01', ?, ?, ?)
    `).run(now, now, strictTeacherId).lastInsertRowid)
    const session = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-13', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: session, records: [{ child_id: strictChildId, status: 'attended', teacher_status: 'present' }] })

    const row = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').get(strictTeacherId) as any
    expect(row.session_cost).toBe(110)
  })

  it('per_session_pct mode pays a percentage OF the child\'s service price — not a hardcoded 100 EGP base', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_pct, created_at, updated_at, synced)
      VALUES ('Pct Of Child Price', 'per_session_pct', 0.3, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    const pctTeacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, salary_type_override_id)
      VALUES ('Pct Teacher', 'Teacher', 0, 0, 1, ?, ?)
    `).run(now, salaryTypeId).lastInsertRowid)
    const pctChildId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Yousef', 'Guardian', '0106', 'جلسة', 'جلسة', 250, '2026-01-01', ?, ?, ?)
    `).run(now, now, pctTeacherId).lastInsertRowid)
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, created_at, updated_at, synced)
      VALUES (?, 'جلسة', 'جلسة', 250, ?, ?, ?, 0)
    `).run(pctChildId, pctTeacherId, now, now)
    const session = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-14', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: session, records: [{ child_id: pctChildId, status: 'attended', teacher_status: 'present' }] })

    // 30% of the child's 250 EGP service price = 75 — NOT 0.3 × 100 = 30 from the old formula.
    const row = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ?').get(pctTeacherId) as any
    expect(row.session_cost).toBe(75)
  })

  it('a per-child rate override (salary type per child) wins over the teacher\'s own flat rate', async () => {
    // teacherId has a flat teacher_session_rate of 150 (set in the outer beforeAll). Give THIS
    // child its own child_services override of 200 and confirm the payment uses 200, not 150.
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, teacher_session_rate, created_at, updated_at, synced)
      VALUES (?, 'جلسة', 'جلسة', 100, ?, 200, ?, ?, 0)
    `).run(childId, teacherId, now, now)

    const otherSession = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-11', ?, ?)
    `).run(now, now).lastInsertRowid)

    await record(null, { session_id: otherSession, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })

    const row = db.prepare(`
      SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ? AND attendance_date = ?
    `).get(teacherId, childId, '2026-07-11') as any
    expect(row.session_cost).toBe(200)
  })
})
