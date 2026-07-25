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

describe('End-to-end via the real IPC handlers a user actually drives: add teacher (own rate 30)', () => {
  let db: any
  let teacherId: number
  let childId: number
  let sessionId: number

  const addEmployee = getHandler('employees:add')
  const updateEmployee = getHandler('employees:update')
  const record = getHandler('attendance:record')

  beforeAll(async () => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    // Exactly what EmployeesList.tsx sends: teacher_session_rate as a Number, via employees:add.
    const emp = await addEmployee(null, { name: 'Ahmed', base_salary: 0, teacher_session_rate: 30 })
    teacherId = emp.id

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  it('employees:add actually persisted 30, not overwritten by anything', async () => {
    const row = db.prepare('SELECT teacher_session_rate FROM employees WHERE id = ?').get(teacherId) as any
    expect(row.teacher_session_rate).toBe(30)
  })

  it('the generated payment uses 30 (the teacher\'s own rate)', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended', teacher_status: 'present' }] })
    const row = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    expect(row.session_cost).toBe(30)
  })

  it('editing the employee via employees:update (e.g. re-saving the form unchanged) keeps 30', async () => {
    const updated = await updateEmployee(null, { id: teacherId, patch: { name: 'Ahmed', teacher_session_rate: 30 } })
    expect(updated.teacher_session_rate).toBe(30)
  })

  it('correcting the rate via employees:update immediately re-snapshots the still-pending payment, with no re-save of attendance needed', async () => {
    await updateEmployee(null, { id: teacherId, patch: { teacher_session_rate: 55 } })
    const row = db.prepare('SELECT session_cost, status FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    expect(row.status).toBe('pending')
    expect(row.session_cost).toBe(55)
  })

  it('does not touch an already-paid payment when the rate is corrected again', async () => {
    db.prepare(`UPDATE teacher_payments SET status = 'paid' WHERE teacher_id = ? AND child_id = ?`).run(teacherId, childId)
    await updateEmployee(null, { id: teacherId, patch: { teacher_session_rate: 999 } })
    const row = db.prepare('SELECT session_cost, status FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(teacherId, childId) as any
    expect(row.status).toBe('paid')
    expect(row.session_cost).toBe(55)
  })
})
