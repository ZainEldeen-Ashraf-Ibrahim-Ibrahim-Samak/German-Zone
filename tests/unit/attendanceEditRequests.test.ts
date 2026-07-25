import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/notificationsIPC.js'
import '../../electron/ipc/attendanceIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Attendance Edit Request lifecycle (feature 007, FR-014…FR-020)', () => {
  let db: any
  let teacherId: number
  let childId: number
  let sessionId: number
  let attendanceRecordId: number

  const record = getHandler('attendance:record')
  const requestEdit = getHandler('attendance:requestEdit')
  const listEditRequests = getHandler('attendance:listEditRequests')
  const decideEditRequest = getHandler('attendance:decideEditRequest')
  const getAuditLog = getHandler('attendance:getAuditLog')

  beforeAll(async () => {
    db = initDb()
    runMigrations(db)
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (2, 'emp', 'x', 'employee', 1, ?)`).run(now)
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Session (50)', 'per_session_fixed', 50, ?, ?, 0)
    `).run(now, now).lastInsertRowid)

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, updated_at, synced, salary_type_override_id)
      VALUES ('Ahmed', 'teacher', 0, 0, 0, 0, 1, ?, ?, 0, ?)
    `).run(now, now, salaryTypeId).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, teacher_id)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?, ?)
    `).run(now, now, teacherId).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)

    // Employee saves attendance: teacher present, child absent_excused → NOT payable.
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const res = await record(null, {
      session_id: sessionId,
      records: [{ child_id: childId, teacher_id: teacherId, status: 'absent_excused', teacher_status: 'present' }]
    })
    attendanceRecordId = res[0].id
  })

  it('employee submits an edit request; it is pending and admin is notified', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const req = await requestEdit(null, {
      attendance_record_id: attendanceRecordId,
      requested_status: 'attended',
      requested_teacher_status: 'present',
      reason: 'Marked absent by mistake'
    })
    expect(req.status).toBe('pending')
    expect(req.requested_by).toBe(2)

    const notifications = db.prepare(`SELECT * FROM notifications WHERE user_id = 1 AND type = 'edit_request_submitted'`).all()
    expect(notifications.length).toBe(1)
  })

  it('a second concurrent pending request for the same record is rejected', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    await expect(requestEdit(null, {
      attendance_record_id: attendanceRecordId,
      requested_status: 'attended',
      reason: 'trying again'
    })).rejects.toThrow(/pending edit request already exists/i)
  })

  it('employee sees only their own requests; admin sees all', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const own = await listEditRequests(null, {})
    expect(own.length).toBe(1)

    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const all = await listEditRequests(null, {})
    expect(all.length).toBe(1)
  })

  it('non-admin cannot decide a request', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const pending = (await listEditRequests(null, {}))[0]
    await expect(decideEditRequest(null, { id: pending.id, decision: 'approve' })).rejects.toThrow()
  })

  it('admin approves: attendance updates, payment generated (was not payable, now is), audit-logged, requester notified', async () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const pending = (await listEditRequests(null, { status: 'pending' }))[0]

    const decided = await decideEditRequest(null, { id: pending.id, decision: 'approve' })
    expect(decided.status).toBe('approved')

    const updatedRecord = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(attendanceRecordId) as any
    expect(updatedRecord.status).toBe('attended')

    const payment = db.prepare(
      `SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ? AND attendance_date = '2026-07-04'`
    ).get(teacherId, childId) as any
    expect(payment.status).toBe('pending')
    expect(payment.session_cost).toBe(50)

    const auditRows = await getAuditLog(null, { attendance_record_id: attendanceRecordId })
    expect(auditRows.length).toBe(1)
    expect(auditRows[0].old_status).toBe('absent_excused')
    expect(auditRows[0].new_status).toBe('attended')
    expect(auditRows[0].changed_by).toBe(2)
    expect(auditRows[0].approved_by).toBe(1)
    expect(auditRows[0].edit_request_id).toBe(pending.id)

    const empNotifications = db.prepare(`SELECT * FROM notifications WHERE user_id = 2 AND type = 'edit_request_approved'`).all()
    expect(empNotifications.length).toBe(1)
  })

  it('approving (or rejecting) an already-decided request fails (concurrent-decision race guard)', async () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const decidedReq = (await listEditRequests(null, { status: 'approved' }))[0]
    await expect(decideEditRequest(null, { id: decidedReq.id, decision: 'reject' })).rejects.toThrow(/already been decided/i)
  })

  it('rejecting a pending request leaves attendance/payment unchanged and notifies the requester', async () => {
    // Fresh record + request for a clean reject scenario.
    const now = new Date().toISOString()
    const session2 = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-05', ?, ?)
    `).run(now, now).lastInsertRowid)

    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const res = await record(null, {
      session_id: session2,
      records: [{ child_id: childId, teacher_id: teacherId, status: 'attended', teacher_status: 'present' }]
    })
    const recId = res[0].id

    const req = await requestEdit(null, {
      attendance_record_id: recId,
      requested_status: 'absent_excused',
      reason: 'test reject'
    })

    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const decided = await decideEditRequest(null, { id: req.id, decision: 'reject', decision_notes: 'not convincing' })
    expect(decided.status).toBe('rejected')

    const unchangedRecord = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recId) as any
    expect(unchangedRecord.status).toBe('attended')

    const auditRows = db.prepare('SELECT * FROM attendance_audit_log WHERE attendance_record_id = ?').all(recId)
    expect(auditRows.length).toBe(0)

    const empNotifications = db.prepare(`SELECT * FROM notifications WHERE user_id = 2 AND type = 'edit_request_rejected'`).all()
    expect(empNotifications.length).toBe(1)
  })

  it('employee attendance:delete does NOT delete — it files a pending \'deleted\' request and notifies admins', async () => {
    const deleteAttendance = getHandler('attendance:delete')
    const now = new Date().toISOString()
    const session3 = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-06', ?, ?)
    `).run(now, now).lastInsertRowid)

    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const res = await record(null, {
      session_id: session3,
      records: [{ child_id: childId, teacher_id: teacherId, status: 'attended', teacher_status: 'present' }]
    })
    const recId = res[0].id

    const delRes = await deleteAttendance(null, { session_id: session3, child_ids: [{ child_id: childId, teacher_id: teacherId }] })
    expect(delRes.deleted).toBe(0)
    expect(delRes.requested).toBe(1)

    // Record still exists; a pending 'deleted' request was filed instead.
    expect(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recId)).toBeTruthy()
    const req = db.prepare(`SELECT * FROM attendance_edit_requests WHERE attendance_record_id = ? AND status = 'pending'`).get(recId) as any
    expect(req.requested_status).toBe('deleted')
    expect(req.requested_by).toBe(2)

    // Approving the request actually deletes the record and voids/removes its pending payment.
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const decided = await decideEditRequest(null, { id: req.id, decision: 'approve' })
    expect(decided.status).toBe('approved')
    expect(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recId)).toBeFalsy()
    const paid = db.prepare(`SELECT * FROM teacher_payments WHERE attendance_record_id = ? AND status IN ('pending','paid')`).get(recId)
    expect(paid).toBeFalsy()
  })

  it('admin attendance:delete still deletes immediately without any request', async () => {
    const deleteAttendance = getHandler('attendance:delete')
    const now = new Date().toISOString()
    const session4 = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-07', ?, ?)
    `).run(now, now).lastInsertRowid)

    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const res = await record(null, {
      session_id: session4,
      records: [{ child_id: childId, teacher_id: teacherId, status: 'attended', teacher_status: 'present' }]
    })
    const recId = res[0].id

    const delRes = await deleteAttendance(null, { session_id: session4, child_ids: [{ child_id: childId, teacher_id: teacherId }] })
    expect(delRes.deleted).toBe(1)
    expect(delRes.requested).toBe(0)
    expect(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recId)).toBeFalsy()
  })
})
