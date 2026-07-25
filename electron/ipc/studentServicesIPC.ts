import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'
import { getCurrentUser } from './authIPC.js'
import type { ServiceEnrollment } from '../../src/types/index.js'
import { recordLocalTombstone } from '../services/tombstones.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

ipcMain.handle('studentServices:list', async (_event, { studentId }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!studentId) throw new Error('studentId is required')
    return db.prepare('SELECT * FROM student_services WHERE student_id = ?').all(studentId) as ServiceEnrollment[]
  } catch (error: any) {
    console.error('Failed to get student services:', error)
    throw new Error(error.message || 'Failed to get student services')
  }
})

ipcMain.handle('studentServices:add', async (_event, { studentId, service, unit, price, teacher_session_rate = null }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!studentId || !service || !unit || price === undefined) {
      throw new Error('جميع الحقول الإلزامية مطلوبة / Missing required fields')
    }

    // Check duplicate
    const existing = db.prepare('SELECT id FROM student_services WHERE student_id = ? AND service = ?').get(studentId, service)
    if (existing) {
      throw new Error('هذه الخدمة مضافة بالفعل للطالب / Service already enrolled')
    }

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO student_services (student_id, service, unit, price, teacher_session_rate, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(studentId, service, unit, price, teacher_session_rate !== null ? Number(teacher_session_rate) : null, now, now)

    return db.prepare('SELECT * FROM student_services WHERE id = ?').get(result.lastInsertRowid) as ServiceEnrollment
  } catch (error: any) {
    console.error('Failed to add student service:', error)
    throw new Error(error.message || 'Failed to add student service')
  }
})

ipcMain.handle('studentServices:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id || !patch) throw new Error('ID and patch are required')

    let query = 'UPDATE student_services SET '
    const params: any[] = []
    
    const allowed = ['unit', 'price', 'teacher_session_rate']
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        query += `${key} = ?, `
        params.push(patch[key])
      }
    }

    if (params.length === 0) return db.prepare('SELECT * FROM student_services WHERE id = ?').get(id)

    query += 'updated_at = ?, synced = 0 WHERE id = ?'
    params.push(new Date().toISOString(), id)

    db.prepare(query).run(...params)
    return db.prepare('SELECT * FROM student_services WHERE id = ?').get(id) as ServiceEnrollment
  } catch (error: any) {
    console.error('Failed to update student service:', error)
    throw new Error(error.message || 'Failed to update student service')
  }
})

// Read-only preview (FR-002/FR-003): counts remaining scheduled weekday occurrences for
// `lesson_days` (0=Sun…6=Sat) from today (inclusive) through the end of the current calendar
// month, and multiplies by the teacher's per-session rate. Never writes anything — pure
// computation for the enrollment UI.
ipcMain.handle('studentServices:previewTeacherCost', async (_event, { teacher_id, lesson_days, teacher_session_rate = null }) => {
  try {
    checkAuth()
    const db = getDb()
    const teacher = db.prepare('SELECT teacher_session_rate FROM employees WHERE id = ?').get(teacher_id) as any
    // Fallback order mirrors resolveTeacherSessionRate in attendanceIPC.ts — the student-level
    // override (this enrollment's own input, since the student may not exist yet to look up) wins
    // over the teacher's own rate, which wins over their assigned salary type's session rate.
    // There is no org-wide default fallback anymore.
    let rate = teacher_session_rate !== null && teacher_session_rate !== '' ? Number(teacher_session_rate) : (teacher?.teacher_session_rate ?? null)
    if (rate == null) {
      const salaryTypeRow = db.prepare(`
        SELECT st.session_rate as session_rate
        FROM employees e
        LEFT JOIN employee_roles er ON e.role_id = er.id
        LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
        WHERE e.id = ?
      `).get(teacher_id) as any
      rate = salaryTypeRow?.session_rate ?? 0
    }

    const days: number[] = Array.isArray(lesson_days) ? lesson_days.map(Number) : []

    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    let total = 0
    if (days.length > 0) {
      for (let d = today.getDate(); d <= daysInMonth; d++) {
        const date = new Date(year, month, d)
        if (days.includes(date.getDay())) total++
      }
    }

    return {
      remaining_sessions: total,
      expected_cost: Number((total * rate).toFixed(2)),
      teacher_session_rate: rate
    }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to preview teacher cost')
  }
})

// Feature 009: student details timetable — derived from existing student_services columns
// (teacher_id, lesson_days) rather than a new table (research.md #4).
ipcMain.handle('studentServices:getTimetable', async (_event, { student_id }) => {
  try {
    checkAuth()
    if (!student_id) throw new Error('student_id is required')
    const db = getDb()

    const enrollments = db.prepare(`
      SELECT cs.id as service_row_id, cs.service, cs.teacher_id, cs.lesson_days, e.name as teacher_name
      FROM student_services cs
      LEFT JOIN employees e ON e.id = cs.teacher_id
      WHERE cs.student_id = ?
    `).all(student_id) as any[]

    const slots: { service_row_id: number; service: string; day: number; teacher_id: number | null; teacher_name: string | null }[] = []
    for (const en of enrollments) {
      let days: number[] = []
      if (en.lesson_days) {
        try {
          days = JSON.parse(en.lesson_days)
        } catch {
          days = []
        }
      }
      for (const day of days) {
        slots.push({
          service_row_id: en.service_row_id,
          service: en.service,
          day,
          teacher_id: en.teacher_id ?? null,
          teacher_name: en.teacher_name ?? null,
        })
      }
    }

    return slots
  } catch (error: any) {
    console.error('Failed to get student timetable:', error)
    throw new Error(error.message || 'Failed to get student timetable')
  }
})

ipcMain.handle('studentServices:remove', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id) throw new Error('ID is required')

    db.prepare('DELETE FROM student_services WHERE id = ?').run(id)
    recordLocalTombstone(db, 'student_services', id)
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to remove student service:', error)
    throw new Error(error.message || 'Failed to remove student service')
  }
})
