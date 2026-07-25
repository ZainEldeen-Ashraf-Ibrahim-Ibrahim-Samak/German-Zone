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

describe('Attendance lock (feature 007, FR-011/FR-012): existing row blocks non-admin direct writes, admin bypasses', () => {
  let db: any
  let childId: number
  let sessionId: number

  const record = getHandler('attendance:record')
  const getSheet = getHandler('attendance:getSheet')

  beforeAll(async () => {
    db = initDb()
    runMigrations(db)
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (2, 'emp', 'x', 'employee', 1, ?)`).run(now)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'حضانة', 'شهر', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  it('employee first save succeeds (no existing row yet)', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const res = await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'attended' }] })
    expect(res[0].locked).toBeFalsy()
    expect(res[0].status).toBe('attended')
  })

  it('employee direct re-edit of the same row is blocked and marked locked', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    const res = await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'absent_excused' }] })
    expect(res[0].locked).toBe(true)
    // Value must remain unchanged
    expect(res[0].status).toBe('attended')
  })

  it('attendance:getSheet reports locked: true for the existing row', async () => {
    const sheet = await getSheet(null, { session_id: sessionId })
    const row = sheet.find((r: any) => r.child_id === childId)
    expect(row.locked).toBe(true)
  })

  it('admin direct re-edit of the same row succeeds and is audit-logged', async () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const res = await record(null, { session_id: sessionId, records: [{ child_id: childId, status: 'absent_unexcused' }] })
    expect(res[0].locked).toBeFalsy()
    expect(res[0].status).toBe('absent_unexcused')

    const logRows = db.prepare('SELECT * FROM attendance_audit_log WHERE attendance_record_id = ?').all(res[0].id)
    expect(logRows.length).toBe(1)
    expect(logRows[0].old_status).toBe('attended')
    expect(logRows[0].new_status).toBe('absent_unexcused')
    expect(logRows[0].changed_by).toBe(1)
    expect(logRows[0].approved_by).toBe(1)
  })
})
