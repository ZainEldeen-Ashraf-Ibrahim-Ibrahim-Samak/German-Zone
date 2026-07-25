import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'

ipcMain.handle('sessions:list', async (_event, args) => {
  try {
    checkAuth()
    const db = getDb()
    const { from, to } = args || {}
    let query = `
      SELECT ss.*, sd.name as service_name,
        (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = ss.id) as attendance_count
      FROM scheduled_sessions ss
      LEFT JOIN service_definitions sd ON ss.service_id = sd.id
      WHERE 1=1
    `
    const params: any[] = []
    if (from) { query += ' AND ss.session_date >= ?'; params.push(from) }
    if (to) { query += ' AND ss.session_date <= ?'; params.push(to) }
    query += ' ORDER BY ss.session_date ASC'
    const sessions = db.prepare(query).all(...params) as any[]
    for (const s of sessions) {
      s.teachers = db.prepare(`
        SELECT e.id, e.name, er.name as role_name
        FROM session_teachers st
        JOIN employees e ON st.employee_id = e.id
        LEFT JOIN employee_roles er ON e.role_id = er.id
        WHERE st.session_id = ?
      `).all(s.id)
    }
    return sessions
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list sessions')
  }
})

ipcMain.handle('sessions:add', async (_event, input) => {
  try {
    checkAuth()
    const { session_date, service_id = null, group_name = null, notes = null, employee_ids = [] } = input
    if (!session_date) throw new Error('تاريخ الجلسة مطلوب / Session date is required')
    const db = getDb()
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO scheduled_sessions (session_date, service_id, group_name, notes, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(session_date, service_id, group_name, notes, now, now)
    const sessionId = Number(result.lastInsertRowid)
    for (const empId of employee_ids) {
      db.prepare('INSERT OR IGNORE INTO session_teachers (session_id, employee_id, synced) VALUES (?, ?, 0)')
        .run(sessionId, empId)
    }
    return db.prepare('SELECT * FROM scheduled_sessions WHERE id = ?').get(sessionId)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to add session')
  }
})

ipcMain.handle('sessions:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    const s = db.prepare('SELECT * FROM scheduled_sessions WHERE id = ?').get(id) as any
    if (!s) throw new Error('الجلسة غير موجودة / Session not found')
    const session_date = patch.session_date ?? s.session_date
    const service_id = patch.service_id !== undefined ? patch.service_id : s.service_id
    const group_name = patch.group_name !== undefined ? patch.group_name : s.group_name
    const notes = patch.notes !== undefined ? patch.notes : s.notes
    db.prepare(`
      UPDATE scheduled_sessions SET session_date = ?, service_id = ?, group_name = ?, notes = ?, updated_at = ?, synced = 0 WHERE id = ?
    `).run(session_date, service_id, group_name, notes, new Date().toISOString(), id)
    return db.prepare('SELECT * FROM scheduled_sessions WHERE id = ?').get(id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update session')
  }
})

ipcMain.handle('sessions:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    const { cnt: attendanceCount } = db.prepare('SELECT COUNT(*) as cnt FROM attendance_records WHERE session_id = ?').get(id) as { cnt: number }
    // Cascade delete in dependency order. attendance_conflicts -> attendance_records has no
    // ON DELETE CASCADE, so its rows must be removed explicitly before the records they reference.
    db.transaction(() => {
      db.prepare(`
        DELETE FROM attendance_conflicts
        WHERE attendance_record_id IN (SELECT id FROM attendance_records WHERE session_id = ?)
      `).run(id)
      db.prepare('DELETE FROM attendance_records WHERE session_id = ?').run(id)
      db.prepare('DELETE FROM session_teachers WHERE session_id = ?').run(id)
      db.prepare('DELETE FROM scheduled_sessions WHERE id = ?').run(id)
    })()
    return { ok: true, deleted_attendance: attendanceCount }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete session')
  }
})

// Reports the per-session salary for a session's teachers, used to show a live banner in the
// attendance sheet and confirm after saving. Always returns the per-session teachers and their
// per-session amount (so the user can see who earns what); `payable` indicates whether the
// session currently qualifies — i.e. at least one child attended or was absent without excuse.
// Only teachers on a per-session salary mode (per_session_fixed / hybrid) earn from a single
// session; fixed-monthly teachers are unaffected and are omitted from `credits`.
ipcMain.handle('sessions:salaryCredit', async (_event, { session_id }) => {
  try {
    checkAuth()
    const db = getDb()

    const payable = !!db.prepare(`
      SELECT 1 FROM attendance_records
      WHERE session_id = ? AND status IN ('attended','absent_unexcused')
      LIMIT 1
    `).get(session_id)

    const teachers = db.prepare(`
      SELECT e.id as employee_id, e.name,
        COALESCE(e.salary_type_override_id, er.salary_type_id) as effective_salary_type_id
      FROM session_teachers st
      JOIN employees e ON st.employee_id = e.id
      LEFT JOIN employee_roles er ON e.role_id = er.id
      WHERE st.session_id = ?
    `).all(session_id) as { employee_id: number; name: string; effective_salary_type_id: number | null }[]

    const credits: { employee_id: number; name: string; amount: number }[] = []
    for (const t of teachers) {
      if (!t.effective_salary_type_id) continue
      const st = db.prepare('SELECT mode, session_rate FROM salary_types WHERE id = ?')
        .get(t.effective_salary_type_id) as { mode: string; session_rate: number | null } | undefined
      if (!st) continue
      // Per-session contribution to pay for this single session.
      if (st.mode === 'per_session_fixed' || st.mode === 'hybrid') {
        credits.push({ employee_id: t.employee_id, name: t.name, amount: st.session_rate ?? 0 })
      }
    }

    return { payable, hasTeachers: teachers.length > 0, credits }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to compute session salary credit')
  }
})

ipcMain.handle('sessions:assignTeachers', async (_event, { session_id, employee_ids }) => {
  try {
    requireAdmin()
    const db = getDb()
    db.prepare('DELETE FROM session_teachers WHERE session_id = ?').run(session_id)
    for (const empId of employee_ids) {
      db.prepare('INSERT OR IGNORE INTO session_teachers (session_id, employee_id, synced) VALUES (?, ?, 0)')
        .run(session_id, empId)
    }
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to assign teachers')
  }
})

// Returns active children who have a given weekday (0=Sun…6=Sat) in their lesson_days
ipcMain.handle('sessions:childrenForDay', async (_event, { day_of_week }) => {
  try {
    checkAuth()
    const db = getDb()
    const all = db.prepare(`SELECT id, name, lesson_days FROM children WHERE is_active = 1 AND lesson_days IS NOT NULL AND lesson_days != '[]' AND lesson_days != ''`).all() as any[]
    return all.filter(c => {
      try {
        const days: number[] = JSON.parse(c.lesson_days)
        return days.includes(Number(day_of_week))
      } catch { return false }
    }).map(c => ({ id: c.id, name: c.name }))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get children for day')
  }
})

ipcMain.handle('sessions:proRateCalc', async (_event, args) => {
  try {
    checkAuth()
    const db = getDb()

    // Support both direct reg_date/price and child_id lookup
    let reg_date: string = args.reg_date
    let pricePerSession: number = args.price_per_session ?? 0

    if (!reg_date && args.child_id) {
      const child = db.prepare('SELECT reg_date, session_price FROM children WHERE id = ?').get(args.child_id) as any
      if (!child) throw new Error('الطفل غير موجود / Child not found')
      reg_date = child.reg_date
      pricePerSession = child.session_price ?? 0
    }

    if (!reg_date) throw new Error('reg_date is required')

    const regDate = new Date(reg_date)
    const year = regDate.getFullYear()
    const month = regDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysRemaining = daysInMonth - regDate.getDate() + 1

    // Count scheduled sessions from reg_date through end of month
    const monthStr = String(month + 1).padStart(2, '0')
    const monthStart = reg_date
    const monthEnd = `${year}-${monthStr}-${daysInMonth}`

    const sessionCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM scheduled_sessions
      WHERE session_date >= ? AND session_date <= ?
    `).get(monthStart, monthEnd) as { cnt: number }).cnt

    const totalSessionsInMonth = (db.prepare(`
      SELECT COUNT(*) as cnt FROM scheduled_sessions
      WHERE strftime('%Y-%m', session_date) = ?
    `).get(`${year}-${monthStr}`) as { cnt: number }).cnt

    const prorated = Math.round(pricePerSession * daysRemaining / daysInMonth)

    return {
      remaining_sessions: sessionCount,
      total_sessions: totalSessionsInMonth,
      days_remaining: daysRemaining,
      days_in_month: daysInMonth,
      prorated_amount: prorated,
      per_session_price: pricePerSession
    }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to calculate pro-rate')
  }
})
