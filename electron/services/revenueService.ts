/**
 * The single place that knows money lives in TWO ledgers.
 *
 *  - `payments` (+ `payment_transactions`) — recurring month-by-month service billing.
 *  - `student_installments` (+ `student_installment_transactions`) — agreed instalment plans,
 *    which took over billing for whole-course fees so they are NOT duplicated in `payments`.
 *
 * Every financial view (dashboard, target, transactions, statement, exports) must read both, or
 * it silently under-reports every family on a plan. Reporting code should go through the helpers
 * here rather than querying `payments` directly.
 */

/** Arabic month names in calendar order — how both ledgers store a period. */
export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const round2 = (n: number) => Number((n ?? 0).toFixed(2))

export interface PeriodTotals {
  /** Charged in the period (payments.total + instalments due). */
  invoiced: number
  /** Collected in the period. */
  collected: number
  /** Still owed on charges raised in the period. */
  arrears: number
}

/**
 * Instalment totals for one Arabic month/year, keyed off the month each instalment falls DUE in —
 * matching how `payments` rows are bucketed, so the two can simply be added together.
 */
export function installmentTotalsForPeriod(db: any, month: string, year: number | string): PeriodTotals {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0)  AS invoiced,
      COALESCE(SUM(paid), 0)    AS collected,
      COALESCE(SUM(balance), 0) AS arrears
    FROM student_installments
    WHERE month = ? AND year = ?
  `).get(month, Number(year)) as any

  return {
    invoiced: round2(row?.invoiced),
    collected: round2(row?.collected),
    arrears: round2(row?.arrears),
  }
}

/**
 * Instalment rows shaped like `payments` rows, so callers that already reduce over payments can
 * concatenate these and keep their existing arithmetic. `service` carries the enrolled service
 * name where one is linked, so revenue-by-service breakdowns still work.
 */
export function installmentRowsForPeriod(
  db: any,
  month: string,
  year: number | string
): { total: number; paid: number; balance: number; service: string }[] {
  return db.prepare(`
    SELECT i.amount AS total, i.paid AS paid, i.balance AS balance,
           COALESCE(ss.service, s.service, '') AS service
    FROM student_installments i
    JOIN students s ON s.id = i.student_id
    LEFT JOIN student_services ss ON ss.id = i.service_id
    WHERE i.month = ? AND i.year = ?
  `).all(month, Number(year)) as any[]
}

/**
 * Collections recorded against instalments between two dates, grouped by payment method — the
 * instalment half of the dashboard's "collected by method" breakdown.
 */
export function installmentCollectionsByMethod(
  db: any,
  month: string,
  year: number | string
): { method: string; total: number }[] {
  return (db.prepare(`
    SELECT COALESCE(NULLIF(t.payment_method_name, ''), 'غير محدد') AS method,
           SUM(t.amount) AS total
    FROM student_installment_transactions t
    JOIN student_installments i ON i.id = t.installment_id
    WHERE i.month = ? AND i.year = ?
    GROUP BY method
  `).all(month, Number(year)) as any[]).map((r) => ({ method: r.method, total: round2(r.total) }))
}

/** Total collected against instalments due in a period — used by target planning. */
export function installmentCollectedForPeriod(db: any, month: string, year: number | string): number {
  const row = db.prepare(
    'SELECT COALESCE(SUM(paid), 0) AS s FROM student_installments WHERE month = ? AND year = ?'
  ).get(month, Number(year)) as any
  return round2(row?.s)
}

/**
 * Instalment collections in a date range, shaped as Transactions-page rows. Dated by when the
 * money actually arrived (`paid_date`), which is what a cash-movement view wants.
 */
export function installmentTransactionRows(
  db: any,
  from: string,
  to: string,
  studentId?: number | null
): any[] {
  const params: any[] = [from, to]
  let studentClause = ''
  if (studentId) {
    studentClause = ' AND i.student_id = ?'
    params.push(Number(studentId))
  }

  return db.prepare(`
    SELECT
      t.id,
      i.student_id,
      s.name AS student_name,
      COALESCE(ss.service, s.service, '') AS service_name,
      t.amount,
      'payment' AS type,
      t.paid_date AS date,
      i.seq AS installment_seq
    FROM student_installment_transactions t
    JOIN student_installments i ON i.id = t.installment_id
    JOIN students s ON s.id = i.student_id
    LEFT JOIN student_services ss ON ss.id = i.service_id
    WHERE t.paid_date BETWEEN ? AND ?${studentClause}
  `).all(...params)
}

/**
 * A student's instalments as statement rows, matching the shape `statementService` produces for
 * `payments` so the two merge into one chronological account.
 */
export function installmentStatementRows(db: any, studentId: number): any[] {
  return db.prepare(`
    SELECT i.month, i.year, i.seq, i.due_date, i.amount, i.paid, i.balance, i.status,
           COALESCE(ss.service, s.service, '') AS service
    FROM student_installments i
    JOIN students s ON s.id = i.student_id
    LEFT JOIN student_services ss ON ss.id = i.service_id
    WHERE i.student_id = ?
    ORDER BY i.seq ASC
  `).all(studentId) as any[]
}
