import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/attendanceIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('A child with more than one teacher gets a separate attendance/payment row per teacher', () => {
  let db: any
  let ahmedId: number
  let saraId: number
  let childId: number
  let sessionId: number

  const getSheet = getHandler('attendance:getSheet')
  const record = getHandler('attendance:record')

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (1, 'admin', 'x', 'admin', 1, ?)`).run(now)

    const addEmp = (name: string, rate: number) => Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, teacher_session_rate)
      VALUES (?, 'Teacher', 0, 0, 1, ?, ?)
    `).run(name, now, rate).lastInsertRowid)
    ahmedId = addEmp('Ahmed', 150)
    saraId = addEmp('Sara', 250)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    // Two service enrollments for the same child, each with a different teacher.
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, created_at, updated_at)
      VALUES (?, 'Speech Therapy', 'جلسة', 100, ?, ?, ?)
    `).run(childId, ahmedId, now, now)
    db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, teacher_id, created_at, updated_at)
      VALUES (?, 'Occupational Therapy', 'جلسة', 100, ?, ?, ?)
    `).run(childId, saraId, now, now)

    sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-04', ?, ?)
    `).run(now, now).lastInsertRowid)
  })

  it('attendance:getSheet shows two rows for the child — one per teacher', async () => {
    const sheet = await getSheet(null, { session_id: sessionId })
    const childRows = sheet.filter((r: any) => r.child_id === childId)
    expect(childRows.length).toBe(2)
    const teacherIds = childRows.map((r: any) => r.teacher_id).sort()
    expect(teacherIds).toEqual([ahmedId, saraId].sort())
  })

  it('recording attendance for one teacher does not affect the other teacher\'s row', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, teacher_id: ahmedId, status: 'attended', teacher_status: 'present' }] })

    const sheet = await getSheet(null, { session_id: sessionId })
    const ahmedRow = sheet.find((r: any) => r.child_id === childId && r.teacher_id === ahmedId)
    const saraRow = sheet.find((r: any) => r.child_id === childId && r.teacher_id === saraId)

    expect(ahmedRow.status).toBe('attended')
    expect(ahmedRow.payment.generated).toBe(true)
    expect(ahmedRow.payment.amount).toBe(150)

    expect(saraRow.status).toBeNull()
    expect(saraRow.payment.generated).toBe(false)
  })

  it('recording attendance for both teachers generates two independent payments', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, teacher_id: saraId, status: 'attended', teacher_status: 'present' }] })

    const ahmedPayment = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(ahmedId, childId) as any
    const saraPayment = db.prepare('SELECT * FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(saraId, childId) as any

    expect(ahmedPayment.session_cost).toBe(150)
    expect(saraPayment.session_cost).toBe(250)
  })

  it('voiding one teacher\'s payment (via a disqualifying edit) does not touch the other teacher\'s payment', async () => {
    await record(null, { session_id: sessionId, records: [{ child_id: childId, teacher_id: ahmedId, status: 'absent_excused', teacher_status: 'present' }] })

    const ahmedPayment = db.prepare('SELECT status FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(ahmedId, childId) as any
    const saraPayment = db.prepare('SELECT status FROM teacher_payments WHERE teacher_id = ? AND child_id = ?').get(saraId, childId) as any

    expect(ahmedPayment.status).toBe('void')
    expect(saraPayment.status).toBe('pending')
  })
})
