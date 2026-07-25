import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

interface CalendarEntry {
  date: string
  user_id: number
  user_name: string
  user_type: 'child' | 'teacher' | 'session'
  service_id: number | null
  service_name: string | null
  teacher_id: number | null
  teacher_name: string | null
  // Set only for entries derived from an actual scheduled_sessions row — lets the UI open that
  // session's attendance sheet on click. Recurring child_services timetable slots have no
  // corresponding session (they're a schedule, not a taken attendance record), so this is null there.
  session_id: number | null
}

// Aggregates schedule data at read time from child_services (lesson_days/teacher_id) and
// scheduled_sessions/session_teachers — no persisted calendar table (research.md #6). Identical
// result for every role: admin and employee both see the full aggregated schedule (Clarifications).
function buildMonthEntries(db: any, year: number, month: number): CalendarEntry[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const entries: CalendarEntry[] = []

  // Child-services-based recurring lessons. lesson_days is a JSON array of weekday numbers 0-6
  // when the enrollment has specific scheduled days; enrollments with no lesson_days set have no
  // day restriction, so — rather than disappearing from the calendar until someone manually
  // creates a scheduled_sessions row — they are shown on every day of the month (an enrollment is
  // always "on the calendar", created or not; see spec.md FR-011…FR-013).
  const enrollments = db.prepare(`
    SELECT cs.id as service_row_id, cs.child_id, c.name as child_name, cs.service, cs.teacher_id,
           e.name as teacher_name, cs.lesson_days
    FROM child_services cs
    JOIN children c ON c.id = cs.child_id
    LEFT JOIN employees e ON e.id = cs.teacher_id
    WHERE c.is_active = 1
  `).all() as any[]

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    // Build the date key from local components, not toISOString() — toISOString() converts to
    // UTC first, which shifts the date back a day in any timezone ahead of UTC (e.g. Cairo).
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const weekday = date.getDay()

    for (const en of enrollments) {
      const hasDays = en.lesson_days != null && en.lesson_days !== '' && en.lesson_days !== '[]'
      if (hasDays) {
        let days: number[]
        try {
          days = JSON.parse(en.lesson_days)
        } catch {
          continue
        }
        if (!days.includes(weekday)) continue
      }
      // No lesson_days set → no day restriction, shown every day.

      entries.push({
        date: iso,
        user_id: en.child_id,
        user_name: en.child_name,
        user_type: 'child',
        service_id: en.service_row_id,
        service_name: en.service,
        teacher_id: en.teacher_id ?? null,
        teacher_name: en.teacher_name ?? null,
        session_id: null,
      })
    }
  }

  // Scheduled sessions (one-off/session-based scheduling)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const sessions = db.prepare(`
    SELECT ss.id, ss.session_date, ss.service_id, sd.name as service_name
    FROM scheduled_sessions ss
    LEFT JOIN service_definitions sd ON sd.id = ss.service_id
    WHERE ss.session_date BETWEEN ? AND ?
  `).all(from, to) as any[]

  const teacherStmt = db.prepare(`
    SELECT st.employee_id, e.name as employee_name
    FROM session_teachers st
    JOIN employees e ON e.id = st.employee_id
    WHERE st.session_id = ?
  `)

  for (const session of sessions) {
    const teachers = teacherStmt.all(session.id) as any[]
    if (teachers.length === 0) {
      // No teacher assigned yet — user_id here is the session id, not an employee id, so this
      // is not a 'teacher' entry; give it its own type so the UI doesn't mistake it for one.
      entries.push({
        date: session.session_date,
        user_id: session.id,
        user_name: session.service_name || 'Session',
        user_type: 'session',
        service_id: session.service_id,
        service_name: session.service_name,
        teacher_id: null,
        teacher_name: null,
        session_id: session.id,
      })
    } else {
      for (const t of teachers) {
        entries.push({
          date: session.session_date,
          user_id: t.employee_id,
          user_name: t.employee_name,
          user_type: 'teacher',
          service_id: session.service_id,
          service_name: session.service_name,
          teacher_id: t.employee_id,
          teacher_name: t.employee_name,
          session_id: session.id,
        })
      }
    }
  }

  return entries
}

ipcMain.handle('calendar:getMonth', async (_event, { year, month }) => {
  try {
    checkAuth()
    if (!year || !month) throw new Error('year and month are required')
    const db = getDb()
    return buildMonthEntries(db, Number(year), Number(month))
  } catch (error: any) {
    console.error('Failed to get calendar month:', error)
    throw new Error(error.message || 'Failed to get calendar month')
  }
})

ipcMain.handle('calendar:getDay', async (_event, { date }) => {
  try {
    checkAuth()
    if (!date) throw new Error('date is required')
    const db = getDb()
    const d = new Date(date)
    const entries = buildMonthEntries(db, d.getFullYear(), d.getMonth() + 1).filter((e) => e.date === date)
    return { date, entries }
  } catch (error: any) {
    console.error('Failed to get calendar day:', error)
    throw new Error(error.message || 'Failed to get calendar day')
  }
})
