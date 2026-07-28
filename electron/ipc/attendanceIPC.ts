import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth, getCurrentUser } from './_guard.js'
import { writeAuditLog } from '../services/attendanceAuditService.js'
import { insertNotification } from './notificationsIPC.js'
import type { Db } from '../db/connection.js'

/**
 * Pure payment-eligibility rule (spec.md FR-008…FR-011):
 *   teacher present + student attended            → payable
 *   teacher present + student absent (unexcused)   → payable
 *   teacher present + student absent (excused)     → not payable
 *   teacher absent (any student status)            → not payable
 * Exported for direct unit testing without touching the database.
 */
/**
 * Whether the feature-007 approval workflow is active. Default OFF — employees record, edit and
 * delete attendance directly, same as admins. An admin can switch it on in Settings → Security,
 * which re-locks saved records for employees and routes their changes through edit/delete requests.
 * Stored in `settings` (key identity), so the choice syncs to MongoDB with every other setting.
 */
export function attendanceEditRequiresApproval(db: Db): boolean {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'attendance_edit_requires_approval'`).get() as { value: string } | undefined
  const value = String(row?.value ?? 'false').trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

export function isPaymentEligible(teacherStatus: 'present' | 'absent' | null | undefined, studentStatus: string): boolean {
  if (teacherStatus !== 'present') return false
  return studentStatus === 'attended' || studentStatus === 'absent_unexcused'
}

/**
 * The price of this student's service, preferring the enrollment linked to this teacher, then the
 * student's most recent enrollment, then the student record's own price. This is `price` — what the
 * service itself costs — NEVER the enrollment's session_price field.
 */
function getStudentServicePrice(db: Db, student_id: number, studentRow: any): number | null {
  if (studentRow?.price != null) return studentRow.price
  const anyEnrollment = db.prepare(`
    SELECT price FROM student_services WHERE student_id = ? ORDER BY id DESC LIMIT 1
  `).get(student_id) as any
  if (anyEnrollment?.price != null) return anyEnrollment.price
  const studentRec = db.prepare('SELECT price FROM students WHERE id = ?').get(student_id) as any
  return studentRec?.price ?? null
}

/**
 * Resolves the per-session rate to pay a teacher for one student.
 *
 * `per_student_session` salary type mode (pay comes from the salary type itself, NEVER the
 * student's service/section price, NEVER the teacher's flat "Per Session Cost" and NEVER the
 * enrollment's session_price):
 *   1. that student's own override (`student_services.teacher_session_rate` — salary type per student)
 *   2. the salary type's own `session_rate`
 *
 * `per_session_pct` salary type mode (percentage OF the student's service price — a 100%
 * percentage pays exactly the service price; nothing is ever hardcoded to 100 EGP):
 *   1. that student's own override, if set (absolute amount)
 *   2. `salary_types.session_pct` × the student's service price
 *
 * All other modes:
 *   1. the student's own override, if set
 *   2. the teacher's own flat rate (`employees.teacher_session_rate`)
 *   3. the effective salary type's per-session rate (`salary_types.session_rate`)
 *
 * There is no org-wide fallback setting anymore — a teacher with none of the above configured
 * simply generates no payment, so misconfiguration is visible rather than silently paid at a
 * stale default.
 */
export function resolveTeacherSessionRate(db: Db, teacher_id: number, student_id: number): number | null {
  // Prefer an enrollment row with an explicit override; otherwise the most recent enrollment
  // linking this student to this teacher (its price feeds the student-price modes below).
  const studentRow = db.prepare(`
    SELECT teacher_session_rate, price FROM student_services
    WHERE student_id = ? AND teacher_id = ?
    ORDER BY (teacher_session_rate IS NOT NULL) DESC, id DESC LIMIT 1
  `).get(student_id, teacher_id) as any
  if (studentRow?.teacher_session_rate != null) return studentRow.teacher_session_rate

  const salaryTypeRow = db.prepare(`
    SELECT st.mode as mode, st.session_rate as session_rate, st.session_pct as session_pct
    FROM employees e
    LEFT JOIN employee_roles er ON e.role_id = er.id
    LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
    WHERE e.id = ?
  `).get(teacher_id) as any

  if (salaryTypeRow?.mode === 'per_student_session') {
    return salaryTypeRow?.session_rate ?? null
  }

  if (salaryTypeRow?.mode === 'per_session_pct') {
    const price = getStudentServicePrice(db, student_id, studentRow)
    if (price != null && salaryTypeRow.session_pct != null) {
      return Number((price * salaryTypeRow.session_pct).toFixed(2))
    }
    return null
  }

  const teacherRow = db.prepare('SELECT teacher_session_rate FROM employees WHERE id = ?').get(teacher_id) as any
  if (teacherRow?.teacher_session_rate != null) return teacherRow.teacher_session_rate

  if (salaryTypeRow?.session_rate != null) return salaryTypeRow.session_rate

  return null
}

/**
 * Re-snapshots every still-Pending payment of one teacher to the rate that CURRENTLY resolves
 * for its student — so a salary-type switch (e.g. to per_student_session), a per-student override, or
 * a rate correction is reflected in salary views immediately, without waiting for each
 * attendance record to be re-saved. Paid/Void rows are never touched (research.md #7).
 */
export function resnapshotPendingTeacherPayments(db: Db, teacher_id: number): void {
  const pending = db.prepare(`
    SELECT id, student_id, session_cost FROM teacher_payments WHERE teacher_id = ? AND status = 'pending'
  `).all(teacher_id) as any[]
  if (pending.length === 0) return
  const now = new Date().toISOString()
  for (const p of pending) {
    const rate = resolveTeacherSessionRate(db, teacher_id, p.student_id)
    if (rate != null && rate !== p.session_cost) {
      db.prepare(`UPDATE teacher_payments SET session_cost = ?, updated_at = ?, synced = 0 WHERE id = ?`)
        .run(rate, now, p.id)
    }
  }
}

/**
 * Recomputes the teacher_payments row for one (teacher, student, date) combination given the
 * attendance values that now apply — voiding a stale pending payment or (re)generating one, per
 * the same five payment-eligibility cases used since feature 006. Extracted so both the direct
 * attendance:record write path AND the edit-request approval path (feature 007) call one shared
 * implementation instead of two that could silently diverge (specs/007-.../research.md #5).
 */
export function recalculateAttendancePayment(db: Db, params: {
  teacher_id: number
  student_id: number
  attendance_record_id: number
  attendance_date: string
  status: string
  teacher_status: 'present' | 'absent' | null | undefined
  now: string
}): void {
  const { teacher_id, student_id, attendance_record_id, attendance_date, status, teacher_status, now } = params
  const existing = db.prepare(`
    SELECT * FROM teacher_payments WHERE teacher_id = ? AND student_id = ? AND attendance_date = ?
  `).get(teacher_id, student_id, attendance_date) as any

  const payable = isPaymentEligible(teacher_status, status)

  const effectiveRate = resolveTeacherSessionRate(db, teacher_id, student_id)
  const hasEffectiveRate = effectiveRate != null

  if (payable && hasEffectiveRate) {
    if (!existing || existing.status === 'void' || existing.status === 'pending') {
      db.prepare(`
        INSERT INTO teacher_payments (teacher_id, student_id, attendance_record_id, attendance_date, session_cost, status, created_at, updated_at, synced)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0)
        ON CONFLICT(teacher_id, student_id, attendance_date) DO UPDATE SET
          attendance_record_id = excluded.attendance_record_id,
          session_cost = excluded.session_cost,
          status = 'pending',
          updated_at = excluded.updated_at,
          synced = 0
      `).run(teacher_id, student_id, attendance_record_id, attendance_date, effectiveRate, now, now)
    }
    // existing.status === 'paid': left untouched — a settled payment is never auto-mutated.
  } else if ((!payable || !hasEffectiveRate) && existing && existing.status === 'pending') {
    db.prepare(`UPDATE teacher_payments SET status = 'void', updated_at = ?, synced = 0 WHERE id = ?`)
      .run(now, existing.id)
  }
}

ipcMain.handle('attendance:getSheet', async (_event, { session_id }) => {
  try {
    checkAuth()
    const db = getDb()
    const requiresApproval = attendanceEditRequiresApproval(db)
    // Get session date to compute weekday
    const session = db.prepare('SELECT session_date FROM scheduled_sessions WHERE id = ?').get(session_id) as any
    let dayOfWeek: number | null = null
    if (session?.session_date) {
      // Parse date as local date to avoid UTC offset shifting the day
      const [y, m, d] = session.session_date.split('-').map(Number)
      dayOfWeek = new Date(y, m - 1, d).getDay()
    }

    // A student can have more than one teacher — one per service enrollment in student_services
    // (e.g. Speech Therapy with Ahmed, Occupational Therapy with Sara). Build one candidate
    // row per distinct (student, teacher) pair so each teacher gets their own attendance/payment
    // for that student, instead of collapsing onto a single flattened teacher.
    const activeStudents = db.prepare(`
      SELECT id as student_id, name as student_name, photo_url as student_photo_url, lesson_days
      FROM students WHERE is_active = 1
    `).all() as any[]

    const enrollments = db.prepare(`
      SELECT DISTINCT cs.student_id, cs.teacher_id, cs.lesson_days as enrollment_lesson_days
      FROM student_services cs
      WHERE cs.teacher_id IS NOT NULL
    `).all() as any[]
    const enrollmentsByStudent = new Map<number, any[]>()
    for (const en of enrollments) {
      if (!enrollmentsByStudent.has(en.student_id)) enrollmentsByStudent.set(en.student_id, [])
      enrollmentsByStudent.get(en.student_id)!.push(en)
    }

    type Candidate = { student_id: number; student_name: string; student_photo_url: string | null; teacher_id: number | null; lesson_days: string | null }
    const candidates: Candidate[] = []
    for (const c of activeStudents) {
      const studentEnrollments = enrollmentsByStudent.get(c.student_id) ?? []
      if (studentEnrollments.length === 0) {
        candidates.push({ student_id: c.student_id, student_name: c.student_name, student_photo_url: c.student_photo_url, teacher_id: null, lesson_days: c.lesson_days })
      } else {
        // Distinct teachers only — the same teacher across two services for one student still
        // produces a single row, per the spec's "one row per teacher" (not per enrollment).
        const seenTeachers = new Set<number>()
        for (const en of studentEnrollments) {
          if (seenTeachers.has(en.teacher_id)) continue
          seenTeachers.add(en.teacher_id)
          candidates.push({
            student_id: c.student_id, student_name: c.student_name, student_photo_url: c.student_photo_url,
            teacher_id: en.teacher_id, lesson_days: en.enrollment_lesson_days || c.lesson_days
          })
        }
      }
    }

    const teacherIds = [...new Set(candidates.map((c) => c.teacher_id).filter((id): id is number => id != null))]
    const teachersById = new Map<number, any>()
    if (teacherIds.length > 0) {
      const ph = teacherIds.map(() => '?').join(',')
      for (const t of db.prepare(`SELECT id, name, teacher_session_rate FROM employees WHERE id IN (${ph})`).all(...teacherIds) as any[]) {
        teachersById.set(t.id, t)
      }
    }

    const allRows = candidates.map((cand) => {
      const teacher = cand.teacher_id != null ? teachersById.get(cand.teacher_id) : null
      const ar = cand.teacher_id != null
        ? db.prepare(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id = ?`).get(session_id, cand.student_id, cand.teacher_id) as any
        : db.prepare(`SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id IS NULL`).get(session_id, cand.student_id) as any
      const tp = ar ? db.prepare(`SELECT * FROM teacher_payments WHERE attendance_record_id = ?`).get(ar.id) as any : null

      return {
        student_id: cand.student_id,
        student_name: cand.student_name,
        student_photo_url: cand.student_photo_url,
        lesson_days: cand.lesson_days,
        teacher_id: cand.teacher_id,
        teacher_name: teacher?.name ?? null,
        // Same resolution the payment engine actually applies (recalculateAttendancePayment):
        // this student's own rate override → the teacher's flat rate → their salary type's rate.
        teacher_session_rate: cand.teacher_id != null ? resolveTeacherSessionRate(db, cand.teacher_id, cand.student_id) : null,
        attendance_id: ar?.id ?? null,
        // Locked the moment the row exists (feature 007, research.md #4) — non-admin callers
        // must route further changes through attendance:requestEdit. Only when the approval
        // setting is on; by default nothing is locked and employees edit directly.
        locked: requiresApproval && !!ar,
        status: ar?.status ?? null,
        excuse_notes: ar?.excuse_notes ?? null,
        recorded_by: ar?.recorded_by ?? null,
        recorded_at: ar?.recorded_at ?? null,
        updated_at: ar?.updated_at ?? null,
        attended_teacher_id: ar?.attended_teacher_id ?? null,
        teacher_status: ar?.teacher_status ?? null,
        payment: {
          generated: tp?.status === 'pending' || tp?.status === 'paid',
          amount: tp?.session_cost ?? null,
          status: tp?.status ?? null
        }
      }
    })

    // Filter to rows scheduled for that weekday, already recorded, or with no lesson_days set
    const rows = allRows.filter((r) => {
      if (r.attendance_id) return true
      if (!r.lesson_days || r.lesson_days === '[]' || r.lesson_days === '') return true
      if (dayOfWeek === null) return true
      try {
        const days: number[] = JSON.parse(r.lesson_days)
        return days.length === 0 || days.includes(dayOfWeek)
      } catch { return true }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    }).map(({ lesson_days, ...rest }) => rest)

    rows.sort((a, b) => a.student_name.localeCompare(b.student_name))
    return rows
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get attendance sheet')
  }
})

ipcMain.handle('attendance:record', async (_event, args) => {
  try {
    checkAuth()
    const db = getDb()
    const user = getCurrentUser()
    const isAdmin = user?.role === 'admin'
    const requiresApproval = attendanceEditRequiresApproval(db)
    const now = new Date().toISOString()
    const results: any[] = []

    // Support both { session_id, records } and flat array of records
    const sessionId = args?.session_id
    const records: any[] = Array.isArray(args) ? args : (args?.records ?? [])

    // Teachers whose per-student row this save made payable-relevant; auto-linked to the session
    // so they show up in salariesIPC's session_teachers-based payroll views.
    const payableTeachersBySession = new Map<number, Set<number>>()

    const upsert = db.transaction(() => {
      for (const rec of records) {
        const session_id = sessionId ?? rec.session_id
        const { student_id, status, excuse_notes = null, teacher_status = 'present' } = rec
        const validStatuses = ['attended', 'absent_excused', 'absent_unexcused']
        if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`)
        if (teacher_status !== 'present' && teacher_status !== 'absent') {
          throw new Error(`Invalid teacher_status: ${teacher_status}`)
        }

        // A student can have more than one teacher (one per service enrollment), so the caller
        // must say which teacher's row this is — attendance:getSheet returns teacher_id per
        // row precisely so the UI can send it back here. Fall back to the student's single
        // flattened teacher_id only for older callers that don't yet pass it explicitly.
        let attended_teacher_id: number | null
        if ('teacher_id' in rec) {
          attended_teacher_id = rec.teacher_id ?? null
        } else {
          const student = db.prepare('SELECT teacher_id FROM students WHERE id = ?').get(student_id) as any
          attended_teacher_id = student?.teacher_id ?? null
        }
        const sessionRow = db.prepare('SELECT session_date FROM scheduled_sessions WHERE id = ?').get(session_id) as any
        const attendanceDate: string | undefined = sessionRow?.session_date

        // SQLite treats NULL as distinct in a UNIQUE index, so ON CONFLICT never matches a
        // NULL attended_teacher_id — look up any existing no-teacher row for this student/session
        // explicitly and update it in place instead of inserting a second one.
        const existingRecord = attended_teacher_id == null
          ? db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id IS NULL').get(session_id, student_id) as any
          : db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id = ?').get(session_id, student_id, attended_teacher_id) as any

        // Attendance locking (feature 007, FR-011/FR-012), now opt-in: when
        // `attendance_edit_requires_approval` is on, a row that already exists is "locked" — the
        // moment it was first saved. Non-admins can no longer overwrite it directly; they must go
        // through attendance:requestEdit instead. With the setting off (the default) everyone
        // edits directly. Either way every edit to an existing row is audit-logged.
        if (existingRecord && !isAdmin && requiresApproval) {
          results.push({ ...existingRecord, locked: true })
          continue
        }

        if (existingRecord) {
          db.prepare(`
            UPDATE attendance_records
            SET status = ?, excuse_notes = ?, recorded_by = ?, updated_at = ?, teacher_status = ?, synced = 0
            WHERE id = ?
          `).run(status, excuse_notes, user?.id ?? null, now, teacher_status, existingRecord.id)
        } else {
          db.prepare(`
            INSERT INTO attendance_records (session_id, student_id, status, excuse_notes, recorded_by, recorded_at, updated_at, synced, attended_teacher_id, teacher_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(session_id, student_id, attended_teacher_id) DO UPDATE SET
              status = excluded.status,
              excuse_notes = excluded.excuse_notes,
              recorded_by = excluded.recorded_by,
              updated_at = excluded.updated_at,
              teacher_status = excluded.teacher_status,
              synced = 0
          `).run(session_id, student_id, status, excuse_notes, user?.id ?? null, now, now, attended_teacher_id, teacher_status)
        }

        const savedRecord = attended_teacher_id == null
          ? db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id IS NULL').get(session_id, student_id) as any
          : db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id = ?').get(session_id, student_id, attended_teacher_id) as any

        // Any direct edit to a row that already existed is itself an attendance modification and
        // must be audit-logged (FR-021), same as an approved edit request — including an
        // employee's direct edit when the approval setting is off (approved_by stays NULL then,
        // since no one approved it).
        if (existingRecord && user) {
          writeAuditLog(db, {
            attendance_record_id: savedRecord.id,
            edit_request_id: null,
            old_status: existingRecord.status,
            old_excuse_notes: existingRecord.excuse_notes,
            old_teacher_status: existingRecord.teacher_status,
            new_status: status,
            new_excuse_notes: excuse_notes,
            new_teacher_status: teacher_status,
            changed_by: user.id,
            approved_by: isAdmin ? user.id : null,
            reason: null,
            changed_at: now
          })
        }

        // Evaluate the five payment-eligibility cases (FR-008…FR-011) and keep the
        // teacher_payments ledger in sync, with duplicate protection via the UNIQUE
        // constraint on (teacher_id, student_id, attendance_date) and a paid row never
        // being auto-mutated (research.md #7).
        if (attended_teacher_id && attendanceDate) {
          recalculateAttendancePayment(db, {
            teacher_id: attended_teacher_id,
            student_id,
            attendance_record_id: savedRecord.id,
            attendance_date: attendanceDate,
            status,
            teacher_status,
            now
          })
        }

        if ((status === 'attended' || status === 'absent_unexcused') && attended_teacher_id != null) {
          if (!payableTeachersBySession.has(session_id)) payableTeachersBySession.set(session_id, new Set())
          payableTeachersBySession.get(session_id)!.add(attended_teacher_id)
        }

        results.push(savedRecord)
      }

      // Auto-assign teachers: each payable (student, teacher) row contributes that teacher to
      // the session, so per-session salary is credited without any manual teacher assignment —
      // now correctly covering every teacher a student has, not just the student's single
      // flattened teacher_id.
      for (const [session_id, teacherIds] of payableTeachersBySession) {
        for (const teacher_id of teacherIds) {
          db.prepare('INSERT OR IGNORE INTO session_teachers (session_id, employee_id, synced) VALUES (?, ?, 0)')
            .run(session_id, teacher_id)
        }
      }
    })
    upsert()
    return results
  } catch (error: any) {
    throw new Error(error.message || 'Failed to record attendance')
  }
})

// Removes attendance records for the given (student, teacher) pairs in a session. Used when a
// status is cleared in the sheet so the previously-saved record does not linger and reappear.
// Each item may be a plain student_id (legacy — deletes every teacher row for that student) or
// { student_id, teacher_id } (precise — deletes only that student's row for that specific teacher,
// since a student can now have more than one teacher's row in the same session).
// Admins delete immediately, and so do employees unless the `attendance_edit_requires_approval`
// setting is on. When it is, an employee does NOT delete — each matched record becomes a pending
// 'delete' request in attendance_edit_requests for an admin to approve (recording NEW
// attendance stays direct for employees; only removing a saved record needs approval).
ipcMain.handle('attendance:delete', async (_event, { session_id, student_ids, reason }) => {
  try {
    checkAuth()
    const db = getDb()
    const user = getCurrentUser()!
    // With the approval setting off (the default) an employee deletes directly, like an admin.
    const canDeleteDirectly = user.role === 'admin' || !attendanceEditRequiresApproval(db)
    const rawItems: any[] = Array.isArray(student_ids) ? student_ids : []
    const items: { student_id: number; teacher_id: number | null | undefined }[] = rawItems.map((it) =>
      typeof it === 'object' ? { student_id: it.student_id, teacher_id: it.teacher_id } : { student_id: it, teacher_id: undefined }
    )
    if (items.length === 0) return { ok: true, deleted: 0, requested: 0 }
    let deleted = 0
    let requested = 0
    const now = new Date().toISOString()
    db.transaction(() => {
      for (const item of items) {
        const matchTeacher = item.teacher_id !== undefined
        const records = (matchTeacher
          ? (item.teacher_id == null
              ? db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id IS NULL').all(session_id, item.student_id)
              : db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ? AND attended_teacher_id = ?').all(session_id, item.student_id, item.teacher_id))
          : db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?').all(session_id, item.student_id)
        ) as any[]

        if (!canDeleteDirectly) {
          // Employee path (approval required): submit one pending delete request per record.
          for (const record of records) {
            const existingPending = db.prepare(
              `SELECT 1 FROM attendance_edit_requests WHERE attendance_record_id = ? AND status = 'pending'`
            ).get(record.id)
            if (existingPending) continue
            const session = db.prepare('SELECT session_date FROM scheduled_sessions WHERE id = ?').get(record.session_id) as any
            db.prepare(`
              INSERT INTO attendance_edit_requests
                (attendance_record_id, student_id, teacher_id, attendance_date,
                 original_status, original_excuse_notes, original_teacher_status,
                 requested_status, requested_excuse_notes, requested_teacher_status,
                 reason, requested_by, requested_at, status, synced)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'deleted', NULL, NULL, ?, ?, ?, 'pending', 0)
            `).run(
              record.id, record.student_id, record.attended_teacher_id, session?.session_date ?? now.slice(0, 10),
              record.status, record.excuse_notes, record.teacher_status,
              (reason && String(reason).trim()) || 'حذف تسجيل حضور / Delete attendance record',
              user.id, now
            )
            requested++
          }
          continue
        }

        for (const { id: recordId } of records) {
          // A paid teacher_payments row must never disappear silently — leave its attendance
          // record (and the payment) in place rather than cascade-deleting a settled payment.
          const paid = db.prepare(`SELECT 1 FROM teacher_payments WHERE attendance_record_id = ? AND status = 'paid'`).get(recordId)
          if (paid) continue

          // Void any pending payment first (also covered by the FK's ON DELETE CASCADE, but
          // explicit here so the intent — void, not silently vanish — is unambiguous).
          db.prepare(`UPDATE teacher_payments SET status = 'void', updated_at = ?, synced = 0 WHERE status = 'pending' AND attendance_record_id = ?`)
            .run(now, recordId)
          db.prepare(`DELETE FROM attendance_conflicts WHERE attendance_record_id = ?`).run(recordId)
          const res = db.prepare(`DELETE FROM attendance_records WHERE id = ?`).run(recordId)
          deleted += Number(res.changes)
        }
      }

      // Notify every admin that delete requests are awaiting review (same as requestEdit).
      if (requested > 0) {
        const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`).all() as { id: number }[]
        for (const admin of admins) {
          insertNotification(db, {
            user_id: admin.id,
            type: 'edit_request_submitted',
            related_id: null,
            message_ar: `طلب حذف حضور جديد بانتظار المراجعة (${requested})`,
            message_en: `New attendance delete request awaiting review (${requested})`
          })
        }
      }
    })()
    return { ok: true, deleted, requested }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete attendance')
  }
})

// Full attendance history for one student (FR-019), admin-only per the access-control
// clarification (payments/payroll are never visible to non-admins, even a teacher's own).
ipcMain.handle('attendance:getStudentHistory', async (_event, { student_id }) => {
  try {
    requireAdmin()
    const db = getDb()
    return db.prepare(`
      SELECT
        ss.session_date as attendance_date,
        ar.attended_teacher_id as teacher_id,
        e.name as teacher_name,
        ar.teacher_status,
        ar.status as student_status,
        CASE WHEN tp.status IN ('pending','paid') THEN 1 ELSE 0 END as payment_generated,
        tp.status as payment_status,
        tp.session_cost
      FROM attendance_records ar
      JOIN scheduled_sessions ss ON ss.id = ar.session_id
      LEFT JOIN employees e ON e.id = ar.attended_teacher_id
      LEFT JOIN teacher_payments tp ON tp.attendance_record_id = ar.id
      WHERE ar.student_id = ?
      ORDER BY ss.session_date DESC
    `).all(student_id).map((row: any) => ({ ...row, payment_generated: !!row.payment_generated }))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get attendance history')
  }
})

ipcMain.handle('attendance:getConflicts', async () => {
  try {
    requireAdmin()
    const db = getDb()
    return db.prepare('SELECT * FROM attendance_conflicts WHERE reviewed = 0 ORDER BY created_at DESC').all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get conflicts')
  }
})

ipcMain.handle('attendance:resolveConflict', async (_event, { conflict_id, final_status }) => {
  try {
    requireAdmin()
    const db = getDb()
    const conflict = db.prepare('SELECT * FROM attendance_conflicts WHERE id = ?').get(conflict_id) as any
    if (!conflict) throw new Error('التعارض غير موجود / Conflict not found')
    db.prepare('UPDATE attendance_conflicts SET reviewed = 1 WHERE id = ?').run(conflict_id)
    db.prepare('UPDATE attendance_records SET status = ?, updated_at = ?, synced = 0 WHERE id = ?')
      .run(final_status, new Date().toISOString(), conflict.attendance_record_id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to resolve conflict')
  }
})

ipcMain.handle('attendance:getSummary', async (_event, { employee_id, month, year }) => {
  try {
    requireAdmin()
    const db = getDb()
    const arabicMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
    const monthIdx = arabicMonths.indexOf(String(month))
    const monthNum = monthIdx !== -1 ? String(monthIdx + 1).padStart(2, '0') : String(month).padStart(2, '0')
    const yearStr = String(year)
    const monthStart = `${yearStr}-${monthNum}-01`
    const monthEnd = `${yearStr}-${monthNum}-31`

    const sessions = db.prepare(`
      SELECT ss.id FROM scheduled_sessions ss
      JOIN session_teachers st ON st.session_id = ss.id
      WHERE st.employee_id = ? AND ss.session_date >= ? AND ss.session_date <= ?
    `).all(employee_id, monthStart, monthEnd) as { id: number }[]

    const sessionIds = sessions.map((s) => s.id)
    if (sessionIds.length === 0) {
      return { total_sessions: 0, payable_sessions: 0, excused_absences: 0, unexcused_absences: 0, breakdown: [] }
    }

    const placeholders = sessionIds.map(() => '?').join(',')
    const records = db.prepare(`
      SELECT status, COUNT(*) as cnt FROM attendance_records WHERE session_id IN (${placeholders}) GROUP BY status
    `).all(...sessionIds) as { status: string; cnt: number }[]

    const attended = records.find((r) => r.status === 'attended')?.cnt ?? 0
    const excused = records.find((r) => r.status === 'absent_excused')?.cnt ?? 0
    const unexcused = records.find((r) => r.status === 'absent_unexcused')?.cnt ?? 0

    return {
      total_sessions: sessionIds.length,
      payable_sessions: attended + unexcused,
      excused_absences: excused,
      unexcused_absences: unexcused,
      breakdown: records
    }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get attendance summary')
  }
})

// ── Attendance Edit Approval Workflow (feature 007) ────────────────────────────────────────

// Employee submits a proposed change to a locked attendance record (FR-014). Admins never call
// this — they edit directly via attendance:record (FR-012).
ipcMain.handle('attendance:requestEdit', async (_event, args) => {
  try {
    checkAuth()
    const user = getCurrentUser()!
    if (user.role === 'admin') {
      throw new Error('Admins edit attendance directly and do not need to submit an edit request')
    }
    const db = getDb()
    if (!attendanceEditRequiresApproval(db)) {
      throw new Error('Attendance edit approval is disabled — edit the attendance record directly')
    }
    const { attendance_record_id, requested_status, requested_excuse_notes = null, requested_teacher_status = null, reason } = args

    if (!reason || !String(reason).trim()) {
      throw new Error('A reason is required to request an attendance edit')
    }

    const record = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(attendance_record_id) as any
    if (!record) throw new Error('Attendance record not found')

    const existingPending = db.prepare(
      `SELECT * FROM attendance_edit_requests WHERE attendance_record_id = ? AND status = 'pending'`
    ).get(attendance_record_id) as any
    if (existingPending) {
      const err: any = new Error('A pending edit request already exists for this attendance record')
      err.existingRequest = existingPending
      throw err
    }

    const session = db.prepare('SELECT session_date FROM scheduled_sessions WHERE id = ?').get(record.session_id) as any
    const now = new Date().toISOString()

    const result = db.prepare(`
      INSERT INTO attendance_edit_requests
        (attendance_record_id, student_id, teacher_id, attendance_date,
         original_status, original_excuse_notes, original_teacher_status,
         requested_status, requested_excuse_notes, requested_teacher_status,
         reason, requested_by, requested_at, status, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
    `).run(
      attendance_record_id, record.student_id, record.attended_teacher_id, session?.session_date ?? null,
      record.status, record.excuse_notes, record.teacher_status,
      requested_status, requested_excuse_notes, requested_teacher_status,
      reason, user.id, now
    )

    const requestId = Number(result.lastInsertRowid)

    // Notify every admin (FR-019).
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`).all() as { id: number }[]
    for (const admin of admins) {
      insertNotification(db, {
        user_id: admin.id,
        type: 'edit_request_submitted',
        related_id: requestId,
        message_ar: `طلب تعديل حضور جديد بانتظار المراجعة`,
        message_en: `New attendance edit request awaiting review`
      })
    }

    return db.prepare('SELECT * FROM attendance_edit_requests WHERE id = ?').get(requestId)
  } catch (error: any) {
    const err = new Error(error.message || 'Failed to submit edit request') as any
    if (error.existingRequest) err.existingRequest = error.existingRequest
    throw err
  }
})

// Admin sees every request; an employee sees only their own submissions.
ipcMain.handle('attendance:listEditRequests', async (_event, args) => {
  try {
    checkAuth()
    const user = getCurrentUser()!
    const db = getDb()
    const status = args?.status
    const conditions: string[] = []
    const params: any[] = []

    if (user.role !== 'admin') {
      conditions.push('requested_by = ?')
      params.push(user.id)
    }
    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }
    if (args?.student_id) {
      conditions.push('student_id = ?')
      params.push(args.student_id)
    }
    if (args?.teacher_id) {
      conditions.push('teacher_id = ?')
      params.push(args.teacher_id)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return db.prepare(`SELECT * FROM attendance_edit_requests ${where} ORDER BY requested_at DESC`).all(...params)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list edit requests')
  }
})

// Admin approves or rejects a pending request (FR-016…FR-018).
ipcMain.handle('attendance:decideEditRequest', async (_event, args) => {
  try {
    requireAdmin()
    const admin = getCurrentUser()!
    const db = getDb()
    const { id, decision, decision_notes = null } = args
    if (decision !== 'approve' && decision !== 'reject') {
      throw new Error(`Invalid decision: ${decision}`)
    }

    const now = new Date().toISOString()
    let result: any = null

    const run = db.transaction(() => {
      const request = db.prepare('SELECT * FROM attendance_edit_requests WHERE id = ?').get(id) as any
      if (!request) throw new Error('Edit request not found')
      if (request.status !== 'pending') throw new Error('This request has already been decided')

      if (decision === 'reject') {
        // Guard against a concurrent decision on the same request (Edge Cases) — only the
        // first decision to flip status away from 'pending' takes effect.
        const upd = db.prepare(
          `UPDATE attendance_edit_requests SET status = 'rejected', decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ? AND status = 'pending'`
        ).run(admin.id, now, decision_notes, id)
        if (Number(upd.changes) === 0) throw new Error('This request has already been decided')
      } else {
        const upd = db.prepare(
          `UPDATE attendance_edit_requests SET status = 'approved', decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ? AND status = 'pending'`
        ).run(admin.id, now, decision_notes, id)
        if (Number(upd.changes) === 0) throw new Error('This request has already been decided')

        const record = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(request.attendance_record_id) as any
        if (!record) throw new Error('Attendance record no longer exists — cannot apply approved changes')

        if (request.requested_status === 'deleted') {
          const tp = db.prepare('SELECT id, status FROM teacher_payments WHERE attendance_record_id = ?').get(record.id) as any
          if (tp && tp.status === 'paid') {
            throw new Error('Cannot delete this attendance record because the teacher payment has already been paid out.')
          }
          if (tp) {
            db.prepare('DELETE FROM teacher_payments WHERE id = ?').run(tp.id)
          }

          writeAuditLog(db, {
            attendance_record_id: record.id,
            edit_request_id: request.id,
            old_status: request.original_status,
            old_excuse_notes: request.original_excuse_notes,
            old_teacher_status: request.original_teacher_status,
            new_status: request.requested_status,
            new_excuse_notes: request.requested_excuse_notes,
            new_teacher_status: request.requested_teacher_status,
            changed_by: request.requested_by,
            approved_by: admin.id,
            reason: request.reason,
            changed_at: now
          })

          db.prepare('DELETE FROM attendance_records WHERE id = ?').run(record.id)
        } else {
          db.prepare(`
            UPDATE attendance_records
            SET status = ?, excuse_notes = ?, teacher_status = ?, updated_at = ?, synced = 0
            WHERE id = ?
          `).run(request.requested_status, request.requested_excuse_notes, request.requested_teacher_status, now, record.id)

          writeAuditLog(db, {
            attendance_record_id: record.id,
            edit_request_id: request.id,
            old_status: request.original_status,
            old_excuse_notes: request.original_excuse_notes,
            old_teacher_status: request.original_teacher_status,
            new_status: request.requested_status,
            new_excuse_notes: request.requested_excuse_notes,
            new_teacher_status: request.requested_teacher_status,
            changed_by: request.requested_by,
            approved_by: admin.id,
            reason: request.reason,
            changed_at: now
          })

          if (record.attended_teacher_id && request.attendance_date) {
            recalculateAttendancePayment(db, {
              teacher_id: record.attended_teacher_id,
              student_id: record.student_id,
              attendance_record_id: record.id,
              attendance_date: request.attendance_date,
              status: request.requested_status,
              teacher_status: request.requested_teacher_status,
              now
            })
          }
        }
      }

      insertNotification(db, {
        user_id: request.requested_by,
        type: decision === 'approve' ? 'edit_request_approved' : 'edit_request_rejected',
        related_id: request.id,
        message_ar: decision === 'approve' ? 'تمت الموافقة على طلب تعديل الحضور الخاص بك' : 'تم رفض طلب تعديل الحضور الخاص بك',
        message_en: decision === 'approve' ? 'Your attendance edit request was approved' : 'Your attendance edit request was rejected'
      })

      result = db.prepare('SELECT * FROM attendance_edit_requests WHERE id = ?').get(id)
    })
    run()
    return result
  } catch (error: any) {
    throw new Error(error.message || 'Failed to decide edit request')
  }
})

ipcMain.handle('attendance:getAuditLog', async (_event, { attendance_record_id }) => {
  try {
    requireAdmin()
    const db = getDb()
    return db.prepare(
      'SELECT * FROM attendance_audit_log WHERE attendance_record_id = ? ORDER BY changed_at ASC'
    ).all(attendance_record_id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to get audit log')
  }
})
