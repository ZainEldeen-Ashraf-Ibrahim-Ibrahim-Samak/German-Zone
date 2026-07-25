import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/childServicesIPC.js'
import '../../electron/ipc/salariesIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('childServices:previewTeacherCost — remaining-sessions/cost preview (US2, FR-002/FR-003)', () => {
  let db: any
  let teacherId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  const add = getHandler('employees:add')
  const preview = getHandler('childServices:previewTeacherCost')

  it('computes the remaining sessions (today through month end) and expected cost from lesson_days and the teacher rate', async () => {
    const emp = await add(null, { name: 'Ahmed', base_salary: 0, teacher_session_rate: 200 })
    teacherId = emp.id

    // Every weekday (0-6) — so every remaining day of the month counts (FR-002: from the
    // current date through the end of the calendar month, elapsed days excluded).
    const result = await preview(null, { teacher_id: teacherId, lesson_days: [0, 1, 2, 3, 4, 5, 6] })

    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const remainingDays = daysInMonth - today.getDate() + 1

    expect(result.remaining_sessions).toBe(remainingDays)
    expect(result.expected_cost).toBe(remainingDays * 200)
  })

  it('returns zero sessions when lesson_days is empty', async () => {
    const result = await preview(null, { teacher_id: teacherId, lesson_days: [] })
    expect(result.remaining_sessions).toBe(0)
    expect(result.expected_cost).toBe(0)
  })

  it('treats a teacher with no configured rate and no assigned salary type as a zero-cost preview (not an error)', async () => {
    const emp = await add(null, { name: 'NoRate', base_salary: 0 })
    const result = await preview(null, { teacher_id: emp.id, lesson_days: [0, 1, 2, 3, 4, 5, 6] })
    expect(result.teacher_session_rate).toBe(0)
    expect(result.expected_cost).toBe(0)
  })

  it('previews using the employee\'s assigned salary type session rate when the teacher has none of their own', async () => {
    const now = new Date().toISOString()
    const salaryTypeId = Number(db.prepare(`
      INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at, synced)
      VALUES ('Per Session (Fallback 80)', 'per_session_fixed', 80, ?, ?, 0)
    `).run(now, now).lastInsertRowid)
    const emp = await add(null, { name: 'NoRateWithSalaryType', base_salary: 0, salary_type_override_id: salaryTypeId })
    const result = await preview(null, { teacher_id: emp.id, lesson_days: [1] })
    expect(result.teacher_session_rate).toBe(80)
  })

  it('a per-child rate passed by the caller wins over the teacher\'s own rate', async () => {
    const result = await preview(null, { teacher_id: teacherId, lesson_days: [1], teacher_session_rate: 350 })
    expect(result.teacher_session_rate).toBe(350)
  })

  it('never writes anything — pure computation', async () => {
    await preview(null, { teacher_id: teacherId, lesson_days: [1] })
    const paymentCount = (db.prepare('SELECT COUNT(*) as cnt FROM teacher_payments').get() as any).cnt
    expect(paymentCount).toBe(0)
  })
})
