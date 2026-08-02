import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'
import { recordLocalTombstone } from '../services/tombstones.js'

/** Arabic month names in calendar order — the same labels `payments.month` stores. */
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const round2 = (n: number) => Number(n.toFixed(2))

/**
 * Due date of instalment `index` (0-based) counted in whole months from `start`.
 * The day-of-month is clamped to the target month's length, so a plan starting on the 31st
 * falls on the 30th/28th in shorter months instead of rolling over into the next one.
 */
export function addMonthsClamped(start: string, index: number): string {
  const d = new Date(`${start}T00:00:00`)
  const targetMonth = d.getMonth() + index
  const year = d.getFullYear() + Math.floor(targetMonth / 12)
  const month = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(d.getDate(), lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Splits `total` into `count` instalments, one per month starting at `startDate`.
 *
 * The split is even to the piastre, with any rounding remainder folded into the LAST
 * instalment — so the parts always add back up to exactly `total`, and the whole amount is
 * never dumped onto a single month as one lump of arrears.
 * Pure and exported so the schedule maths is unit-testable without a database.
 */
export function buildInstallmentSchedule(
  total: number,
  count: number,
  startDate: string
): { seq: number; due_date: string; month: string; year: number; amount: number }[] {
  const per = Math.floor((total / count) * 100) / 100
  const rows = []
  let allocated = 0
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1
    const amount = isLast ? round2(total - allocated) : per
    allocated = round2(allocated + amount)
    const due_date = addMonthsClamped(startDate, i)
    const d = new Date(`${due_date}T00:00:00`)
    rows.push({
      seq: i + 1,
      due_date,
      month: ARABIC_MONTHS[d.getMonth()],
      year: d.getFullYear(),
      amount,
    })
  }
  return rows
}

/** Derives status from an instalment's amount vs. what has been paid against it. */
function statusFor(amount: number, paid: number): 'unpaid' | 'partial' | 'paid' {
  if (paid <= 0) return 'unpaid'
  if (paid >= amount) return 'paid'
  return 'partial'
}

/**
 * Rebuilds a student's instalment plan. Any amounts already collected are preserved by
 * re-applying the previous plan's total paid, oldest instalment first — so re-planning after a
 * price change never silently wipes a family's payment history.
 */
export function regenerateInstallments(
  db: any,
  args: { student_id: number; count: number; total: number; start_date: string; service_id?: number | null }
): { created: number } {
  const { student_id, count, total, start_date } = args
  const service_id = args.service_id ?? null
  const now = new Date().toISOString()

  const previouslyPaid = Number(
    (db.prepare('SELECT COALESCE(SUM(paid), 0) AS s FROM student_installments WHERE student_id = ?')
      .get(student_id) as any).s ?? 0
  )

  // Tombstone every row being torn down: the rebuilt plan gets fresh ids, so without this the
  // next pull would resurrect the old instalments from the cloud alongside the new ones.
  for (const row of db.prepare('SELECT id FROM student_installments WHERE student_id = ?').all(student_id) as { id: number }[]) {
    recordLocalTombstone(db, 'student_installments', row.id)
  }
  db.prepare('DELETE FROM student_installments WHERE student_id = ?').run(student_id)

  const insert = db.prepare(`
    INSERT INTO student_installments (
      student_id, service_id, seq, due_date, month, year,
      amount, paid, balance, status, created_at, updated_at, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)

  let remainingPaid = previouslyPaid
  const schedule = buildInstallmentSchedule(total, count, start_date)
  for (const row of schedule) {
    const paid = round2(Math.min(remainingPaid, row.amount))
    remainingPaid = round2(remainingPaid - paid)
    insert.run(
      student_id, service_id, row.seq, row.due_date, row.month, row.year,
      row.amount, paid, round2(row.amount - paid), statusFor(row.amount, paid), now, now
    )
  }

  db.prepare(`
    UPDATE students
    SET installments_count = ?, installment_total = ?, installment_start_date = ?,
        updated_at = ?, synced = 0
    WHERE id = ?
  `).run(count, total, start_date, now, student_id)

  return { created: schedule.length }
}

/** Validates and normalises the plan inputs shared by students:add/update and installments:plan. */
export function normalizePlanInput(src: any): { count: number; total: number; start_date: string } {
  const count = Math.trunc(Number(src.count ?? src.installments_count))
  const total = Number(src.total ?? src.installment_total)
  const start_date = String(src.start_date ?? src.installment_start_date ?? '').slice(0, 10)

  if (!Number.isFinite(count) || count < 1 || count > 60) {
    throw new Error('عدد الدفعات يجب أن يكون بين 1 و 60 / Number of instalments must be between 1 and 60')
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('إجمالي المبلغ يجب أن يكون أكبر من صفر / Total amount must be greater than zero')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    throw new Error('تاريخ أول دفعة غير صالح / First instalment date is invalid')
  }
  return { count, total: round2(total), start_date }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Computes a schedule WITHOUT persisting it — the student form's live preview, so the admin sees
 * exactly which months get charged what before saving. Shares `buildInstallmentSchedule` with the
 * real plan, so the preview can never drift from what actually gets written.
 */
ipcMain.handle('installments:preview', async (_event, args) => {
  try {
    checkAuth()
    const plan = normalizePlanInput(args)
    return buildInstallmentSchedule(plan.total, plan.count, plan.start_date)
  } catch (error: any) {
    // The preview runs on every keystroke; a half-typed plan is not an error worth logging.
    throw new Error(error.message || 'Failed to preview instalment schedule')
  }
})

ipcMain.handle('installments:plan', async (_event, args) => {
  try {
    requireAdmin()
    const db = getDb()
    const student_id = Number(args?.student_id)
    if (!student_id) throw new Error('Student ID is required')

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(student_id)
    if (!student) throw new Error('الطالب غير موجود / Student not found')

    const plan = normalizePlanInput(args)
    let result = { created: 0 }
    db.transaction(() => {
      result = regenerateInstallments(db, { student_id, service_id: args?.service_id ?? null, ...plan })
    })()

    return {
      ok: true,
      ...result,
      installments: db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq ASC').all(student_id),
    }
  } catch (error: any) {
    console.error('Failed to build instalment plan:', error)
    throw new Error(error.message || 'Failed to build instalment plan')
  }
})

/**
 * Lists instalments, optionally scoped to a student and/or a period. `month`/`year` filter by the
 * month an instalment is DUE in — which is the whole point of the plan: each month shows only the
 * instalment that falls due then, never the entire outstanding fee.
 */
ipcMain.handle('installments:list', async (_event, args = {}) => {
  try {
    checkAuth()
    const db = getDb()

    let query = `
      SELECT i.*, s.name AS student_name, s.guardian AS student_guardian,
             s.guardian_phone AS student_guardian_phone, s.is_active AS student_is_active,
             s.branch_id AS branch_id
      FROM student_installments i
      JOIN students s ON s.id = i.student_id
      WHERE 1=1
    `
    const params: any[] = []

    if (args?.student_id) {
      query += ' AND i.student_id = ?'
      params.push(Number(args.student_id))
    }
    if (args?.month) {
      query += ' AND i.month = ?'
      params.push(args.month)
    }
    if (args?.year) {
      query += ' AND i.year = ?'
      params.push(Number(args.year))
    }
    if (args?.from) {
      query += ' AND i.due_date >= ?'
      params.push(args.from)
    }
    if (args?.to) {
      query += ' AND i.due_date <= ?'
      params.push(args.to)
    }
    if (args?.status) {
      query += ' AND i.status = ?'
      params.push(args.status)
    }
    if (args?.branch_id) {
      query += ' AND s.branch_id = ?'
      params.push(Number(args.branch_id))
    }

    query += ' ORDER BY i.due_date ASC, i.seq ASC'

    const rows = db.prepare(query).all(...params) as any[]
    const today = new Date().toISOString().slice(0, 10)
    for (const r of rows) {
      // Overdue is derived, never stored — it changes with the calendar, not with an edit.
      r.is_overdue = r.status !== 'paid' && r.due_date < today
    }

    const summary = rows.reduce(
      (acc, r) => {
        acc.total = round2(acc.total + r.amount)
        acc.collected = round2(acc.collected + r.paid)
        acc.outstanding = round2(acc.outstanding + r.balance)
        if (r.is_overdue) acc.overdue = round2(acc.overdue + r.balance)
        return acc
      },
      { total: 0, collected: 0, outstanding: 0, overdue: 0 }
    )

    return { installments: rows, summary }
  } catch (error: any) {
    console.error('Failed to list instalments:', error)
    throw new Error(error.message || 'Failed to list instalments')
  }
})

/**
 * Month-by-month view of everything due across a year: one bucket per month, so the UI can show
 * "this is what is owed in March" rather than one aggregate arrears figure.
 */
ipcMain.handle('installments:calendar', async (_event, { year, student_id = null } = {} as any) => {
  try {
    checkAuth()
    const db = getDb()
    const y = Number(year) || new Date().getFullYear()

    let query = `
      SELECT i.month, i.year,
             COUNT(*) AS count,
             COALESCE(SUM(i.amount), 0) AS due,
             COALESCE(SUM(i.paid), 0) AS collected,
             COALESCE(SUM(i.balance), 0) AS outstanding
      FROM student_installments i
      WHERE i.year = ?
    `
    const params: any[] = [y]
    if (student_id) {
      query += ' AND i.student_id = ?'
      params.push(Number(student_id))
    }
    query += ' GROUP BY i.year, i.month'

    const rows = db.prepare(query).all(...params) as any[]
    const byMonth = new Map(rows.map((r) => [r.month, r]))

    // Emit all twelve months so the caller gets a complete, gap-free year.
    return ARABIC_MONTHS.map((month, idx) => {
      const r = byMonth.get(month)
      return {
        month,
        month_index: idx + 1,
        year: y,
        count: r?.count ?? 0,
        due: round2(r?.due ?? 0),
        collected: round2(r?.collected ?? 0),
        outstanding: round2(r?.outstanding ?? 0),
      }
    })
  } catch (error: any) {
    console.error('Failed to build instalment calendar:', error)
    throw new Error(error.message || 'Failed to build instalment calendar')
  }
})

ipcMain.handle('installments:pay', async (_event, { id, amount, payment_method_id = null, paid_date = null, notes = null }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!id) throw new Error('Instalment ID is required')

    const inst = db.prepare('SELECT * FROM student_installments WHERE id = ?').get(id) as any
    if (!inst) throw new Error('الدفعة غير موجودة / Instalment not found')

    const amt = round2(Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error('المبلغ يجب أن يكون أكبر من صفر / Amount must be greater than zero')
    }

    const paid = round2(Number(inst.paid) + amt)
    if (paid > Number(inst.amount) + 0.001) {
      throw new Error('المبلغ أكبر من قيمة الدفعة المتبقية / Amount exceeds the instalment balance')
    }

    let methodName: string | null = inst.payment_method_name ?? null
    if (payment_method_id != null) {
      const m = db.prepare('SELECT name FROM payment_methods WHERE id = ?').get(payment_method_id) as any
      methodName = m?.name ?? null
    }

    const now = new Date().toISOString()
    db.prepare(`
      UPDATE student_installments
      SET paid = ?, balance = ?, status = ?, paid_date = ?,
          payment_method_id = ?, payment_method_name = ?, notes = COALESCE(?, notes),
          updated_at = ?, synced = 0
      WHERE id = ?
    `).run(
      paid, round2(Number(inst.amount) - paid), statusFor(Number(inst.amount), paid),
      paid_date || now.slice(0, 10),
      payment_method_id ?? inst.payment_method_id ?? null, methodName, notes, now, id
    )

    return db.prepare('SELECT * FROM student_installments WHERE id = ?').get(id)
  } catch (error: any) {
    console.error('Failed to record instalment payment:', error)
    throw new Error(error.message || 'Failed to record instalment payment')
  }
})

/** Adjusts a single instalment (date / amount / note) without rebuilding the whole plan. */
ipcMain.handle('installments:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id || !patch) throw new Error('Instalment ID and patch data are required')

    const inst = db.prepare('SELECT * FROM student_installments WHERE id = ?').get(id) as any
    if (!inst) throw new Error('الدفعة غير موجودة / Instalment not found')

    const amount = patch.amount !== undefined ? round2(Number(patch.amount)) : Number(inst.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('قيمة الدفعة يجب أن تكون أكبر من صفر / Instalment amount must be greater than zero')
    }
    if (amount < Number(inst.paid)) {
      throw new Error('قيمة الدفعة أقل من المبلغ المحصّل بالفعل / Amount is less than what has already been paid')
    }

    let due_date = inst.due_date
    let month = inst.month
    let year = inst.year
    if (patch.due_date !== undefined) {
      due_date = String(patch.due_date).slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
        throw new Error('تاريخ الاستحقاق غير صالح / Due date is invalid')
      }
      const d = new Date(`${due_date}T00:00:00`)
      month = ARABIC_MONTHS[d.getMonth()]
      year = d.getFullYear()
    }

    const notes = patch.notes !== undefined ? patch.notes : inst.notes
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE student_installments
      SET amount = ?, balance = ?, status = ?, due_date = ?, month = ?, year = ?,
          notes = ?, updated_at = ?, synced = 0
      WHERE id = ?
    `).run(
      amount, round2(amount - Number(inst.paid)), statusFor(amount, Number(inst.paid)),
      due_date, month, year, notes, now, id
    )

    return db.prepare('SELECT * FROM student_installments WHERE id = ?').get(id)
  } catch (error: any) {
    console.error('Failed to update instalment:', error)
    throw new Error(error.message || 'Failed to update instalment')
  }
})

/** Drops a student's whole plan (and clears the plan fields on the student row). */
ipcMain.handle('installments:clear', async (_event, { student_id }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!student_id) throw new Error('Student ID is required')

    let deleted = 0
    db.transaction(() => {
      for (const row of db.prepare('SELECT id FROM student_installments WHERE student_id = ?').all(student_id) as { id: number }[]) {
        recordLocalTombstone(db, 'student_installments', row.id)
      }
      const res = db.prepare('DELETE FROM student_installments WHERE student_id = ?').run(student_id)
      deleted = Number(res.changes)
      db.prepare(`
        UPDATE students
        SET installments_count = NULL, installment_total = NULL, installment_start_date = NULL,
            updated_at = ?, synced = 0
        WHERE id = ?
      `).run(new Date().toISOString(), student_id)
    })()

    return { ok: true, deleted }
  } catch (error: any) {
    console.error('Failed to clear instalment plan:', error)
    throw new Error(error.message || 'Failed to clear instalment plan')
  }
})
