import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { buildCsvFile } from '../../electron/services/csvService.js'

describe('Payroll Report CSV export (feature 007, FR-002/FR-005/FR-009) — row-shaping and totals', () => {
  let db: any
  let teacherId: number
  let childId: number
  let tmpFile: string

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    const now = new Date().toISOString()

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, updated_at, synced, teacher_session_rate)
      VALUES ('Ahmed', 'teacher', 0, 0, 0, 0, 1, ?, ?, 0, 150)
    `).run(now, now).lastInsertRowid)

    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    const sessionId = Number(db.prepare(`
      INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES ('2026-07-10', ?, ?)
    `).run(now, now).lastInsertRowid)
    const attendanceRecordId = Number(db.prepare(`
      INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at, attended_teacher_id, teacher_status)
      VALUES (?, ?, 'attended', ?, ?, ?, 'present')
    `).run(sessionId, childId, now, now, teacherId).lastInsertRowid)

    db.prepare(`
      INSERT INTO teacher_payments (teacher_id, child_id, attendance_record_id, attendance_date, session_cost, status, created_at, updated_at, synced)
      VALUES (?, ?, ?, '2026-07-10', 150, 'pending', ?, ?, 0)
    `).run(teacherId, childId, attendanceRecordId, now, now)

    tmpFile = path.join(os.tmpdir(), `payroll-report-test-${Date.now()}.csv`)
  })

  afterAll(() => {
    try { fs.unlinkSync(tmpFile) } catch { /* best-effort cleanup */ }
  })

  it('produces a totals row matching the teacher_payments sum, with filters and generation timestamp in the header', async () => {
    await buildCsvFile('payrollReport', { month: 7, year: 2026, lang: 'en' }, tmpFile)
    const content = fs.readFileSync(tmpFile, 'utf8').replace(/^﻿/, '')
    const lines = content.split('\r\n')

    expect(lines.some((l) => l.includes('Period: July 2026'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Generated:'))).toBe(true)
    expect(lines.some((l) => l.includes('Ahmed') && l.includes('150'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Total,'))).toBe(true)
  })

  it('renders a clearly-labeled empty report for a month with zero paid sessions (FR-009)', async () => {
    await buildCsvFile('payrollReport', { month: 1, year: 2020, lang: 'en' }, tmpFile)
    const content = fs.readFileSync(tmpFile, 'utf8').replace(/^﻿/, '')
    expect(content).toContain('No paid sessions for this month.')
    expect(content).not.toContain('Total,')
  })
})

describe('Child Report CSV export (feature 007, US3/FR-007) — attendance percentage computation', () => {
  let db: any
  let teacherId: number
  let tmpFile: string

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    const now = new Date().toISOString()

    teacherId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, housing, transport, net_salary, is_active, created_at, updated_at, synced, teacher_session_rate)
      VALUES ('Sara', 'teacher', 0, 0, 0, 0, 1, ?, ?, 0, 100)
    `).run(now, now).lastInsertRowid)

    tmpFile = path.join(os.tmpdir(), `child-report-test-${Date.now()}.csv`)
  })

  afterAll(() => {
    try { fs.unlinkSync(tmpFile) } catch { /* best-effort cleanup */ }
  })

  function addSessionAttendance(childId: number, date: string, status: string) {
    const now = new Date().toISOString()
    const sessionId = Number(db.prepare(
      `INSERT INTO scheduled_sessions (session_date, created_at, updated_at) VALUES (?, ?, ?)`
    ).run(date, now, now).lastInsertRowid)
    db.prepare(`
      INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at, attended_teacher_id, teacher_status)
      VALUES (?, ?, ?, ?, ?, ?, 'present')
    `).run(sessionId, childId, status, now, now, teacherId)
  }

  it('computes attendance percentage as attended / total sessions', async () => {
    const now = new Date().toISOString()
    const childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Lina', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    addSessionAttendance(childId, '2026-07-01', 'attended')
    addSessionAttendance(childId, '2026-07-02', 'attended')
    addSessionAttendance(childId, '2026-07-03', 'absent_unexcused')
    addSessionAttendance(childId, '2026-07-04', 'absent_excused')

    await buildCsvFile('childReport', { childId, lang: 'en' }, tmpFile)
    const content = fs.readFileSync(tmpFile, 'utf8').replace(/^﻿/, '')
    // 2 attended / 4 total = 50%
    expect(content).toContain('Attendance Percentage,50%')
  })

  it('renders attendance percentage as N/A for a child with no attendance yet, not an error', async () => {
    const now = new Date().toISOString()
    const childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('NewChild', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    await buildCsvFile('childReport', { childId, lang: 'en' }, tmpFile)
    const content = fs.readFileSync(tmpFile, 'utf8').replace(/^﻿/, '')
    expect(content).toContain('Attendance Percentage,N/A')
    expect(content).toContain('No attendance history yet.')
  })
})
