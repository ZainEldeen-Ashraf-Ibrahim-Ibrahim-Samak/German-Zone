import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, getDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__sessHandlers = handlers
  return {
    ipcMain: { handle: (ch: string, fn: Function) => { handlers[ch] = fn } },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/sessionsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('sessions IPC contract', () => {
  const h = () => (globalThis as any).__sessHandlers

  beforeAll(async () => {
    const db = initDb()
    runMigrations(db)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  it('sessions:list returns array', async () => {
    const rows = await h()['sessions:list']({})
    expect(Array.isArray(rows)).toBe(true)
  })

  it('sessions:add creates a session', async () => {
    const sess = await h()['sessions:add']({}, { session_date: '2026-06-15', group_name: 'Group A' })
    expect(sess.session_date).toBe('2026-06-15')
    expect(sess.id).toBeTruthy()
  })

  it('sessions:list filters by date range', async () => {
    await h()['sessions:add']({}, { session_date: '2026-07-10' })
    const rows = await h()['sessions:list']({}, { from: '2026-06-01', to: '2026-06-30' })
    expect(rows.every((r: any) => r.session_date <= '2026-06-30')).toBe(true)
  })

  it('sessions:update changes group_name', async () => {
    const sess = await h()['sessions:add']({}, { session_date: '2026-06-20' })
    const updated = await h()['sessions:update']({}, { id: sess.id, patch: { group_name: 'Updated Group' } })
    expect(updated.group_name).toBe('Updated Group')
  })

  it('sessions:delete removes session without attendance', async () => {
    const sess = await h()['sessions:add']({}, { session_date: '2026-06-25' })
    const result = await h()['sessions:delete']({}, { id: sess.id })
    expect(result.ok).toBe(true)
  })

  it('sessions:delete cascades attendance records', async () => {
    const db = getDb()
    const now = new Date().toISOString()
    const child = db.prepare(
      "INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, is_active, created_at, updated_at) VALUES ('Cascade Kid', 'G', '0', 'svc', 'u', 0, ?, 1, ?, ?)"
    ).run(now, now, now)
    const sess = await h()['sessions:add']({}, { session_date: '2026-06-26' })
    db.prepare(
      "INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?, ?, 'attended', ?, ?)"
    ).run(sess.id, Number(child.lastInsertRowid), now, now)

    const result = await h()['sessions:delete']({}, { id: sess.id })
    expect(result.ok).toBe(true)
    expect(result.deleted_attendance).toBe(1)
    const remaining = db.prepare('SELECT COUNT(*) as c FROM attendance_records WHERE session_id = ?').get(sess.id) as { c: number }
    expect(remaining.c).toBe(0)
  })

  describe('sessions:salaryCredit', () => {
    let employeeId: number
    const now = new Date().toISOString()

    beforeAll(() => {
      const db = getDb()
      const st = db.prepare(
        "INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at) VALUES ('PerSession150', 'per_session_fixed', 150, ?, ?)"
      ).run(now, now)
      const emp = db.prepare(
        "INSERT INTO employees (name, role, salary_type_override_id, base_salary, housing, transport, net_salary, is_active, created_at, updated_at) VALUES ('Teacher Ahmed', 'teacher', ?, 0, 0, 0, 0, 1, ?, ?)"
      ).run(Number(st.lastInsertRowid), now, now)
      employeeId = Number(emp.lastInsertRowid)
    })

    const makeSessionWithChild = async (date: string) => {
      const db = getDb()
      const sess = await h()['sessions:add']({}, { session_date: date, employee_ids: [employeeId] })
      const child = db.prepare(
        "INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, is_active, created_at, updated_at) VALUES ('Kid', 'G', '0', 'svc', 'u', 0, ?, 1, ?, ?)"
      ).run(now, now, now)
      return { sessionId: sess.id, childId: Number(child.lastInsertRowid) }
    }

    it('credits per-session salary when a child attended', async () => {
      const { sessionId, childId } = await makeSessionWithChild('2026-08-01')
      getDb().prepare(
        "INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?, ?, 'attended', ?, ?)"
      ).run(sessionId, childId, now, now)
      const res = await h()['sessions:salaryCredit']({}, { session_id: sessionId })
      expect(res.payable).toBe(true)
      expect(res.credits).toEqual([{ employee_id: employeeId, name: 'Teacher Ahmed', amount: 150 }])
    })

    it('is not payable when the only attendance is excused, but still lists the teacher', async () => {
      const { sessionId, childId } = await makeSessionWithChild('2026-08-02')
      getDb().prepare(
        "INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?, ?, 'absent_excused', ?, ?)"
      ).run(sessionId, childId, now, now)
      const res = await h()['sessions:salaryCredit']({}, { session_id: sessionId })
      expect(res.payable).toBe(false)
      expect(res.hasTeachers).toBe(true)
      // credits lists per-session teachers regardless of payability (for the live banner)
      expect(res.credits).toEqual([{ employee_id: employeeId, name: 'Teacher Ahmed', amount: 150 }])
    })

    it('reports hasTeachers=false when no teacher is assigned', async () => {
      const sess = await h()['sessions:add']({}, { session_date: '2026-08-04' })
      const res = await h()['sessions:salaryCredit']({}, { session_id: sess.id })
      expect(res.hasTeachers).toBe(false)
      expect(res.credits).toEqual([])
    })

    it('credits when a child is absent without excuse', async () => {
      const { sessionId, childId } = await makeSessionWithChild('2026-08-03')
      getDb().prepare(
        "INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?, ?, 'absent_unexcused', ?, ?)"
      ).run(sessionId, childId, now, now)
      const res = await h()['sessions:salaryCredit']({}, { session_id: sessionId })
      expect(res.payable).toBe(true)
      expect(res.credits[0].amount).toBe(150)
    })
  })

  it('sessions:proRateCalc with mid-month reg_date', async () => {
    const result = await h()['sessions:proRateCalc']({}, { reg_date: '2026-06-20', price_per_session: 100 })
    expect(result).toHaveProperty('prorated_amount')
    expect(result).toHaveProperty('days_remaining')
    expect(result.prorated_amount).toBeGreaterThan(0)
  })

  it('sessions:proRateCalc on day 1 returns full price', async () => {
    const result = await h()['sessions:proRateCalc']({}, { reg_date: '2026-06-01', price_per_session: 300 })
    expect(result.prorated_amount).toBe(300)
  })

  it('sessions:list blocked for anonymous', async () => {
    setCurrentUser(null)
    await expect(h()['sessions:list']({})).rejects.toThrow('UNAUTHORIZED')
  })
})
