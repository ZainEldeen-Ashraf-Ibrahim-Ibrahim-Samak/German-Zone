import fs from 'node:fs'
import { getDb } from '../db/connection.js'
import { getExportHeader } from './exportHeader.js'
import { getChildStatement } from './statementService.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// RFC 4180 escaping — quote any field containing a comma, quote, or newline; double up quotes.
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsvLine(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',')
}

/**
 * Builds the branded header lines shared by every report's CSV: org name, applied filters, and
 * the generation timestamp (FR-004) — CSV has no logo image support, so the org name stands in
 * for it in text form.
 */
function buildHeaderLines(title: string, filterSummary: string): string[] {
  const brand = getExportHeader()
  const now = new Date().toISOString()
  return [
    toCsvLine([brand.orgName]),
    toCsvLine([title]),
    toCsvLine([filterSummary]),
    toCsvLine([`Generated: ${now}`]),
    ''
  ]
}

export async function buildCsvFile(
  type: 'payrollReport' | 'expenses' | 'child' | 'childReport' | 'month',
  params: any,
  savePath: string
): Promise<void> {
  const { lang = 'ar' } = params
  const isAr = lang === 'ar'
  let lines: string[] = []

  // Monthly billing sheet — same query (and same optional selection filter) as the Excel/PDF/Print
  // month export, so every format shows identical rows (FR-003).
  if (type === 'month') {
    const db = getDb()
    const month = params.month
    const year = Number(params.year)
    const hasSelection = Array.isArray(params.paymentIds) && params.paymentIds.length > 0

    const title = isAr ? `مطالبات شهر ${month} لسنة ${year}` : `Billing Sheet: ${month} ${year}`
    const filterSummary = isAr
      ? `الفترة: ${month} ${year}${hasSelection ? ` — ${params.paymentIds.length} سجل محدد` : ''}`
      : `Period: ${month} ${year}${hasSelection ? ` — ${params.paymentIds.length} selected record(s)` : ''}`
    lines = buildHeaderLines(title, filterSummary)
    lines.push(toCsvLine(
      isAr
        ? ['اسم الطفل', 'ولي الأمر', 'الهاتف', 'الخدمة', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'المتأخرات', 'الحالة', 'ملاحظات']
        : ['Child Name', 'Guardian', 'Phone', 'Service', 'Unit', 'Qty', 'Price', 'Total', 'Paid', 'Arrears', 'Status', 'Notes']
    ))

    const payments = db.prepare(`
      SELECT c.name as child_name, c.guardian, c.guardian_phone, p.service, p.unit, p.quantity, p.price, p.total, p.paid, p.balance, p.status, p.notes
      FROM payments p
      JOIN children c ON p.child_id = c.id
      WHERE p.month = ? AND p.year = ?
      ${hasSelection ? `AND p.id IN (${params.paymentIds.map(() => '?').join(',')})` : ''}
    `).all(month, year, ...(hasSelection ? params.paymentIds : [])) as any[]

    let totalInvoiced = 0, totalCollected = 0, arrears = 0
    for (const p of payments) {
      totalInvoiced += p.total; totalCollected += p.paid; arrears += p.balance
      lines.push(toCsvLine([p.child_name, p.guardian, p.guardian_phone, p.service, p.unit, p.quantity, p.price, p.total, p.paid, p.balance, p.status, p.notes || '']))
    }
    if (payments.length === 0) {
      lines.push(toCsvLine([isAr ? 'لا توجد مطالبات مسجلة لهذا الشهر.' : 'No billing records for this month.']))
    } else {
      lines.push(toCsvLine([isAr ? 'الإجمالي' : 'Total', '', '', '', '', '', '', totalInvoiced, totalCollected, arrears, '', '']))
    }
  }

  // Full Child Report (feature 007, US3/FR-007) — personal info, services & teachers, attendance
  // history + percentage, payment history, and notes, each as its own labeled block.
  if (type === 'childReport') {
    const db = getDb()
    const childId = Number(params.childId)
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
    if (!child) throw new Error(`Child not found with ID: ${childId}`)

    const title = isAr ? `تقرير الطفل الشامل: ${child.name}` : `Full Child Report: ${child.name}`
    const filterSummary = isAr ? `الطفل: ${child.name}` : `Child: ${child.name}`
    lines = buildHeaderLines(title, filterSummary)

    lines.push(toCsvLine([isAr ? '📋 البيانات الشخصية' : '📋 Personal Information']))
    lines.push(toCsvLine([isAr ? 'الاسم' : 'Name', child.name]))
    lines.push(toCsvLine([isAr ? 'ولي الأمر' : 'Guardian', child.guardian]))
    lines.push(toCsvLine([isAr ? 'هاتف ولي الأمر' : 'Guardian Phone', child.guardian_phone]))
    lines.push(toCsvLine([isAr ? 'تاريخ التسجيل' : 'Registration Date', child.reg_date]))
    lines.push(toCsvLine([isAr ? 'الحالة' : 'Status', child.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')]))
    lines.push('')

    lines.push(toCsvLine([isAr ? '🏷️ الخدمات والمعلمون' : '🏷️ Services & Teachers']))
    lines.push(toCsvLine(isAr ? ['الخدمة', 'الوحدة', 'السعر', 'المعلم'] : ['Service', 'Unit', 'Price', 'Teacher']))
    const services = db.prepare(`
      SELECT cs.service, cs.unit, cs.price, e.name as teacher_name
      FROM child_services cs LEFT JOIN employees e ON e.id = cs.teacher_id
      WHERE cs.child_id = ?
    `).all(childId) as any[]
    if (services.length === 0) lines.push(toCsvLine([isAr ? 'لا توجد خدمات مسجلة.' : 'No services enrolled.']))
    for (const s of services) lines.push(toCsvLine([s.service, s.unit, s.price, s.teacher_name || (isAr ? 'بدون معلم' : 'No teacher')]))
    lines.push('')

    const attendanceRows = db.prepare(`
      SELECT ss.session_date as attendance_date, e.name as teacher_name, ar.teacher_status, ar.status as child_status
      FROM attendance_records ar
      JOIN scheduled_sessions ss ON ss.id = ar.session_id
      LEFT JOIN employees e ON e.id = ar.attended_teacher_id
      WHERE ar.child_id = ?
      ORDER BY ss.session_date DESC
    `).all(childId) as any[]
    const attended = attendanceRows.filter((r) => r.child_status === 'attended').length
    const pct = attendanceRows.length > 0 ? Math.round((attended / attendanceRows.length) * 100) : null
    lines.push(toCsvLine([isAr ? '📅 سجل الحضور' : '📅 Attendance History']))
    lines.push(toCsvLine([isAr ? 'نسبة الحضور' : 'Attendance Percentage', pct != null ? `${pct}%` : (isAr ? 'غير متاح' : 'N/A')]))
    lines.push(toCsvLine(isAr ? ['التاريخ', 'المعلم', 'حالة المعلم', 'حالة الطفل'] : ['Date', 'Teacher', 'Teacher Status', 'Child Status']))
    if (attendanceRows.length === 0) lines.push(toCsvLine([isAr ? 'لا يوجد سجل حضور بعد.' : 'No attendance history yet.']))
    for (const a of attendanceRows) lines.push(toCsvLine([a.attendance_date, a.teacher_name || '', a.teacher_status || '', a.child_status]))
    lines.push('')

    lines.push(toCsvLine([isAr ? '💰 السجل المالي' : '💰 Payment History']))
    lines.push(toCsvLine(isAr ? ['الشهر', 'السنة', 'الخدمة', 'الإجمالي', 'المدفوع', 'الرصيد', 'الحالة'] : ['Month', 'Year', 'Service', 'Total', 'Paid', 'Balance', 'Status']))
    const existingPaymentsForReport = db.prepare(
      'SELECT month, year, service, unit, quantity, price, total, paid, balance, status FROM payments WHERE child_id = ?'
    ).all(childId) as any[]
    const statementForReport = getChildStatement(child, existingPaymentsForReport, new Date())
    if (statementForReport.rows.length === 0) lines.push(toCsvLine([isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.']))
    for (const p of statementForReport.rows) {
      const monthLabel = isAr ? p.month : (arabicMonths.includes(p.month) ? englishMonths[arabicMonths.indexOf(p.month)] : p.month)
      lines.push(toCsvLine([monthLabel, p.year, p.service, p.total, p.paid, p.balance, p.status]))
    }
    lines.push('')

    lines.push(toCsvLine([isAr ? '📝 ملاحظات' : '📝 Notes']))
    lines.push(toCsvLine([child.notes || (isAr ? 'لا توجد ملاحظات.' : 'No notes.')]))
  }

  // Financial Transactions Report (feature 007, US4/FR-008) — every recorded payment for the
  // child plus the resulting outstanding balance, sourced from the same statement engine as the
  // Excel/PDF child statement export so all three formats can never disagree.
  if (type === 'child') {
    const db = getDb()
    const childId = Number(params.childId)
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
    if (!child) throw new Error(`Child not found with ID: ${childId}`)

    const title = isAr ? `كشف حساب الطفل: ${child.name}` : `Account Statement: ${child.name}`
    const filterSummary = isAr ? `الطفل: ${child.name}` : `Child: ${child.name}`
    lines = buildHeaderLines(title, filterSummary)
    lines.push(toCsvLine(
      isAr
        ? ['الشهر', 'السنة', 'الخدمة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'الرصيد/المتأخرات', 'الحالة', 'ملاحظات']
        : ['Month', 'Year', 'Service', 'Quantity', 'Price', 'Total', 'Paid', 'Balance', 'Status', 'Notes']
    ))

    const existingPayments = db.prepare(
      'SELECT month, year, service, unit, quantity, price, total, paid, balance, status, notes FROM payments WHERE child_id = ?'
    ).all(childId) as any[]
    const statement = getChildStatement(child, existingPayments, new Date())

    let totalDue = 0, totalPaid = 0, totalBalance = 0
    for (const p of statement.rows) {
      totalDue += p.total
      totalPaid += p.paid
      totalBalance += p.balance
      const monthLabel = isAr ? p.month : (arabicMonths.includes(p.month) ? englishMonths[arabicMonths.indexOf(p.month)] : p.month)
      lines.push(toCsvLine([monthLabel, p.year, p.service, p.quantity, p.price, p.total, p.paid, p.balance, p.status, p.notes || '']))
    }
    if (statement.rows.length === 0) {
      lines.push(toCsvLine([isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.']))
    } else {
      lines.push(toCsvLine([isAr ? 'الإجمالي' : 'Total', '', '', '', '', totalDue, totalPaid, totalBalance, '', '']))
    }
  }

  if (type === 'expenses') {
    const db = getDb()
    const year = Number(params.year)
    const title = isAr ? `بيان المصاريف التشغيلية السنوية لسنة ${year}` : `Annual Expenses Sheet: ${year}`
    const filterSummary = isAr ? `السنة: ${year}` : `Year: ${year}`
    lines = buildHeaderLines(title, filterSummary)

    const monthHeaders = arabicMonths.map((m, idx) => (isAr ? m : englishMonths[idx]))
    lines.push(toCsvLine([isAr ? 'بند المصاريف' : 'Expense Item', isAr ? 'التصنيف' : 'Category', ...monthHeaders, isAr ? 'الإجمالي السنوي' : 'Annual Total']))

    const items = db.prepare(
      'SELECT DISTINCT item, category FROM expenses WHERE year = ? UNION SELECT DISTINCT item, category FROM expenses'
    ).all(year) as { item: string; category: string }[]

    const colTotals = Array(12).fill(0)
    let grandTotal = 0
    for (const it of items) {
      const monthAmounts = arabicMonths.map((m, idx) => {
        const row = db.prepare('SELECT amount FROM expenses WHERE item = ? AND month = ? AND year = ?').get(it.item, m, year) as { amount: number } | undefined
        const amt = row?.amount ?? 0
        colTotals[idx] += amt
        return amt
      })
      const rowTotal = monthAmounts.reduce((s, a) => s + a, 0)
      grandTotal += rowTotal
      lines.push(toCsvLine([it.item, it.category || '', ...monthAmounts, rowTotal]))
    }
    if (items.length === 0) {
      lines.push(toCsvLine([isAr ? 'لا توجد مصاريف مسجلة لهذه السنة.' : 'No expenses recorded for this year.']))
    } else {
      lines.push(toCsvLine([isAr ? 'الإجمالي' : 'Total', '', ...colTotals, grandTotal]))
    }
  }

  if (type === 'payrollReport') {
    const db = getDb()
    const month = Number(params.month)
    const year = Number(params.year)
    const monthLabel = isAr ? arabicMonths[month - 1] : englishMonths[month - 1]
    const title = isAr ? `تقرير رواتب المعلمين لشهر ${monthLabel} ${year}` : `Teacher Payroll Report: ${monthLabel} ${year}`
    const filterSummary = isAr ? `الفترة: ${monthLabel} ${year}` : `Period: ${monthLabel} ${year}`

    lines = buildHeaderLines(title, filterSummary)
    lines.push(toCsvLine(
      isAr
        ? ['اسم المعلم', 'عدد الجلسات المدفوعة', 'تكلفة الجلسة', 'إجمالي الراتب']
        : ['Teacher Name', 'Sessions Paid', 'Session Rate', 'Total Salary']
    ))

    const mm = String(month).padStart(2, '0')
    const monthKey = `${year}-${mm}`
    const rows = db.prepare(`
      SELECT
        e.name as teacher_name,
        e.teacher_session_rate as session_cost,
        COUNT(tp.id) as sessions_paid,
        COALESCE(SUM(tp.session_cost), 0) as total_salary
      FROM employees e
      JOIN teacher_payments tp ON tp.teacher_id = e.id
        AND tp.status IN ('pending','paid')
        AND strftime('%Y-%m', tp.attendance_date) = ?
      GROUP BY e.id
      ORDER BY e.name ASC
    `).all(monthKey) as any[]

    let total = 0
    for (const r of rows) {
      total += r.total_salary
      lines.push(toCsvLine([r.teacher_name, r.sessions_paid, r.session_cost ?? '', r.total_salary]))
    }
    // FR-009: a valid, clearly-labeled empty report rather than an error.
    if (rows.length === 0) {
      lines.push(toCsvLine([isAr ? 'لا توجد جلسات مدفوعة لهذا الشهر.' : 'No paid sessions for this month.']))
    } else {
      lines.push(toCsvLine([isAr ? 'الإجمالي' : 'Total', '', '', total]))
    }
  }

  // UTF-8 BOM so Excel opens Arabic text correctly.
  fs.writeFileSync(savePath, '﻿' + lines.join('\r\n'), 'utf8')
}
