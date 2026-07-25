import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, getDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__attnHandlers = handlers
  return {
    ipcMain: { handle: (ch: string, fn: Function) => { handlers[ch] = fn } },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/attendanceIPC.js'
import '../../electron/ipc/sessionsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('attendance IPC contract', () => {
  const h = () => (globalThis as any).__attnHandlers
  const sessH = () => (globalThis as any).__attnHandlers
  let sessionId: number
  let childId: number

  beforeAll(async () => {
    const db = initDb()
    runMigrations(db)

    // Seed admin user so recorded_by FK resolves
    const db2 = getDb()
    const now = new Date().toISOString()
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password, role, is_active, created_at) VALUES (1,'admin','hash','admin',1,?)`).run(now)

    const res = db.prepare(`INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, is_active, created_at, updated_at, synced) VALUES (?,?,?,?,?,?,?,1,?,?,0)`)
      .run('Test Child', 'Guardian', '01012345678', 'حضانة', 'شهر', 1000, '2026-06-01', now, now)
    childId = Number(res.lastInsertRowid)

    // Seed a session (direct DB since sessionsIPC has separate handler namespace)
    const sres = db.prepare(`INSERT INTO scheduled_sessions (session_date, group_name, created_at, updated_at, synced) VALUES (?,?,?,?,0)`)
      .run('2026-06-15', 'Test Group', now, now)
    sessionId = Number(sres.lastInsertRowid)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  it('attendance:getSheet returns enrolled children', async () => {
    const sheet = await h()['attendance:getSheet']({}, { session_id: sessionId })
    expect(Array.isArray(sheet)).toBe(true)
    const child = sheet.find((r: any) => r.child_id === childId)
    expect(child).toBeTruthy()
  })

  it('attendance:record bulk upserts attendance', async () => {
    const results = await h()['attendance:record']({}, {
      session_id: sessionId,
      records: [{ child_id: childId, teacher_id: null, status: 'attended' }]
    })
    expect(Array.isArray(results)).toBe(true)
    expect(results[0].status).toBe('attended')
  })

  it('attendance:record auto-links the attending child\'s teacher to the session', async () => {
    const db = getDb()
    const now = new Date().toISOString()
    // Seed a teacher and assign the child to them
    const emp = db.prepare(
      "INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, updated_at) VALUES ('AutoLink Teacher', 'teacher', 0, 0, 0, 0, 1, ?, ?)"
    ).run(now, now)
    const teacherId = Number(emp.lastInsertRowid)
    db.prepare('UPDATE children SET teacher_id = ? WHERE id = ?').run(teacherId, childId)

    // Fresh session so we assert on a clean session_teachers set
    const sres = db.prepare(
      "INSERT INTO scheduled_sessions (session_date, created_at, updated_at, synced) VALUES ('2026-09-01', ?, ?, 0)"
    ).run(now, now)
    const sid = Number(sres.lastInsertRowid)

    await h()['attendance:record']({}, { session_id: sid, records: [{ child_id: childId, status: 'attended' }] })

    const linked = db.prepare('SELECT employee_id FROM session_teachers WHERE session_id = ?').all(sid) as { employee_id: number }[]
    expect(linked.map((r) => r.employee_id)).toContain(teacherId)
  })

  it('attendance:record does NOT auto-link teacher for excused absence only', async () => {
    const db = getDb()
    const now = new Date().toISOString()
    const sres = db.prepare(
      "INSERT INTO scheduled_sessions (session_date, created_at, updated_at, synced) VALUES ('2026-09-02', ?, ?, 0)"
    ).run(now, now)
    const sid = Number(sres.lastInsertRowid)
    await h()['attendance:record']({}, { session_id: sid, records: [{ child_id: childId, status: 'absent_excused' }] })
    const linked = db.prepare('SELECT COUNT(*) as c FROM session_teachers WHERE session_id = ?').get(sid) as { c: number }
    expect(linked.c).toBe(0)
  })

  it('attendance:record overwrites with absent_excused', async () => {
    await h()['attendance:record']({}, {
      session_id: sessionId,
      // Explicit teacher_id: null targets the same no-teacher row created above — childId's
      // teacher_id was mutated by the auto-link test in between, so relying on the legacy
      // children.teacher_id fallback here would resolve a *different* teacher and create a
      // second row instead of updating this one (a child can now have more than one teacher).
      records: [{ child_id: childId, teacher_id: null, status: 'absent_excused', excuse_notes: 'Sick' }]
    })
    const sheet = await h()['attendance:getSheet']({}, { session_id: sessionId })
    const rec = sheet.find((r: any) => r.child_id === childId)
    expect(rec.status).toBe('absent_excused')
    expect(rec.excuse_notes).toBe('Sick')
  })

  it('attendance:record rejects invalid status', async () => {
    await expect(h()['attendance:record']({}, {
      session_id: sessionId,
      records: [{ child_id: childId, status: 'invalid_status' }]
    })).rejects.toThrow()
  })

  it('attendance:delete removes a recorded status', async () => {
    await h()['attendance:record']({}, { session_id: sessionId, records: [{ child_id: childId, teacher_id: null, status: 'attended' }] })
    const res = await h()['attendance:delete']({}, { session_id: sessionId, child_ids: [{ child_id: childId, teacher_id: null }] })
    expect(res.ok).toBe(true)
    expect(res.deleted).toBe(1)
    const sheet = await h()['attendance:getSheet']({}, { session_id: sessionId })
    const rec = sheet.find((r: any) => r.child_id === childId)
    expect(rec.status).toBeNull()
  })

  it('attendance:delete with empty child_ids is a no-op', async () => {
    const res = await h()['attendance:delete']({}, { session_id: sessionId, child_ids: [] })
    expect(res).toEqual({ ok: true, deleted: 0, requested: 0 })
  })

  it('attendance:getConflicts returns array', async () => {
    const conflicts = await h()['attendance:getConflicts']({})
    expect(Array.isArray(conflicts)).toBe(true)
  })

  it('attendance:getSheet blocked for anonymous', async () => {
    setCurrentUser(null)
    await expect(h()['attendance:getSheet']({}, { session_id: sessionId })).rejects.toThrow('UNAUTHORIZED')
  })
})
