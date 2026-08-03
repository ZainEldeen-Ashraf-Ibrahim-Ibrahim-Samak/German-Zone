import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireManager, checkAuth, getCurrentUser, branchScopeClause } from './_guard.js'
import { recordLocalTombstone } from '../services/tombstones.js'
import { TOTAL_UNIT } from '../../src/types/index.js'

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
 * The fee a plan is built from: the price of the services the student is actually enrolled in
 * (A1 at 10,000 → a plan for 10,000). A plan scoped to one enrollment uses just that
 * enrollment's price; an unscoped plan covers every total-priced enrollment.
 *
 * Only 'إجمالي' (whole-course) enrollments count. Splitting a recurring month/day/hour rate into
 * instalments is meaningless — there is no final figure to divide — so a plan is built from the
 * fixed course fees alone.
 *
 * This is the single source of the plan's amount — the fee is never typed in independently of
 * what the student is enrolled in, which is what let the two drift apart and double-charge.
 */
export function enrolledFeeFor(db: any, studentId: number, serviceId?: number | null): number {
  const row = serviceId
    ? db.prepare('SELECT COALESCE(SUM(price), 0) AS s FROM student_services WHERE student_id = ? AND id = ?')
        .get(studentId, serviceId)
    : db.prepare('SELECT COALESCE(SUM(price), 0) AS s FROM student_services WHERE student_id = ? AND unit = ?')
        .get(studentId, TOTAL_UNIT)
  return round2(Number(row?.s ?? 0))
}

/** True when the student has at least one whole-course enrollment an instalment plan could split. */
export function hasPlannableEnrollment(db: any, studentId: number): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM student_services WHERE student_id = ? AND unit = ? AND price > 0')
    .get(studentId, TOTAL_UNIT)
  return Number(row?.c ?? 0) > 0
}

/**
 * Which enrollments are billed by an instalment plan rather than by monthly generation.
 *
 * Returns student_id → covered enrollment ids, where the `null` member means "this student's
 * plan is unscoped". `payments:generate` consults this so a planned fee is charged once, as the
 * plan — never a second time as a monthly service row.
 */
export function loadPlanCoverage(db: any): Map<number, Set<number | null>> {
  const rows = db.prepare(
    'SELECT DISTINCT student_id, service_id FROM student_installments'
  ).all() as { student_id: number; service_id: number | null }[]

  const coverage = new Map<number, Set<number | null>>()
  for (const row of rows) {
    if (!coverage.has(row.student_id)) coverage.set(row.student_id, new Set())
    coverage.get(row.student_id)!.add(row.service_id)
  }
  return coverage
}

/**
 * True when this enrollment's fee is already billed through the student's instalment plan.
 *
 * An UNSCOPED plan covers only the whole-course ('إجمالي') enrollments, because those are the
 * only ones `enrolledFeeFor` puts into the plan total. Letting it cover recurring enrollments
 * too would suppress their monthly charge without ever having billed them inside the plan — the
 * subscription would silently stop being invoiced.
 */
export function isCoveredByPlan(
  coverage: Map<number, Set<number | null>>,
  studentId: number,
  enrollmentId: number,
  enrollmentUnit: string
): boolean {
  const covered = coverage.get(studentId)
  if (!covered) return false
  if (covered.has(enrollmentId)) return true
  return covered.has(null) && enrollmentUnit === TOTAL_UNIT
}

/**
 * Removes monthly service charges that the new plan now bills instead, so the family is not
 * asked for the fee twice. Only untouched rows go: anything with money already recorded
 * against it is left alone (deleting it would erase a real collection), and so is the separate
 * "حصص إضافية" extra-sessions charge, which is genuinely on top of the plan.
 */
function clearDuplicateServiceCharges(db: any, studentId: number, serviceId: number | null): number {
  // An unscoped plan only takes over the whole-course enrollments (see isCoveredByPlan), so
  // only their charges are retired — a recurring subscription keeps its monthly invoice.
  const rows = (serviceId
    ? db.prepare(`
        SELECT p.id FROM payments p
        WHERE p.student_id = ? AND p.service_id = ? AND p.paid = 0 AND p.service != 'حصص إضافية'
          AND NOT EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.payment_id = p.id)
      `).all(studentId, serviceId)
    : db.prepare(`
        SELECT p.id FROM payments p
        JOIN student_services ss ON ss.id = p.service_id
        WHERE p.student_id = ? AND ss.unit = ? AND p.paid = 0 AND p.service != 'حصص إضافية'
          AND NOT EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.payment_id = p.id)
      `).all(studentId, TOTAL_UNIT)) as { id: number }[]

  if (rows.length === 0) return 0

  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM payments WHERE id IN (${placeholders})`).run(...ids)
  for (const id of ids) recordLocalTombstone(db, 'payments', id)
  return ids.length
}

/**
 * Rebuilds a student's instalment plan. Any amounts already collected are preserved by
 * re-applying the previous plan's total paid, oldest instalment first — so re-planning after a
 * price change never silently wipes a family's payment history.
 */
export function regenerateInstallments(
  db: any,
  args: { student_id: number; count: number; total: number; start_date: string; service_id?: number | null }
): { created: number; duplicatesRemoved: number } {
  const { student_id, count, total, start_date } = args
  const service_id = args.service_id ?? null
  const now = new Date().toISOString()

  // The plan takes over billing for the enrollments it covers, so any monthly service charge
  // already generated for them is retired here — the fee is owed once, through the plan.
  const duplicatesRemoved = clearDuplicateServiceCharges(db, student_id, service_id)

  // Collections are carried across the rebuild, not just their sum: the old instalment rows are
  // about to be deleted and `student_installment_transactions` cascades with them, so each
  // collection is captured first and re-attached to the new schedule below. Losing them would
  // erase who paid what and when, and leave `paid` unbacked by any ledger row.
  const carried = db.prepare(`
    SELECT t.amount, t.payment_method_id, t.payment_method_name, t.paid_date, t.notes, t.recorded_by
    FROM student_installment_transactions t
    JOIN student_installments i ON i.id = t.installment_id
    WHERE i.student_id = ?
    ORDER BY t.paid_date ASC, t.id ASC
  `).all(student_id) as any[]

  // Tombstone every row being torn down: the rebuilt plan gets fresh ids, so without this the
  // next pull would resurrect the old instalments from the cloud alongside the new ones.
  for (const row of db.prepare('SELECT id FROM student_installments WHERE student_id = ?').all(student_id) as { id: number }[]) {
    recordLocalTombstone(db, 'student_installments', row.id)
  }
  for (const row of db.prepare(`
    SELECT t.id FROM student_installment_transactions t
    JOIN student_installments i ON i.id = t.installment_id
    WHERE i.student_id = ?
  `).all(student_id) as { id: number }[]) {
    recordLocalTombstone(db, 'student_installment_transactions', row.id)
  }
  db.prepare('DELETE FROM student_installments WHERE student_id = ?').run(student_id)

  const insert = db.prepare(`
    INSERT INTO student_installments (
      student_id, service_id, seq, due_date, month, year,
      amount, paid, balance, status, created_at, updated_at, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
  const insertTx = db.prepare(`
    INSERT INTO student_installment_transactions
      (installment_id, amount, payment_method_id, payment_method_name, paid_date, notes, recorded_by, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)

  const schedule = buildInstallmentSchedule(total, count, start_date)
  // Re-apply the carried collections oldest-first, filling each instalment before moving on. A
  // collection that straddles two instalments is split across them so the money still adds up.
  let pending = carried.map((t) => ({ ...t, remaining: round2(Number(t.amount)) }))
  for (const row of schedule) {
    let capacity = row.amount
    const applied: { tx: any; amount: number }[] = []
    for (const tx of pending) {
      if (capacity <= 0) break
      if (tx.remaining <= 0) continue
      const take = round2(Math.min(tx.remaining, capacity))
      tx.remaining = round2(tx.remaining - take)
      capacity = round2(capacity - take)
      applied.push({ tx, amount: take })
    }

    const paid = round2(applied.reduce((sum, a) => sum + a.amount, 0))
    const result = insert.run(
      student_id, service_id, row.seq, row.due_date, row.month, row.year,
      row.amount, paid, round2(row.amount - paid), statusFor(row.amount, paid), now, now
    )
    const installmentId = Number(result.lastInsertRowid)
    for (const a of applied) {
      insertTx.run(
        installmentId, a.amount, a.tx.payment_method_id ?? null, a.tx.payment_method_name ?? null,
        a.tx.paid_date ?? null, a.tx.notes ?? null, a.tx.recorded_by ?? null, now, now
      )
    }
    pending = pending.filter((t) => t.remaining > 0)
  }

  db.prepare(`
    UPDATE students
    SET installments_count = ?, installment_total = ?, installment_start_date = ?,
        updated_at = ?, synced = 0
    WHERE id = ?
  `).run(count, total, start_date, now, student_id)

  return { created: schedule.length, duplicatesRemoved }
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

/**
 * Same as `normalizePlanInput`, but fills a missing/blank total from what the student is
 * actually enrolled in. Callers can therefore say "split this student's fee over 4" without
 * restating the price, which is what keeps the plan and the service price from drifting apart.
 */
export function resolvePlanInput(
  db: any,
  studentId: number,
  src: any
): { count: number; total: number; start_date: string } {
  const supplied = src.total ?? src.installment_total
  const hasTotal = supplied !== undefined && supplied !== null && supplied !== '' && Number(supplied) > 0
  const total = hasTotal ? Number(supplied) : enrolledFeeFor(db, studentId, src.service_id ?? null)

  if (!hasTotal && total <= 0) {
    throw new Error(
      'خطة الدفعات تتطلب خدمة بنظام السعر الإجمالي — غيّر وحدة الخدمة إلى "إجمالي" أو أدخل مبلغاً مخصصاً / ' +
      'An instalment plan needs a service billed as a total — set the service unit to "total" or enter a custom amount'
    )
  }

  return normalizePlanInput({ ...src, total })
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
    // In edit mode the student already exists, so a blank total resolves from their enrollments
    // exactly as it will on save. On a brand-new student the caller passes the total it has
    // computed from the service rows still being filled in on the form.
    const plan = args?.student_id
      ? resolvePlanInput(getDb(), Number(args.student_id), args)
      : normalizePlanInput(args)
    return buildInstallmentSchedule(plan.total, plan.count, plan.start_date)
  } catch (error: any) {
    // The preview runs on every keystroke; a half-typed plan is not an error worth logging.
    throw new Error(error.message || 'Failed to preview instalment schedule')
  }
})

/**
 * The fee a plan would be built from, per enrolled service — what the student form shows as
 * "the plan covers this much, taken from the service price".
 */
ipcMain.handle('installments:enrolledFee', async (_event, { student_id }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!student_id) throw new Error('Student ID is required')

    const services = db.prepare(
      'SELECT id, service, unit, price FROM student_services WHERE student_id = ? ORDER BY id ASC'
    ).all(student_id) as { id: number; service: string; unit: string; price: number }[]

    return {
      total: enrolledFeeFor(db, Number(student_id)),
      // Only the whole-course enrollments feed a plan; the rest stay on recurring billing.
      services: services.filter((s) => s.unit === TOTAL_UNIT),
      recurringServices: services.filter((s) => s.unit !== TOTAL_UNIT),
      plannable: hasPlannableEnrollment(db, Number(student_id)),
    }
  } catch (error: any) {
    console.error('Failed to resolve enrolled fee:', error)
    throw new Error(error.message || 'Failed to resolve enrolled fee')
  }
})

ipcMain.handle('installments:plan', async (_event, args) => {
  try {
    requireManager()
    const db = getDb()
    const student_id = Number(args?.student_id)
    if (!student_id) throw new Error('Student ID is required')

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(student_id)
    if (!student) throw new Error('الطالب غير موجود / Student not found')

    // The amount comes from the enrolled service price unless an explicit total is passed.
    const plan = resolvePlanInput(db, student_id, args)
    let result = { created: 0, duplicatesRemoved: 0 }
    db.transaction(() => {
      result = regenerateInstallments(db, { student_id, service_id: args?.service_id ?? null, ...plan })
    })()

    return {
      ok: true,
      ...result,
      total: plan.total,
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

    // Hard limit regardless of what the caller asked for: a scoped user can never read another
    // branch's instalments by omitting the filter.
    const scope = branchScopeClause('s.branch_id')
    query += scope.clause
    params.push(...scope.params)

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
ipcMain.handle('installments:calendar', async (_event, { year, student_id = null, branch_id = null } = {} as any) => {
  try {
    checkAuth()
    const db = getDb()
    const y = Number(year) || new Date().getFullYear()

    // Joined to students so the year strip can be filtered by branch exactly like the table
    // beneath it — without this the two halves of the page reported different populations.
    let query = `
      SELECT i.month, i.year,
             COUNT(*) AS count,
             COALESCE(SUM(i.amount), 0) AS due,
             COALESCE(SUM(i.paid), 0) AS collected,
             COALESCE(SUM(i.balance), 0) AS outstanding
      FROM student_installments i
      JOIN students s ON s.id = i.student_id
      WHERE i.year = ?
    `
    const params: any[] = [y]
    if (student_id) {
      query += ' AND i.student_id = ?'
      params.push(Number(student_id))
    }
    if (branch_id) {
      query += ' AND s.branch_id = ?'
      params.push(Number(branch_id))
    }
    const scope = branchScopeClause('s.branch_id')
    query += scope.clause
    params.push(...scope.params)

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

/**
 * Recomputes an instalment from the sum of its collection rows, mirroring the most recent
 * method onto the instalment for display. `paid` is always derived, never accumulated in place,
 * so deleting a mistaken collection puts the balance back exactly.
 */
function recomputeInstallment(db: any, installmentId: number) {
  const inst = db.prepare('SELECT * FROM student_installments WHERE id = ?').get(installmentId) as any
  if (!inst) return

  const paid = round2(Number(
    (db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM student_installment_transactions WHERE installment_id = ?')
      .get(installmentId) as any).s ?? 0
  ))
  const last = db.prepare(`
    SELECT payment_method_id, payment_method_name, paid_date
    FROM student_installment_transactions
    WHERE installment_id = ? ORDER BY paid_date DESC, id DESC LIMIT 1
  `).get(installmentId) as any

  db.prepare(`
    UPDATE student_installments
    SET paid = ?, balance = ?, status = ?, paid_date = ?,
        payment_method_id = ?, payment_method_name = ?, updated_at = ?, synced = 0
    WHERE id = ?
  `).run(
    paid, round2(Number(inst.amount) - paid), statusFor(Number(inst.amount), paid),
    last?.paid_date ?? null, last?.payment_method_id ?? null, last?.payment_method_name ?? null,
    new Date().toISOString(), installmentId
  )
}

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

    let methodName: string | null = null
    if (payment_method_id != null) {
      const m = db.prepare('SELECT name FROM payment_methods WHERE id = ?').get(payment_method_id) as any
      methodName = m?.name ?? null
    }

    const now = new Date().toISOString()
    const user = getCurrentUser()

    db.transaction(() => {
      db.prepare(`
        INSERT INTO student_installment_transactions
          (installment_id, amount, payment_method_id, payment_method_name, paid_date, notes, recorded_by, created_at, updated_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(id, amt, payment_method_id, methodName, paid_date || now.slice(0, 10), notes, user?.id ?? null, now, now)
      recomputeInstallment(db, Number(id))
    })()

    return db.prepare('SELECT * FROM student_installments WHERE id = ?').get(id)
  } catch (error: any) {
    console.error('Failed to record instalment payment:', error)
    throw new Error(error.message || 'Failed to record instalment payment')
  }
})

/** The collection history behind an instalment — who took what, and when. */
ipcMain.handle('installments:listTransactions', async (_event, { installment_id }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!installment_id) throw new Error('Instalment ID is required')
    return db.prepare(`
      SELECT t.*, u.name AS recorded_by_name, u.username AS recorded_by_username
      FROM student_installment_transactions t
      LEFT JOIN users u ON u.id = t.recorded_by
      WHERE t.installment_id = ?
      ORDER BY t.paid_date ASC, t.id ASC
    `).all(installment_id)
  } catch (error: any) {
    console.error('Failed to list instalment collections:', error)
    throw new Error(error.message || 'Failed to list instalment collections')
  }
})

/** Reverses one collection — the balance returns to exactly what it was before it. */
ipcMain.handle('installments:deleteTransaction', async (_event, { id }) => {
  try {
    requireManager()
    const db = getDb()
    if (!id) throw new Error('Transaction ID is required')

    const tx = db.prepare('SELECT installment_id FROM student_installment_transactions WHERE id = ?').get(id) as any
    if (!tx) throw new Error('العملية غير موجودة / Collection not found')

    db.transaction(() => {
      db.prepare('DELETE FROM student_installment_transactions WHERE id = ?').run(id)
      recordLocalTombstone(db, 'student_installment_transactions', Number(id))
      recomputeInstallment(db, tx.installment_id)
    })()

    return db.prepare('SELECT * FROM student_installments WHERE id = ?').get(tx.installment_id)
  } catch (error: any) {
    console.error('Failed to delete instalment collection:', error)
    throw new Error(error.message || 'Failed to delete instalment collection')
  }
})

/** Adjusts a single instalment (date / amount / note) without rebuilding the whole plan. */
ipcMain.handle('installments:update', async (_event, { id, patch }) => {
  try {
    requireManager()
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
    requireManager()
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
