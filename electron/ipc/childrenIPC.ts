import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'
import { getCurrentUser } from './authIPC.js'
import { getChildStatement } from '../services/statementService.js'
import type { Child } from '../../src/types/index.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

// Egyptian mobile: starts with 01, optionally prefixed by 2 or +2 (feature 004, FR-001).
const GUARDIAN_PHONE_RE = /^(?:\+?2)?01[0-9]{9}$/

function validateGuardianPhone(phone: string): void {
  if (!GUARDIAN_PHONE_RE.test((phone ?? '').toString().trim())) {
    throw new Error(
      'رقم هاتف ولي الأمر يجب أن يكون بالتنسيق الصحيح (مثال: 01012345678 أو 201012345678 أو +201012345678) / Guardian phone must be a valid format (e.g., 01012345678, 201012345678, or +201012345678)'
    )
  }
}

function validateChildPhone(phone: string | null): void {
  if (phone && phone.toString().trim() !== '') {
    if (!GUARDIAN_PHONE_RE.test(phone.toString().trim())) {
      throw new Error(
        'رقم هاتف الطفل يجب أن يكون بالتنسيق الصحيح (مثال: 01012345678 أو +201012345678) / Child phone must be a valid format (e.g., 01012345678, 201012345678, or +201012345678)'
      )
    }
  }
}

// Normalize the feature-004 lesson/fee fields from an input payload and compute
// the monthly fee snapshot = (sessions_baseline + extra_lessons) * session_price.
function buildLessonFields(src: any): {
  teacher_id: number | null
  lesson_days: string | null
  sessions_baseline: number
  extra_lessons: number
  session_price: number | null
  monthly_fee: number | null
} {
  const sessions_baseline =
    src.sessions_baseline === undefined || src.sessions_baseline === null
      ? 8
      : Math.max(0, Math.trunc(Number(src.sessions_baseline)))
  const extra_lessons =
    src.extra_lessons === undefined || src.extra_lessons === null
      ? 0
      : Math.max(0, Math.trunc(Number(src.extra_lessons)))
  const session_price =
    src.session_price === undefined || src.session_price === null || src.session_price === ''
      ? null
      : Number(src.session_price)

  if (session_price !== null && session_price < 0) {
    throw new Error('سعر الجلسة لا يمكن أن يكون سالباً / Session price cannot be negative')
  }

  const lesson_days =
    src.lesson_days === undefined || src.lesson_days === null
      ? null
      : Array.isArray(src.lesson_days)
        ? JSON.stringify(src.lesson_days)
        : String(src.lesson_days)

  const monthly_fee =
    session_price === null ? null : Number(((sessions_baseline + extra_lessons) * session_price).toFixed(2))

  return {
    teacher_id:
      src.teacher_id === undefined || src.teacher_id === null || src.teacher_id === ''
        ? null
        : Number(src.teacher_id),
    lesson_days,
    sessions_baseline,
    extra_lessons,
    session_price,
    monthly_fee,
  }
}

ipcMain.handle('children:get', async (_event, { search, service, activeOnly }) => {
  try {
    checkAuth()
    const db = getDb()
    
    let query = 'SELECT * FROM children WHERE 1=1'
    const params: any[] = []
    
    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`
      query += ' AND (name LIKE ? OR guardian LIKE ? OR guardian_phone LIKE ? OR child_phone LIKE ? OR national_id LIKE ?)'
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
    }
    
    if (service) {
      query += ' AND id IN (SELECT child_id FROM child_services WHERE service = ?)'
      params.push(service)
    }
    
    // Default to activeOnly = true if not explicitly set to false
    if (activeOnly !== false) {
      query += ' AND is_active = 1'
    }
    
    query += ' ORDER BY name ASC'
    
    const rows = db.prepare(query).all(...params) as Child[]
    for (const row of rows) {
      row.services = db.prepare('SELECT * FROM child_services WHERE child_id = ?').all(row.id) as any[]
    }
    return rows
  } catch (error: any) {
    console.error('Failed to get children:', error)
    throw new Error(error.message || 'Failed to get children')
  }
})

ipcMain.handle('children:add', async (_event, childInput) => {
  try {
    // Employees (not only admins) may create children (feature 004, FR-012).
    checkAuth()
    const db = getDb()

    const { name, guardian, guardian_phone, child_phone, national_id, reg_date, notes, services } = childInput
    const enrollments = services || (childInput.service ? [{ service: childInput.service, unit: childInput.unit, price: childInput.price }] : [])

    if (!name || !guardian || !guardian_phone || enrollments.length === 0 || !reg_date) {
      throw new Error('جميع الحقول الإلزامية مطلوبة / Missing required fields')
    }

    validateGuardianPhone(guardian_phone)
    if (child_phone) {
      validateChildPhone(child_phone)
    }

    // Duplicate services are now allowed — each enrollment can have its own teacher/days

    const lesson = buildLessonFields(childInput)
    const now = new Date().toISOString()

    const tx = db.transaction(() => {
      const first = enrollments[0]
      const result = db.prepare(`
        INSERT INTO children (
          name, guardian, guardian_phone, child_phone, national_id,
          service, unit, price, reg_date, notes,
          photo_url, photo_public_id, teacher_id, lesson_days,
          sessions_baseline, extra_lessons, session_price, monthly_fee,
          is_active, created_at, updated_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
      `).run(
        name, guardian, guardian_phone, child_phone || null, national_id || null,
        first.service, first.unit, first.price, reg_date, notes || null,
        childInput.photo_url || null, childInput.photo_public_id || null,
        lesson.teacher_id, lesson.lesson_days,
        lesson.sessions_baseline, lesson.extra_lessons, lesson.session_price, lesson.monthly_fee,
        now, now
      )

      const childId = Number(result.lastInsertRowid)
      const insertSvc = db.prepare(`INSERT INTO child_services (child_id, service, unit, price, teacher_id, lesson_days, extra_lessons, session_price, teacher_session_rate, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)

      for (const s of enrollments) {
        const sTeacherId = s.teacher_id != null && s.teacher_id !== '' ? Number(s.teacher_id) : null
        const sLessonDays = Array.isArray(s.lesson_days) ? JSON.stringify(s.lesson_days) : (s.lesson_days || null)
        const sExtraLessons = s.extra_lessons != null ? Number(s.extra_lessons) : 0
        const sSessionPrice = s.session_price != null && s.session_price !== '' ? Number(s.session_price) : null
        const sTeacherSessionRate = s.teacher_session_rate != null && s.teacher_session_rate !== '' ? Number(s.teacher_session_rate) : null
        insertSvc.run(childId, s.service, s.unit, s.price, sTeacherId, sLessonDays, sExtraLessons, sSessionPrice, sTeacherSessionRate, now, now)
      }
      return childId
    })
    
    const createdId = tx()
    const createdChild = db.prepare('SELECT * FROM children WHERE id = ?').get(createdId) as Child
    createdChild.services = db.prepare('SELECT * FROM child_services WHERE child_id = ?').all(createdId) as any[]
    return createdChild
  } catch (error: any) {
    console.error('Failed to add child:', error)
    throw new Error(error.message || 'Failed to add child')
  }
})

ipcMain.handle('children:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    if (!id || !patch) {
      throw new Error('Child ID and patch data are required')
    }
    
    // Check if child exists (load lesson/fee fields for merge + recompute)
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(id) as any
    if (!child) {
      throw new Error('الطفل غير موجود / Child not found')
    }

    if (patch.guardian_phone !== undefined) {
      validateGuardianPhone(patch.guardian_phone)
    }
    if (patch.child_phone !== undefined) {
      validateChildPhone(patch.child_phone)
    }

    const tx = db.transaction(() => {
      const enrollments = patch.services
      if (enrollments) {
        if (enrollments.length === 0) throw new Error('يجب اختيار خدمة واحدة على الأقل / At least one service is required')
        // Duplicate services are now allowed — each enrollment can have its own teacher/days
        patch.service = enrollments[0].service
        patch.unit = enrollments[0].unit
        patch.price = enrollments[0].price
      }

      let query = 'UPDATE children SET '
      const params: any[] = []

      const allowedKeys = [
        'name', 'guardian', 'guardian_phone', 'child_phone', 'national_id',
        'service', 'unit', 'price', 'reg_date', 'notes', 'is_active',
        // Feature 004 — directly settable enrollment fields
        'photo_url', 'photo_public_id'
      ]

      for (const key of allowedKeys) {
        if (patch[key] !== undefined) {
          query += `${key} = ?, `
          params.push(patch[key])
        }
      }

      // Feature 004 — teacher/lesson/fee: if any of these are present, merge
      // with the current row and recompute the monthly_fee snapshot.
      const lessonKeys = ['teacher_id', 'lesson_days', 'sessions_baseline', 'extra_lessons', 'session_price']
      if (lessonKeys.some((k) => patch[k] !== undefined)) {
        const merged = buildLessonFields({
          teacher_id: patch.teacher_id !== undefined ? patch.teacher_id : child.teacher_id,
          lesson_days: patch.lesson_days !== undefined ? patch.lesson_days : child.lesson_days,
          sessions_baseline: patch.sessions_baseline !== undefined ? patch.sessions_baseline : child.sessions_baseline,
          extra_lessons: patch.extra_lessons !== undefined ? patch.extra_lessons : child.extra_lessons,
          session_price: patch.session_price !== undefined ? patch.session_price : child.session_price,
        })
        for (const [k, v] of Object.entries(merged)) {
          query += `${k} = ?, `
          params.push(v)
        }
      }

      const now = new Date().toISOString()
      
      if (params.length > 0) {
        query += 'updated_at = ?, synced = 0 WHERE id = ?'
        params.push(now, id)
        db.prepare(query).run(...params)
      }

      if (enrollments) {
        // A child can now have more than one enrollment with the SAME service name (feature
        // 006 — multiple teachers for the same service), so service NAME can no longer
        // disambiguate which payment belongs to which enrollment. Existing rows are matched
        // and updated IN PLACE by id (preserving their id, and therefore every payment's
        // service_id FK, untouched) instead of deleting everything and re-linking by name —
        // that old approach could collapse two same-named enrollments' payments onto a single
        // service_id and hit payments' UNIQUE(child_id, service_id, month, year) constraint.
        const existingServices = db.prepare('SELECT id FROM child_services WHERE child_id = ?').all(id) as { id: number }[]
        const existingIds = new Set(existingServices.map((e) => e.id))
        const incomingIds = new Set(enrollments.filter((s: any) => s.id != null).map((s: any) => Number(s.id)))

        // Remove only rows genuinely dropped from the form (existed before, not present now).
        const removedIds = [...existingIds].filter((eid) => !incomingIds.has(eid))
        if (removedIds.length > 0) {
          const placeholders = removedIds.map(() => '?').join(',')
          db.prepare(`UPDATE payments SET service_id = NULL WHERE child_id = ? AND service_id IN (${placeholders})`).run(id, ...removedIds)
          db.prepare(`DELETE FROM child_services WHERE id IN (${placeholders})`).run(...removedIds)
        }

        const updateSvc = db.prepare(`
          UPDATE child_services
          SET service = ?, unit = ?, price = ?, teacher_id = ?, lesson_days = ?, extra_lessons = ?, session_price = ?, teacher_session_rate = ?, updated_at = ?, synced = 0
          WHERE id = ? AND child_id = ?
        `)
        const insertSvc = db.prepare(`INSERT INTO child_services (child_id, service, unit, price, teacher_id, lesson_days, extra_lessons, session_price, teacher_session_rate, created_at, updated_at, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
        for (const s of enrollments) {
          const sTeacherId = s.teacher_id != null && s.teacher_id !== '' ? Number(s.teacher_id) : null
          const sLessonDays = Array.isArray(s.lesson_days) ? JSON.stringify(s.lesson_days) : (s.lesson_days || null)
          const sExtraLessons = s.extra_lessons != null ? Number(s.extra_lessons) : 0
          const sSessionPrice = s.session_price != null && s.session_price !== '' ? Number(s.session_price) : null
          const sTeacherSessionRate = s.teacher_session_rate != null && s.teacher_session_rate !== '' ? Number(s.teacher_session_rate) : null
          const existingId = s.id != null ? Number(s.id) : null
          if (existingId != null && existingIds.has(existingId)) {
            updateSvc.run(s.service, s.unit, s.price, sTeacherId, sLessonDays, sExtraLessons, sSessionPrice, sTeacherSessionRate, now, existingId, id)
          } else {
            insertSvc.run(id, s.service, s.unit, s.price, sTeacherId, sLessonDays, sExtraLessons, sSessionPrice, sTeacherSessionRate, now, now)
          }
        }

        // Only brand-new enrollments (no prior id — never had a payment linked to them) fall
        // back to matching by name, and only among child_services rows that still have no
        // payments pointing at them.
        db.prepare(`
          UPDATE payments
          SET service_id = (
            SELECT cs.id FROM child_services cs
            WHERE cs.child_id = payments.child_id AND cs.service = payments.service
              AND NOT EXISTS (SELECT 1 FROM payments p2 WHERE p2.service_id = cs.id)
            LIMIT 1
          )
          WHERE child_id = ? AND service_id IS NULL
        `).run(id)
      }
    })
    
    tx()
    
    const updatedChild = db.prepare('SELECT * FROM children WHERE id = ?').get(id) as Child
    updatedChild.services = db.prepare('SELECT * FROM child_services WHERE child_id = ?').all(id) as any[]
    return updatedChild
  } catch (error: any) {
    console.error('Failed to update child:', error)
    throw new Error(error.message || 'Failed to update child')
  }
})

ipcMain.handle('children:deactivate', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    const child = db.prepare('SELECT id FROM children WHERE id = ?').get(id)
    if (!child) {
      throw new Error('الطفل غير موجود / Child not found')
    }
    
    db.prepare('UPDATE children SET is_active = 0, updated_at = ?, synced = 0 WHERE id = ?').run(
      new Date().toISOString(),
      id
    )
    
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to deactivate child:', error)
    throw new Error(error.message || 'Failed to deactivate child')
  }
})


// Hard delete — only allowed for children already deactivated (is_active = 0).
// All dependent tables reference children(id) with ON DELETE CASCADE, so their
// rows (services, payments, attendance, ...) are removed with the child.
ipcMain.handle('children:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()

    const child = db.prepare('SELECT id, is_active FROM children WHERE id = ?').get(id) as any
    if (!child) {
      throw new Error('الطفل غير موجود / Child not found')
    }
    if (child.is_active !== 0) {
      throw new Error('لا يمكن حذف طفل نشط — يجب إلغاء تفعيله أولاً / Cannot delete an active child — deactivate first')
    }

    db.prepare('DELETE FROM children WHERE id = ?').run(id)

    return { ok: true }
  } catch (error: any) {
    console.error('Failed to delete child:', error)
    throw new Error(error.message || 'Failed to delete child')
  }
})


ipcMain.handle('children:statement', async (_event, { childId }) => {
  try {
    checkAuth()
    if (!childId) {
      throw new Error('Child ID is required')
    }
    const db = getDb()
    
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
    if (!child) {
      throw new Error('الطفل غير موجود / Child not found')
    }

    // Resolve the assigned teacher's name for display (feature 004, FR-013).
    if (child.teacher_id) {
      const teacher = db.prepare('SELECT name FROM employees WHERE id = ?').get(child.teacher_id) as any
      child.teacher_name = teacher?.name ?? null
    }

    const payments = db.prepare('SELECT * FROM payments WHERE child_id = ?').all(childId) as any[]

    return getChildStatement(child, payments, new Date())
  } catch (error: any) {
    console.error('Failed to get child statement:', error)
    throw new Error(error.message || 'Failed to get child statement')
  }
})