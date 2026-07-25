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

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Builds a self-contained, branded HTML print preview (research.md #2) — the renderer opens this
 * in a print-preview window and hands off to the OS print dialog via window.print(). Reuses the
 * exact same query as the equivalent export:* handler so Print and Export PDF/Excel can never
 * disagree on what data they show (FR-003).
 */
export function buildPrintPreviewHtml(reportType: 'payroll' | 'expenses' | 'child' | 'childReport' | 'month', params: any): string {
  const brand = getExportHeader()
  const isAr = params.lang === 'ar'
  const dir = isAr ? 'rtl' : 'ltr'
  const now = new Date().toISOString()

  let title = ''
  let filterSummary = ''
  let tableHtml = ''

  if (reportType === 'month') {
    const db = getDb()
    const month = params.month
    const year = Number(params.year)
    title = isAr ? `مطالبات واشتراكات شهر ${month} لسنة ${year}` : `Billing Sheet: ${month} ${year}`
    const hasSelection = Array.isArray(params.paymentIds) && params.paymentIds.length > 0
    filterSummary = isAr
      ? `الفترة: ${month} ${year}${hasSelection ? ` — ${params.paymentIds.length} سجل محدد` : ''}`
      : `Period: ${month} ${year}${hasSelection ? ` — ${params.paymentIds.length} selected record(s)` : ''}`
    const payments = db.prepare(`
      SELECT c.name as child_name, c.guardian, c.guardian_phone, p.service, p.unit, p.quantity, p.price, p.total, p.paid, p.balance, p.status
      FROM payments p
      JOIN children c ON p.child_id = c.id
      WHERE p.month = ? AND p.year = ?
      ${hasSelection ? `AND p.id IN (${params.paymentIds.map(() => '?').join(',')})` : ''}
    `).all(month, year, ...(hasSelection ? params.paymentIds : [])) as any[]

    const headers = isAr
      ? ['اسم الطفل', 'ولي الأمر', 'الهاتف', 'الخدمة', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'المتأخرات', 'الحالة']
      : ['Child Name', 'Guardian', 'Phone', 'Service', 'Unit', 'Qty', 'Price', 'Total', 'Paid', 'Arrears', 'Status']

    let totalInvoiced = 0, totalCollected = 0, arrears = 0
    const bodyRows = payments.map((p) => {
      totalInvoiced += p.total; totalCollected += p.paid; arrears += p.balance
      return `<tr><td>${escapeHtml(p.child_name)}</td><td>${escapeHtml(p.guardian)}</td><td>${escapeHtml(p.guardian_phone)}</td><td>${escapeHtml(p.service)}</td><td>${escapeHtml(p.unit)}</td><td>${escapeHtml(p.quantity)}</td><td>${escapeHtml(p.price)}</td><td>${escapeHtml(p.total)}</td><td>${escapeHtml(p.paid)}</td><td>${escapeHtml(p.balance)}</td><td>${escapeHtml(p.status)}</td></tr>`
    }).join('')

    const footerRow = payments.length > 0
      ? `<tr class="totals"><td>${isAr ? 'الإجمالي' : 'Total'}</td><td></td><td></td><td></td><td></td><td></td><td></td><td>${escapeHtml(totalInvoiced)}</td><td>${escapeHtml(totalCollected)}</td><td>${escapeHtml(arrears)}</td><td></td></tr>`
      : `<tr><td colspan="11" class="empty">${isAr ? 'لا توجد مطالبات مسجلة لهذا الشهر.' : 'No billing records for this month.'}</td></tr>`

    tableHtml = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows}${footerRow}</tbody>
      </table>
    `
  }

  if (reportType === 'payroll') {
    const db = getDb()
    const month = Number(params.month)
    const year = Number(params.year)
    const monthLabel = isAr ? arabicMonths[month - 1] : englishMonths[month - 1]
    title = isAr ? `تقرير رواتب المعلمين لشهر ${monthLabel} ${year}` : `Teacher Payroll Report: ${monthLabel} ${year}`
    filterSummary = isAr ? `الفترة: ${monthLabel} ${year}` : `Period: ${monthLabel} ${year}`

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

    const headers = isAr
      ? ['اسم المعلم', 'عدد الجلسات المدفوعة', 'تكلفة الجلسة', 'إجمالي الراتب']
      : ['Teacher Name', 'Sessions Paid', 'Session Rate', 'Total Salary']

    let total = 0
    const bodyRows = rows.map((r) => {
      total += r.total_salary
      return `<tr><td>${escapeHtml(r.teacher_name)}</td><td>${escapeHtml(r.sessions_paid)}</td><td>${escapeHtml(r.session_cost ?? '')}</td><td>${escapeHtml(r.total_salary)}</td></tr>`
    }).join('')

    const footerRow = rows.length > 0
      ? `<tr class="totals"><td>${isAr ? 'الإجمالي' : 'Total'}</td><td></td><td></td><td>${escapeHtml(total)}</td></tr>`
      : `<tr><td colspan="4" class="empty">${isAr ? 'لا توجد جلسات مدفوعة لهذا الشهر.' : 'No paid sessions for this month.'}</td></tr>`

    tableHtml = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows}${footerRow}</tbody>
      </table>
    `
  }

  if (reportType === 'expenses') {
    const db = getDb()
    const year = Number(params.year)
    title = isAr ? `بيان المصاريف التشغيلية السنوية لسنة ${year}` : `Annual Expenses Sheet: ${year}`
    filterSummary = isAr ? `السنة: ${year}` : `Year: ${year}`

    const monthHeaders = arabicMonths.map((m, idx) => (isAr ? m : englishMonths[idx]))
    const headers = [isAr ? 'بند المصاريف' : 'Expense Item', isAr ? 'التصنيف' : 'Category', ...monthHeaders, isAr ? 'الإجمالي' : 'Total']

    const items = db.prepare(
      'SELECT DISTINCT item, category FROM expenses WHERE year = ? UNION SELECT DISTINCT item, category FROM expenses'
    ).all(year) as { item: string; category: string }[]

    const colTotals = Array(12).fill(0)
    let grandTotal = 0
    const bodyRows = items.map((it) => {
      const monthAmounts = arabicMonths.map((m, idx) => {
        const row = db.prepare('SELECT amount FROM expenses WHERE item = ? AND month = ? AND year = ?').get(it.item, m, year) as { amount: number } | undefined
        const amt = row?.amount ?? 0
        colTotals[idx] += amt
        return amt
      })
      const rowTotal = monthAmounts.reduce((s, a) => s + a, 0)
      grandTotal += rowTotal
      return `<tr><td>${escapeHtml(it.item)}</td><td>${escapeHtml(it.category || '')}</td>${monthAmounts.map((a) => `<td>${escapeHtml(a)}</td>`).join('')}<td>${escapeHtml(rowTotal)}</td></tr>`
    }).join('')

    const footerRow = items.length > 0
      ? `<tr class="totals"><td>${isAr ? 'الإجمالي' : 'Total'}</td><td></td>${colTotals.map((t) => `<td>${escapeHtml(t)}</td>`).join('')}<td>${escapeHtml(grandTotal)}</td></tr>`
      : `<tr><td colspan="${2 + monthHeaders.length + 1}" class="empty">${isAr ? 'لا توجد مصاريف مسجلة لهذه السنة.' : 'No expenses recorded for this year.'}</td></tr>`

    tableHtml = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows}${footerRow}</tbody>
      </table>
    `
  }

  if (reportType === 'child') {
    const db = getDb()
    const childId = Number(params.childId)
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
    if (!child) throw new Error(`Child not found with ID: ${childId}`)

    title = isAr ? `كشف حساب الطفل: ${child.name}` : `Account Statement: ${child.name}`
    filterSummary = isAr ? `الطفل: ${child.name}` : `Child: ${child.name}`

    const headers = isAr
      ? ['الشهر', 'السنة', 'الخدمة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'الرصيد/المتأخرات', 'الحالة']
      : ['Month', 'Year', 'Service', 'Qty', 'Price', 'Total', 'Paid', 'Balance', 'Status']

    const existingPayments = db.prepare(
      'SELECT month, year, service, unit, quantity, price, total, paid, balance, status, notes FROM payments WHERE child_id = ?'
    ).all(childId) as any[]
    const statement = getChildStatement(child, existingPayments, new Date())

    let totalDue = 0, totalPaid = 0, totalBalance = 0
    const bodyRows = statement.rows.map((p: any) => {
      totalDue += p.total; totalPaid += p.paid; totalBalance += p.balance
      const monthLabel = isAr ? p.month : (arabicMonths.includes(p.month) ? englishMonths[arabicMonths.indexOf(p.month)] : p.month)
      return `<tr><td>${escapeHtml(monthLabel)}</td><td>${escapeHtml(p.year)}</td><td>${escapeHtml(p.service)}</td><td>${escapeHtml(p.quantity)}</td><td>${escapeHtml(p.price)}</td><td>${escapeHtml(p.total)}</td><td>${escapeHtml(p.paid)}</td><td>${escapeHtml(p.balance)}</td><td>${escapeHtml(p.status)}</td></tr>`
    }).join('')

    const footerRow = statement.rows.length > 0
      ? `<tr class="totals"><td>${isAr ? 'الإجمالي' : 'Total'}</td><td></td><td></td><td></td><td></td><td>${escapeHtml(totalDue)}</td><td>${escapeHtml(totalPaid)}</td><td>${escapeHtml(totalBalance)}</td><td></td></tr>`
      : `<tr><td colspan="9" class="empty">${isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.'}</td></tr>`

    tableHtml = `
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows}${footerRow}</tbody>
      </table>
    `
  }

  if (reportType === 'childReport') {
    const db = getDb()
    const childId = Number(params.childId)
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
    if (!child) throw new Error(`Child not found with ID: ${childId}`)

    title = isAr ? `تقرير الطفل الشامل: ${child.name}` : `Full Child Report: ${child.name}`
    filterSummary = isAr ? `الطفل: ${child.name}` : `Child: ${child.name}`

    const section = (heading: string, inner: string) => `<h2>${escapeHtml(heading)}</h2>${inner}`

    const personalInfo = `
      <table><tbody>
        <tr><td class="label">${escapeHtml(isAr ? 'الاسم' : 'Name')}</td><td>${escapeHtml(child.name)}</td></tr>
        <tr><td class="label">${escapeHtml(isAr ? 'ولي الأمر' : 'Guardian')}</td><td>${escapeHtml(child.guardian)}</td></tr>
        <tr><td class="label">${escapeHtml(isAr ? 'هاتف ولي الأمر' : 'Guardian Phone')}</td><td>${escapeHtml(child.guardian_phone)}</td></tr>
        <tr><td class="label">${escapeHtml(isAr ? 'تاريخ التسجيل' : 'Registration Date')}</td><td>${escapeHtml(child.reg_date)}</td></tr>
        <tr><td class="label">${escapeHtml(isAr ? 'الحالة' : 'Status')}</td><td>${escapeHtml(child.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive'))}</td></tr>
      </tbody></table>`

    const services = db.prepare(`
      SELECT cs.service, cs.unit, cs.price, e.name as teacher_name
      FROM child_services cs LEFT JOIN employees e ON e.id = cs.teacher_id
      WHERE cs.child_id = ?
    `).all(childId) as any[]
    const servicesHtml = services.length === 0
      ? `<p class="empty">${escapeHtml(isAr ? 'لا توجد خدمات مسجلة.' : 'No services enrolled.')}</p>`
      : `<table><thead><tr><th>${escapeHtml(isAr ? 'الخدمة' : 'Service')}</th><th>${escapeHtml(isAr ? 'الوحدة' : 'Unit')}</th><th>${escapeHtml(isAr ? 'السعر' : 'Price')}</th><th>${escapeHtml(isAr ? 'المعلم' : 'Teacher')}</th></tr></thead>
        <tbody>${services.map((s) => `<tr><td>${escapeHtml(s.service)}</td><td>${escapeHtml(s.unit)}</td><td>${escapeHtml(s.price)}</td><td>${escapeHtml(s.teacher_name || (isAr ? 'بدون معلم' : 'No teacher'))}</td></tr>`).join('')}</tbody></table>`

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
    const attendanceHtml = `
      <p><strong>${escapeHtml(isAr ? 'نسبة الحضور' : 'Attendance Percentage')}:</strong> ${escapeHtml(pct != null ? `${pct}%` : (isAr ? 'غير متاح' : 'N/A'))}</p>
      ${attendanceRows.length === 0
        ? `<p class="empty">${escapeHtml(isAr ? 'لا يوجد سجل حضور بعد.' : 'No attendance history yet.')}</p>`
        : `<table><thead><tr><th>${escapeHtml(isAr ? 'التاريخ' : 'Date')}</th><th>${escapeHtml(isAr ? 'المعلم' : 'Teacher')}</th><th>${escapeHtml(isAr ? 'حالة المعلم' : 'Teacher Status')}</th><th>${escapeHtml(isAr ? 'حالة الطفل' : 'Child Status')}</th></tr></thead>
          <tbody>${attendanceRows.map((a) => `<tr><td>${escapeHtml(a.attendance_date)}</td><td>${escapeHtml(a.teacher_name || '')}</td><td>${escapeHtml(a.teacher_status || '')}</td><td>${escapeHtml(a.child_status)}</td></tr>`).join('')}</tbody></table>`}
    `

    const existingPaymentsForReport = db.prepare(
      'SELECT month, year, service, unit, quantity, price, total, paid, balance, status FROM payments WHERE child_id = ?'
    ).all(childId) as any[]
    const statementForReport = getChildStatement(child, existingPaymentsForReport, new Date())
    const paymentsHtml = statementForReport.rows.length === 0
      ? `<p class="empty">${escapeHtml(isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.')}</p>`
      : `<table><thead><tr><th>${escapeHtml(isAr ? 'الشهر' : 'Month')}</th><th>${escapeHtml(isAr ? 'السنة' : 'Year')}</th><th>${escapeHtml(isAr ? 'الخدمة' : 'Service')}</th><th>${escapeHtml(isAr ? 'الإجمالي' : 'Total')}</th><th>${escapeHtml(isAr ? 'المدفوع' : 'Paid')}</th><th>${escapeHtml(isAr ? 'الرصيد' : 'Balance')}</th><th>${escapeHtml(isAr ? 'الحالة' : 'Status')}</th></tr></thead>
        <tbody>${statementForReport.rows.map((p: any) => {
          const monthLabel = isAr ? p.month : (arabicMonths.includes(p.month) ? englishMonths[arabicMonths.indexOf(p.month)] : p.month)
          return `<tr><td>${escapeHtml(monthLabel)}</td><td>${escapeHtml(p.year)}</td><td>${escapeHtml(p.service)}</td><td>${escapeHtml(p.total)}</td><td>${escapeHtml(p.paid)}</td><td>${escapeHtml(p.balance)}</td><td>${escapeHtml(p.status)}</td></tr>`
        }).join('')}</tbody></table>`

    const notesHtml = `<p>${escapeHtml(child.notes || (isAr ? 'لا توجد ملاحظات.' : 'No notes.'))}</p>`

    tableHtml = [
      section(isAr ? '📋 البيانات الشخصية' : '📋 Personal Information', personalInfo),
      section(isAr ? '🏷️ الخدمات والمعلمون' : '🏷️ Services & Teachers', servicesHtml),
      section(isAr ? '📅 سجل الحضور' : '📅 Attendance History', attendanceHtml),
      section(isAr ? '💰 السجل المالي' : '💰 Payment History', paymentsHtml),
      section(isAr ? '📝 ملاحظات' : '📝 Notes', notesHtml)
    ].join('')
  }

  return `<!doctype html>
<html dir="${dir}" lang="${params.lang}">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: sans-serif; color: #1e293b; padding: 24px; }
  h1 { color: ${brand.primaryColor}; font-size: 18px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 13px; text-align: ${isAr ? 'right' : 'left'}; }
  h2 { color: #fff; background: ${brand.primaryColor}; font-size: 13px; padding: 6px 10px; margin-top: 18px; }
  td.label { color: #64748b; font-weight: bold; width: 160px; }
  th { background: ${brand.primaryColor}; color: #fff; }
  tr.totals { font-weight: bold; background: #f1f5f9; }
  .empty { color: #94a3b8; font-style: italic; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(brand.orgName)}</h1>
  <div class="meta">${escapeHtml(title)}<br/>${escapeHtml(filterSummary)}<br/>${isAr ? 'تاريخ الإنشاء' : 'Generated'}: ${escapeHtml(now)}</div>
  ${tableHtml}
</body>
</html>`
}
