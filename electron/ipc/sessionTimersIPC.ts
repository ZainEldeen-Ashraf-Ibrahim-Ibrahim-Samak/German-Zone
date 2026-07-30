import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'
import type { Db } from '../db/connection.js'

/**
 * The unit price of one hour for this employee:
 *   1. the employee's own `hourly_rate` override
 *   2. the effective salary type's `hourly_rate`
 * Returns null when neither is configured — a timer can still be run and stopped (the worked
 * time is never lost), it just produces no amount until a rate is set, which is then picked up
 * by `recalcPendingTimeLogs`. Nothing is ever paid at a hidden default.
 */
export function resolveHourlyRate(db: Db, employee_id: number): number | null {
  const row = db.prepare(`
    SELECT e.hourly_rate as own_rate, st.hourly_rate as type_rate, st.mode as mode
    FROM employees e
    LEFT JOIN employee_roles er ON e.role_id = er.id
    LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
    WHERE e.id = ?
  `).get(employee_id) as any
  if (row?.own_rate != null) return row.own_rate
  if (row?.type_rate != null) return row.type_rate
  return null
}

/** Whether this employee is currently paid by the hour (drives which UI/pay path applies). */
export function isHourlyEmployee(db: Db, employee_id: number): boolean {
  const row = db.prepare(`
    SELECT st.mode as mode
    FROM employees e
    LEFT JOIN employee_roles er ON e.role_id = er.id
    LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
    WHERE e.id = ?
  `).get(employee_id) as any
  return row?.mode === 'hourly'
}

/** Elapsed minutes between two ISO instants, rounded to 2dp and never negative. */
function minutesBetween(startedAt: string, endedAt: string): number {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return Number(Math.max(0, ms / 60000).toFixed(2))
}

function amountFor(durationMinutes: number, rate: number | null): number | null {
  if (rate == null) return null
  return Number(((durationMinutes / 60) * rate).toFixed(2))
}

/**
 * Re-prices every completed-but-unpaid time log of one employee at the rate that CURRENTLY
 * resolves — mirrors resnapshotPendingTeacherPayments for per-session pay, so setting or
 * correcting an hourly rate is reflected in salaries immediately, including for stints that
 * were logged before the rate existed. Only rows whose salary month has not been paid out are
 * touched; the elapsed time itself is never rewritten.
 */
export function recalcPendingTimeLogs(db: Db, employee_id: number): void {
  const logs = db.prepare(`
    SELECT id, duration_minutes FROM session_time_logs
    WHERE employee_id = ? AND status = 'completed'
  `).all(employee_id) as any[]
  if (logs.length === 0) return
  const rate = resolveHourlyRate(db, employee_id)
  if (rate == null) return
  const now = new Date().toISOString()
  for (const log of logs) {
    const amount = amountFor(log.duration_minutes ?? 0, rate)
    db.prepare(`
      UPDATE session_time_logs SET hourly_rate = ?, amount = ?, updated_at = ?, synced = 0 WHERE id = ?
    `).run(rate, amount, now, log.id)
  }
}

/** Sum of an employee's completed hours + pay for a date range (YYYY-MM-DD bounds). */
export function getTimeLogTotals(db: Db, employee_id: number, start: string, end: string) {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt,
           COALESCE(SUM(duration_minutes), 0) as minutes,
           COALESCE(SUM(amount), 0) as total
    FROM session_time_logs
    WHERE employee_id = ? AND status = 'completed' AND work_date >= ? AND work_date <= ?
  `).get(employee_id, start, end) as { cnt: number; minutes: number; total: number }
  return {
    count: row.cnt,
    minutes: row.minutes,
    hours: Number((row.minutes / 60).toFixed(2)),
    total: Number(row.total.toFixed(2)),
  }
}

const withRowJoins = `
  SELECT tl.*, e.name as employee_name, ss.session_date as session_date, ss.group_name as session_group
  FROM session_time_logs tl
  JOIN employees e ON tl.employee_id = e.id
  LEFT JOIN scheduled_sessions ss ON tl.session_id = ss.id
`

// Start the timer for one employee on a session. Employees may run their own timer; an admin
// may start one for anybody.
ipcMain.handle('sessionTimers:start', async (_event, { employee_id, session_id = null, notes = null }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!employee_id) throw new Error('الموظف مطلوب / Employee is required')

    const emp = db.prepare('SELECT id, is_active FROM employees WHERE id = ?').get(employee_id) as any
    if (!emp) throw new Error('الموظف غير موجود / Employee not found')

    const running = db.prepare(`SELECT id FROM session_time_logs WHERE employee_id = ? AND status = 'running'`).get(employee_id) as any
    if (running) throw new Error('يوجد مؤقت قيد التشغيل بالفعل لهذا الموظف / A timer is already running for this employee')

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO session_time_logs (session_id, employee_id, work_date, started_at, status, notes, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, 'running', ?, ?, ?, 0)
    `).run(session_id, employee_id, now.slice(0, 10), now, notes, now, now)

    return db.prepare(`${withRowJoins} WHERE tl.id = ?`).get(Number(result.lastInsertRowid))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to start timer')
  }
})

// Stop a running timer: freezes the elapsed time, snapshots the hourly rate in force now and
// records what that stint earned.
ipcMain.handle('sessionTimers:stop', async (_event, { id = null, employee_id = null }) => {
  try {
    checkAuth()
    const db = getDb()

    const log = (id
      ? db.prepare(`SELECT * FROM session_time_logs WHERE id = ?`).get(id)
      : db.prepare(`SELECT * FROM session_time_logs WHERE employee_id = ? AND status = 'running'`).get(employee_id)
    ) as any
    if (!log) throw new Error('المؤقت غير موجود / Timer not found')
    if (log.status !== 'running') throw new Error('المؤقت متوقف بالفعل / Timer is not running')

    const now = new Date().toISOString()
    const duration = minutesBetween(log.started_at, now)
    const rate = resolveHourlyRate(db, log.employee_id)
    const amount = amountFor(duration, rate)

    db.prepare(`
      UPDATE session_time_logs
      SET ended_at = ?, duration_minutes = ?, hourly_rate = ?, amount = ?, status = 'completed', updated_at = ?, synced = 0
      WHERE id = ?
    `).run(now, duration, rate, amount, now, log.id)

    return db.prepare(`${withRowJoins} WHERE tl.id = ?`).get(log.id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to stop timer')
  }
})

// Manually log or correct a stint (admin only) — e.g. a teacher who forgot to start the timer.
ipcMain.handle('sessionTimers:logManual', async (_event, { employee_id, session_id = null, work_date, started_at = null, ended_at = null, duration_minutes = null, notes = null }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!employee_id) throw new Error('الموظف مطلوب / Employee is required')

    let minutes: number
    if (duration_minutes != null) {
      minutes = Number(duration_minutes)
    } else if (started_at && ended_at) {
      minutes = minutesBetween(started_at, ended_at)
    } else {
      throw new Error('المدة أو وقتا البدء والانتهاء مطلوبان / Either a duration or both start and end times are required')
    }
    if (!(minutes > 0)) throw new Error('المدة يجب أن تكون أكبر من صفر / Duration must be greater than zero')

    const now = new Date().toISOString()
    const date = work_date || (started_at ? String(started_at).slice(0, 10) : now.slice(0, 10))
    const rate = resolveHourlyRate(db, employee_id)
    const amount = amountFor(minutes, rate)

    const result = db.prepare(`
      INSERT INTO session_time_logs (session_id, employee_id, work_date, started_at, ended_at, duration_minutes, hourly_rate, amount, status, notes, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, 0)
    `).run(session_id, employee_id, date, started_at ?? now, ended_at ?? now, minutes, rate, amount, notes, now, now)

    return db.prepare(`${withRowJoins} WHERE tl.id = ?`).get(Number(result.lastInsertRowid))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to log worked time')
  }
})

// Void a logged stint (admin only). Voided rows keep their history but stop counting towards pay.
ipcMain.handle('sessionTimers:void', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    const log = db.prepare('SELECT id FROM session_time_logs WHERE id = ?').get(id) as any
    if (!log) throw new Error('السجل غير موجود / Time log not found')
    db.prepare(`UPDATE session_time_logs SET status = 'void', updated_at = ?, synced = 0 WHERE id = ?`)
      .run(new Date().toISOString(), id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to void time log')
  }
})

ipcMain.handle('sessionTimers:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    db.prepare('DELETE FROM session_time_logs WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete time log')
  }
})

// List time logs, optionally filtered by employee / session / month.
ipcMain.handle('sessionTimers:list', async (_event, args) => {
  try {
    checkAuth()
    const db = getDb()
    const { employee_id, session_id, from, to, status } = args || {}
    let query = `${withRowJoins} WHERE 1=1`
    const params: any[] = []
    if (employee_id) { query += ' AND tl.employee_id = ?'; params.push(employee_id) }
    if (session_id) { query += ' AND tl.session_id = ?'; params.push(session_id) }
    if (from) { query += ' AND tl.work_date >= ?'; params.push(from) }
    if (to) { query += ' AND tl.work_date <= ?'; params.push(to) }
    if (status) { query += ' AND tl.status = ?'; params.push(status) }
    query += ' ORDER BY tl.started_at DESC'
    return db.prepare(query).all(...params)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list time logs')
  }
})

// Every timer currently running, so the UI can show live elapsed time and offer a Stop button.
ipcMain.handle('sessionTimers:active', async (_event, args) => {
  try {
    checkAuth()
    const db = getDb()
    const employee_id = args?.employee_id
    const query = `${withRowJoins} WHERE tl.status = 'running'` + (employee_id ? ' AND tl.employee_id = ?' : '') + ' ORDER BY tl.started_at ASC'
    return employee_id ? db.prepare(query).all(employee_id) : db.prepare(query).all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list running timers')
  }
})

// The employees who are paid by the hour, with their effective unit price — what the timer
// panel offers to start a stint for.
ipcMain.handle('sessionTimers:hourlyEmployees', async () => {
  try {
    checkAuth()
    const db = getDb()
    const rows = db.prepare(`
      SELECT e.id, e.name, e.role, COALESCE(e.hourly_rate, st.hourly_rate) as effective_hourly_rate
      FROM employees e
      LEFT JOIN employee_roles er ON e.role_id = er.id
      LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
      WHERE e.is_active = 1 AND st.mode = 'hourly'
      ORDER BY e.name ASC
    `).all()
    return rows
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list hourly employees')
  }
})
