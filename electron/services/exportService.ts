import ExcelJS from 'exceljs'
import fs from 'node:fs'
import { getDb } from '../db/connection.js'
import { getExportHeader, type ExportHeaderData } from './exportHeader.js'
import { getChildStatement } from './statementService.js'

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

const englishMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// Styling constants
const FONT_FAMILY = 'Segoe UI'
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' }, // Cool grey Slate 100
}
const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' }, // Slate 50
}
const BORDER_STYLE = {
  top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
}

// Helpers for status formatting
function getStatusStyle(valStr: string): { fill: ExcelJS.Fill; font: Partial<ExcelJS.Font> } | null {
  const normalStatus = valStr.toLowerCase()
  if (normalStatus === 'paid' || normalStatus === 'نشط' || normalStatus === 'active' || normalStatus === 'met' || normalStatus === 'target_met' || normalStatus === 'مكتمل' || normalStatus === 'ناجح') {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }, // Emerald 50
      font: { name: FONT_FAMILY, color: { argb: 'FF065F46' }, bold: true }, // Emerald 800
    }
  }
  if (normalStatus === 'unpaid' || normalStatus === 'غير نشط' || normalStatus === 'inactive' || normalStatus === 'missed' || normalStatus === 'target_missed' || normalStatus === 'عجز' || normalStatus === 'غير مكتمل') {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }, // Red 50
      font: { name: FONT_FAMILY, color: { argb: 'FF991B1B' }, bold: true }, // Red 800
    }
  }
  if (normalStatus === 'partial' || normalStatus === 'جزئي') {
    return {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF6B2' } }, // Yellow 100
      font: { name: FONT_FAMILY, color: { argb: 'FF723B10' }, bold: true }, // Yellow 800
    }
  }
  return null
}

// Write the common white-label branding block at the top
function writeBrandingHeader(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  lang: string,
  titleText: string
): number {
  // Set sheet direction
  worksheet.views = [{ showGridLines: true, rightToLeft: lang === 'ar' }]

  // Add logo if allowed and path exists
  if (brand.showLogo && brand.logoPath && fs.existsSync(brand.logoPath)) {
    try {
      const logoId = workbook.addImage({
        filename: brand.logoPath,
        extension: 'png',
      })
      // Place logo in top-left (RTL mirrors this automatically in Excel views)
      worksheet.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 90, height: 60 },
      })
    } catch (e) {
      console.error('Failed to embed logo in Excel:', e)
    }
  }

  // Row 1: Org Name & Title
  const row1 = worksheet.getRow(1)
  row1.height = 30
  const titleCell = worksheet.getCell(lang === 'ar' ? 'D1' : 'B1')
  titleCell.value = brand.orgName
  titleCell.font = { name: FONT_FAMILY, size: 16, bold: true, color: { argb: 'FF0F766E' } }
  
  // Row 2: Tagline
  const row2 = worksheet.getRow(2)
  row2.height = 20
  const taglineCell = worksheet.getCell(lang === 'ar' ? 'D2' : 'B2')
  taglineCell.value = brand.tagline
  taglineCell.font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF64748B' } }

  // Row 3: Contacts Info
  const row3 = worksheet.getRow(3)
  row3.height = 18
  const contactsCell = worksheet.getCell(lang === 'ar' ? 'D3' : 'B3')
  contactsCell.value = `${lang === 'ar' ? 'هاتف:' : 'Tel:'} ${brand.phone} | ${lang === 'ar' ? 'عنوان:' : 'Addr:'} ${brand.address} | ${lang === 'ar' ? 'بريد:' : 'Email:'} ${brand.email}`
  contactsCell.font = { name: FONT_FAMILY, size: 9, color: { argb: 'FF64748B' } }

  // Row 5: Document Title
  const row5 = worksheet.getRow(5)
  row5.height = 25
  const docTitleCell = worksheet.getCell('A5')
  docTitleCell.value = titleText
  docTitleCell.font = { name: FONT_FAMILY, size: 14, bold: true, color: { argb: 'FF1E293B' } }

  return 6 // Content starts at row 7
}

// Auto fit columns helper
function autofitColumns(worksheet: ExcelJS.Worksheet, minWidth = 12) {
  worksheet.columns.forEach((column) => {
    let maxLength = 0
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      if (cell.value) {
        const valStr = cell.value.toString()
        if (valStr.length > maxLength) {
          maxLength = valStr.length
        }
      }
    })
    column.width = Math.max(minWidth, maxLength + 4)
  })
}

// Format number cells as currency or percentage
function formatGridData(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  currencyCols: number[] = [],
  percentCols: number[] = [],
  statusColIdx = -1
) {
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    // Apply basic font and borders to all cells
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = cell.font || { name: FONT_FAMILY, size: 10 }
      cell.border = BORDER_STYLE

      // Currency format
      if (currencyCols.includes(colNumber)) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }

      // Percent format
      if (percentCols.includes(colNumber)) {
        cell.numFmt = '0%'
        cell.alignment = { horizontal: 'right' }
      }
    })

    // Format status colors
    if (statusColIdx > 0) {
      const statusCell = row.getCell(statusColIdx)
      if (statusCell && statusCell.value) {
        const style = getStatusStyle(statusCell.value.toString())
        if (style) {
          statusCell.fill = style.fill
          statusCell.font = style.font
        }
      }
    }
  })
}

// Generates the single month payments sheet
function generateMonthSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  month: string,
  year: number,
  lang: string,
  paymentIds?: number[]
) {
  const db = getDb()
  const title = lang === 'ar'
    ? `مطالبات شهر ${month} لسنة ${year}`
    : `Billing Sheet: ${month} ${year}`

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  // Columns definition
  const headers = lang === 'ar'
    ? ['اسم الطفل 👶', 'ولي الأمر 👤', 'الهاتف 📞', 'الخدمة ⚙️', 'الوحدة 📦', 'الكمية 🔢', 'السعر 💰', 'الإجمالي 💵', 'المحصل ✅', 'المتأخرات ⚠️', 'الحالة 📊', 'ملاحظات 📝']
    : ['Child Name 👶', 'Guardian 👤', 'Phone 📞', 'Service ⚙️', 'Unit 📦', 'Qty 🔢', 'Price 💰', 'Total 💵', 'Paid ✅', 'Arrears ⚠️', 'Status 📊', 'Notes 📝']

  // Headers
  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF1E293B' } }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  // Fetch payments — filtered to the selected payment IDs when provided (empty/omitted = all)
  const hasSelection = Array.isArray(paymentIds) && paymentIds.length > 0
  const payments = db.prepare(`
    SELECT p.id, c.name as child_name, c.guardian, c.guardian_phone, p.service, p.unit, p.quantity, p.price, p.total, p.paid, p.balance, p.status, p.notes
    FROM payments p
    JOIN children c ON p.child_id = c.id
    WHERE p.month = ? AND p.year = ?
    ${hasSelection ? `AND p.id IN (${paymentIds!.map(() => '?').join(',')})` : ''}
  `).all(month, year, ...(hasSelection ? paymentIds! : [])) as any[]

  // Add payments data
  let currentRow = startRow + 1
  for (const p of payments) {
    const rowValues = [
      p.child_name,
      p.guardian,
      p.guardian_phone,
      p.service,
      p.unit,
      p.quantity,
      p.price,
      p.total,
      p.paid,
      p.balance,
      p.status,
      p.notes || ''
    ]
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = rowValues
    dataRow.height = 20
    currentRow++
  }

  // Add Total Row
  if (payments.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    
    // Label
    const labelCol = 1
    totalRow.getCell(labelCol).value = lang === 'ar' ? 'إجمالي المحاسبة' : 'Totals'
    totalRow.getCell(labelCol).font = { name: FONT_FAMILY, size: 11, bold: true }
    
    // Formulas
    const totalFormulaCol = 8
    const paidFormulaCol = 9
    const balanceFormulaCol = 10
    
    totalRow.getCell(totalFormulaCol).value = { formula: `SUM(H${startRow + 1}:H${currentRow - 1})` }
    totalRow.getCell(paidFormulaCol).value = { formula: `SUM(I${startRow + 1}:I${currentRow - 1})` }
    totalRow.getCell(balanceFormulaCol).value = { formula: `SUM(J${startRow + 1}:J${currentRow - 1})` }

    for (let c = 1; c <= 12; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if ([totalFormulaCol, paidFormulaCol, balanceFormulaCol].includes(c)) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  }

  // Apply typography, borders, currency formats and status colors
  formatGridData(worksheet, startRow + 1, [7, 8, 9, 10], [], 11)
  autofitColumns(worksheet)
}

// Generate children roster sheet
function generateChildrenSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  lang: string
) {
  const db = getDb()
  const title = lang === 'ar' ? 'سجل بيانات الأطفال المسجلين' : 'Children Roster'
  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const headers = lang === 'ar'
    ? ['اسم الطفل', 'ولي الأمر', 'هاتف ولي الأمر', 'هاتف الطفل', 'الرقم القومي', 'الخدمة الأساسية', 'الوحدة المحتسبة', 'السعر المتفق عليه', 'تاريخ التسجيل', 'الحالة', 'ملاحظات']
    : ['Child Name', 'Guardian', 'Guardian Phone', 'Child Phone', 'National ID', 'Default Service', 'Billing Unit', 'Agreed Price', 'Reg Date', 'Status', 'Notes']

  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const children = db.prepare('SELECT name, guardian, guardian_phone, child_phone, national_id, service, unit, price, reg_date, is_active, notes FROM children').all() as any[]

  let currentRow = startRow + 1
  for (const c of children) {
    const statusStr = c.is_active 
      ? (lang === 'ar' ? 'نشط' : 'Active') 
      : (lang === 'ar' ? 'غير نشط' : 'Inactive')

    const rowValues = [
      c.name,
      c.guardian,
      c.guardian_phone,
      c.child_phone || '',
      c.national_id || '',
      c.service,
      c.unit,
      c.price,
      c.reg_date,
      statusStr,
      c.notes || ''
    ]
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = rowValues
    dataRow.height = 20
    currentRow++
  }

  formatGridData(worksheet, startRow + 1, [8], [], 10)
  autofitColumns(worksheet)
}

// Generate salaries sheet
function generateSalariesSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  month: string,
  year: number,
  lang: string
) {
  const db = getDb()
  const title = lang === 'ar'
    ? `رواتب ومكافآت الموظفين لشهر ${month} لسنة ${year}`
    : `Employee Payroll: ${month} ${year}`

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const headers = lang === 'ar'
    ? ['اسم الموظف', 'الوظيفة / الصلاحية', 'الراتب الأساسي', 'بدل السكن', 'بدل الانتقال', 'صافي الراتب المستحق', 'مكافآت الشهر', 'خصومات الشهر', 'المدفوع الفعلي', 'تاريخ الصرف', 'ملاحظات']
    : ['Employee Name', 'Role', 'Base Salary', 'Housing Allow', 'Transport Allow', 'Net Salary', 'Bonuses', 'Deductions', 'Actual Paid', 'Pay Date', 'Notes']

  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  // Fetch employees and join with payroll for the month/year
  const payroll = db.prepare(`
    SELECT e.name, e.role, e.base_salary, e.housing, e.transport, e.net_salary,
           s.bonus, s.deductions, s.actual_paid, s.paid_date as pay_date, s.notes
    FROM employees e
    LEFT JOIN salary_payments s ON e.id = s.employee_id AND s.month = ? AND s.year = ?
    WHERE e.is_active = 1 OR s.id IS NOT NULL
  `).all(month, year) as any[]

  let currentRow = startRow + 1
  for (const p of payroll) {
    const bonus = p.bonus || 0
    const deductions = p.deductions || 0
    const actualPaid = p.actual_paid !== null && p.actual_paid !== undefined 
      ? p.actual_paid 
      : (p.net_salary || 0)

    const rowValues = [
      p.name,
      p.role === 'admin' ? (lang === 'ar' ? 'مسؤول' : 'Admin') : (lang === 'ar' ? 'موظف' : 'Employee'),
      p.base_salary,
      p.housing,
      p.transport,
      p.net_salary,
      bonus,
      deductions,
      actualPaid,
      p.pay_date || '',
      p.notes || ''
    ]
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = rowValues
    dataRow.height = 20
    currentRow++
  }

  // Totals Row
  if (payroll.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    totalRow.getCell(1).value = lang === 'ar' ? 'إجمالي الرواتب والمنصرف' : 'Total Payroll'
    totalRow.getCell(3).value = { formula: `SUM(C${startRow + 1}:C${currentRow - 1})` }
    totalRow.getCell(4).value = { formula: `SUM(D${startRow + 1}:D${currentRow - 1})` }
    totalRow.getCell(5).value = { formula: `SUM(E${startRow + 1}:E${currentRow - 1})` }
    totalRow.getCell(6).value = { formula: `SUM(F${startRow + 1}:F${currentRow - 1})` }
    totalRow.getCell(7).value = { formula: `SUM(G${startRow + 1}:G${currentRow - 1})` }
    totalRow.getCell(8).value = { formula: `SUM(H${startRow + 1}:H${currentRow - 1})` }
    totalRow.getCell(9).value = { formula: `SUM(I${startRow + 1}:I${currentRow - 1})` }

    for (let c = 1; c <= 11; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if (c >= 3 && c <= 9) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  }

  formatGridData(worksheet, startRow + 1, [3, 4, 5, 6, 7, 8, 9])
  autofitColumns(worksheet)
}

// Feature 007, FR-005 — the attendance-based Payroll Report (teacher_payments ledger, feature
// 006), distinct from the legacy salary_payments-based "salaries" sheet above.
export function generatePayrollReportSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  params: { month: number; year: number },
  lang: string
) {
  const db = getDb()
  const { month, year } = params
  const monthLabel = lang === 'ar' ? arabicMonths[month - 1] : englishMonths[month - 1]
  const title = lang === 'ar'
    ? `تقرير رواتب المعلمين لشهر ${monthLabel} ${year}`
    : `Teacher Payroll Report: ${monthLabel} ${year}`

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const headers = lang === 'ar'
    ? ['اسم المعلم', 'عدد الجلسات المدفوعة', 'تكلفة الجلسة', 'إجمالي الراتب']
    : ['Teacher Name', 'Sessions Paid', 'Session Rate', 'Total Salary']

  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const mm = String(month).padStart(2, '0')
  const monthKey = `${year}-${mm}`
  const rows = db.prepare(`
    SELECT
      e.id as teacher_id,
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

  let currentRow = startRow + 1
  for (const r of rows) {
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = [r.teacher_name, r.sessions_paid, r.session_cost, r.total_salary]
    dataRow.height = 20
    currentRow++
  }

  if (rows.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    totalRow.getCell(1).value = lang === 'ar' ? 'إجمالي الرواتب' : 'Total Payroll'
    totalRow.getCell(4).value = { formula: `SUM(D${startRow + 1}:D${currentRow - 1})` }
    for (let c = 1; c <= 4; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if (c === 3 || c === 4) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  } else {
    // FR-009: a valid, clearly-labeled empty report rather than an error.
    const emptyRow = worksheet.getRow(currentRow)
    emptyRow.getCell(1).value = lang === 'ar' ? 'لا توجد جلسات مدفوعة لهذا الشهر.' : 'No paid sessions for this month.'
    emptyRow.getCell(1).font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF94A3B8' } }
  }

  formatGridData(worksheet, startRow + 1, [3, 4])
  autofitColumns(worksheet)
}

// Generate employees roster sheet
function generateEmployeesSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  lang: string
) {
  const db = getDb()
  const title = lang === 'ar' ? 'سجل الموظفين' : 'Employees Roster'

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const headers = lang === 'ar'
    ? ['اسم الموظف', 'الوظيفة', 'الراتب الأساسي', 'بدل السكن', 'بدل الانتقال', 'صافي الراتب', 'الحالة']
    : ['Employee Name', 'Role', 'Base Salary', 'Housing Allow', 'Transport Allow', 'Net Salary', 'Status']

  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const employees = db.prepare(`
    SELECT name, role, base_salary, housing, transport, net_salary, is_active
    FROM employees
    ORDER BY is_active DESC, name ASC
  `).all() as any[]

  let currentRow = startRow + 1
  for (const e of employees) {
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = [
      e.name,
      e.role,
      e.base_salary,
      e.housing,
      e.transport,
      e.net_salary,
      e.is_active === 1 ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')
    ]
    dataRow.height = 20
    currentRow++
  }

  // Totals row (active payroll)
  if (employees.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    totalRow.getCell(1).value = lang === 'ar' ? 'الإجمالي' : 'Totals'
    totalRow.getCell(3).value = { formula: `SUM(C${startRow + 1}:C${currentRow - 1})` }
    totalRow.getCell(4).value = { formula: `SUM(D${startRow + 1}:D${currentRow - 1})` }
    totalRow.getCell(5).value = { formula: `SUM(E${startRow + 1}:E${currentRow - 1})` }
    totalRow.getCell(6).value = { formula: `SUM(F${startRow + 1}:F${currentRow - 1})` }
    for (let c = 1; c <= 7; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if (c >= 3 && c <= 6) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  }

  formatGridData(worksheet, startRow + 1, [3, 4, 5, 6])
  autofitColumns(worksheet)
}

// Generate annual expenses sheet
function generateExpensesSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  year: number,
  lang: string
) {
  const db = getDb()
  const title = lang === 'ar'
    ? `بيان المصاريف التشغيلية السنوية لسنة ${year}`
    : `Annual Expenses Sheet: ${year}`

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const headers = [
    lang === 'ar' ? 'بند المصاريف' : 'Expense Item',
    lang === 'ar' ? 'التصنيف' : 'Category',
    ...arabicMonths.map((m, idx) => lang === 'ar' ? m : englishMonths[idx]),
    lang === 'ar' ? 'الإجمالي السنوي' : 'Annual Total'
  ]

  const headerRow = worksheet.getRow(startRow)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  // Fetch unique items
  const items = db.prepare('SELECT DISTINCT item, category FROM expenses WHERE year = ? UNION SELECT DISTINCT item, category FROM expenses').all(year) as { item: string; category: string }[]

  let currentRow = startRow + 1
  for (const it of items) {
    const rowValues: any[] = [it.item, it.category || '']
    
    // Add month amounts
    for (const m of arabicMonths) {
      const expenseRow = db.prepare('SELECT amount FROM expenses WHERE item = ? AND month = ? AND year = ?').get(it.item, m, year) as { amount: number } | undefined
      rowValues.push(expenseRow ? expenseRow.amount : 0)
    }

    // Add row sum formula
    const rowLetterStart = 'C'
    const rowLetterEnd = 'N'
    rowValues.push({ formula: `SUM(${rowLetterStart}${currentRow}:${rowLetterEnd}${currentRow})` })

    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = rowValues
    dataRow.height = 20
    currentRow++
  }

  // Monthly Expenses Totals Row
  if (items.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    totalRow.getCell(1).value = lang === 'ar' ? 'إجمالي المصاريف الشهرية' : 'Monthly Cost Sum'
    
    // Formulas for Jan-Dec + Grand Total
    for (let c = 3; c <= 15; c++) {
      const colLetter = worksheet.getColumn(c).letter
      totalRow.getCell(c).value = { formula: `SUM(${colLetter}${startRow + 1}:${colLetter}${currentRow - 1})` }
    }

    for (let c = 1; c <= 15; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if (c >= 3) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  }

  const currencyColumns = Array.from({ length: 13 }, (_, i) => i + 3) // Cols 3 to 15
  formatGridData(worksheet, startRow + 1, currencyColumns)
  autofitColumns(worksheet)
}

// Feature 007, FR-007 — the full Child Report: personal info, attendance history, assigned
// teacher(s), enrolled services, computed attendance percentage, payment history, and notes, all
// in one document (distinct from generateChildStatementSheet below, which covers only the
// financial/payment ledger for the Financial Transactions Report).
function generateChildReportSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  childId: number,
  lang: string
) {
  const db = getDb()
  const isAr = lang === 'ar'
  const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
  if (!child) throw new Error(`Child not found with ID: ${childId}`)

  const title = isAr ? `تقرير الطفل الشامل: ${child.name}` : `Full Child Report: ${child.name}`
  let row = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  const sectionTitle = (text: string) => {
    const cell = worksheet.getCell(`A${row}`)
    cell.value = text
    cell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
    worksheet.mergeCells(`A${row}:F${row}`)
    row += 1
  }
  const kv = (label: string, value: any) => {
    worksheet.getCell(`A${row}`).value = label
    worksheet.getCell(`A${row}`).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF64748B' } }
    worksheet.getCell(`B${row}`).value = value ?? ''
    worksheet.getCell(`B${row}`).font = { name: FONT_FAMILY, size: 10 }
    row += 1
  }

  // ── Personal Information ──────────────────────────────────────────────
  sectionTitle(isAr ? '📋 البيانات الشخصية' : '📋 Personal Information')
  kv(isAr ? 'الاسم' : 'Name', child.name)
  kv(isAr ? 'ولي الأمر' : 'Guardian', child.guardian)
  kv(isAr ? 'هاتف ولي الأمر' : 'Guardian Phone', child.guardian_phone)
  kv(isAr ? 'تاريخ التسجيل' : 'Registration Date', child.reg_date)
  kv(isAr ? 'الحالة' : 'Status', child.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive'))
  row += 1

  // ── Enrolled Services & Assigned Teacher(s) ─────────────────────────────
  sectionTitle(isAr ? '🏷️ الخدمات المشترك بها والمعلمون' : '🏷️ Enrolled Services & Assigned Teacher(s)')
  const services = db.prepare(`
    SELECT cs.service, cs.unit, cs.price, e.name as teacher_name
    FROM child_services cs
    LEFT JOIN employees e ON e.id = cs.teacher_id
    WHERE cs.child_id = ?
  `).all(childId) as any[]
  const svcHeaderRow = worksheet.getRow(row)
  svcHeaderRow.values = isAr ? ['الخدمة', 'الوحدة', 'السعر', 'المعلم'] : ['Service', 'Unit', 'Price', 'Teacher']
  svcHeaderRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = SUBHEADER_FILL
    cell.border = BORDER_STYLE
  })
  row += 1
  for (const s of services) {
    worksheet.getRow(row).values = [s.service, s.unit, s.price, s.teacher_name || (isAr ? 'بدون معلم' : 'No teacher')]
    row += 1
  }
  if (services.length === 0) {
    worksheet.getCell(`A${row}`).value = isAr ? 'لا توجد خدمات مسجلة.' : 'No services enrolled.'
    worksheet.getCell(`A${row}`).font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    row += 1
  }
  row += 1

  // ── Attendance History & Percentage ─────────────────────────────────────
  sectionTitle(isAr ? '📅 سجل الحضور' : '📅 Attendance History')
  const attendanceRows = db.prepare(`
    SELECT
      ss.session_date as attendance_date,
      e.name as teacher_name,
      ar.teacher_status,
      ar.status as child_status
    FROM attendance_records ar
    JOIN scheduled_sessions ss ON ss.id = ar.session_id
    LEFT JOIN employees e ON e.id = ar.attended_teacher_id
    WHERE ar.child_id = ?
    ORDER BY ss.session_date DESC
  `).all(childId) as any[]

  const attendedCount = attendanceRows.filter((r) => r.child_status === 'attended').length
  const attendancePct = attendanceRows.length > 0 ? Math.round((attendedCount / attendanceRows.length) * 100) : null
  kv(isAr ? 'نسبة الحضور' : 'Attendance Percentage', attendancePct != null ? `${attendancePct}%` : (isAr ? 'غير متاح' : 'N/A'))

  const attHeaderRow = worksheet.getRow(row)
  attHeaderRow.values = isAr
    ? ['التاريخ', 'المعلم', 'حالة المعلم', 'حالة الطفل']
    : ['Date', 'Teacher', 'Teacher Status', 'Child Status']
  attHeaderRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = SUBHEADER_FILL
    cell.border = BORDER_STYLE
  })
  row += 1
  for (const a of attendanceRows) {
    worksheet.getRow(row).values = [a.attendance_date, a.teacher_name || '', a.teacher_status || '', a.child_status]
    row += 1
  }
  if (attendanceRows.length === 0) {
    worksheet.getCell(`A${row}`).value = isAr ? 'لا يوجد سجل حضور بعد.' : 'No attendance history yet.'
    worksheet.getCell(`A${row}`).font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    row += 1
  }
  row += 1

  // ── Payment History ──────────────────────────────────────────────────
  sectionTitle(isAr ? '💰 السجل المالي' : '💰 Payment History')
  const existingPayments = db.prepare(
    'SELECT month, year, service, unit, quantity, price, total, paid, balance, status, notes FROM payments WHERE child_id = ?'
  ).all(childId) as any[]
  const statement = getChildStatement(child, existingPayments, new Date())

  const payHeaderRow = worksheet.getRow(row)
  payHeaderRow.values = isAr
    ? ['الشهر', 'السنة', 'الخدمة', 'الإجمالي', 'المدفوع', 'الرصيد', 'الحالة']
    : ['Month', 'Year', 'Service', 'Total', 'Paid', 'Balance', 'Status']
  payHeaderRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = SUBHEADER_FILL
    cell.border = BORDER_STYLE
  })
  row += 1
  for (const p of statement.rows) {
    worksheet.getRow(row).values = [translateMonthName(p.month, lang), p.year, p.service, p.total, p.paid, p.balance, p.status]
    row += 1
  }
  if (statement.rows.length === 0) {
    worksheet.getCell(`A${row}`).value = isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.'
    worksheet.getCell(`A${row}`).font = { name: FONT_FAMILY, size: 10, italic: true, color: { argb: 'FF94A3B8' } }
    row += 1
  }
  row += 1

  // ── Notes ────────────────────────────────────────────────────────────
  sectionTitle(isAr ? '📝 ملاحظات' : '📝 Notes')
  worksheet.getCell(`A${row}`).value = child.notes || (isAr ? 'لا توجد ملاحظات.' : 'No notes.')
  worksheet.getCell(`A${row}`).font = { name: FONT_FAMILY, size: 10 }
  worksheet.mergeCells(`A${row}:F${row}`)

  autofitColumns(worksheet)
}

// Generate single child statement sheet
function generateChildStatementSheet(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  brand: ExportHeaderData,
  childId: number,
  lang: string
) {
  const db = getDb()
  const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
  if (!child) {
    throw new Error(`Child not found with ID: ${childId}`)
  }

  const title = lang === 'ar'
    ? `كشف حساب الطفل: ${child.name}`
    : `Account Statement: ${child.name}`

  const startRow = writeBrandingHeader(worksheet, workbook, brand, lang, title)

  // Sub-header details
  const detailsRow1 = worksheet.getRow(startRow)
  detailsRow1.height = 20
  detailsRow1.getCell(1).value = lang === 'ar' ? 'اسم ولي الأمر:' : 'Guardian:'
  detailsRow1.getCell(2).value = child.guardian
  detailsRow1.getCell(4).value = lang === 'ar' ? 'الهاتف:' : 'Phone:'
  detailsRow1.getCell(5).value = child.guardian_phone
  
  const detailsRow2 = worksheet.getRow(startRow + 1)
  detailsRow2.height = 20
  detailsRow2.getCell(1).value = lang === 'ar' ? 'الخدمة الأساسية:' : 'Service:'
  detailsRow2.getCell(2).value = child.service
  detailsRow2.getCell(4).value = lang === 'ar' ? 'تاريخ التسجيل:' : 'Reg Date:'
  detailsRow2.getCell(5).value = child.reg_date

  // Styling sub-header labels
  for (const r of [startRow, startRow + 1]) {
    const row = worksheet.getRow(r)
    row.getCell(1).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF64748B' } }
    row.getCell(4).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF64748B' } }
    row.getCell(2).font = { name: FONT_FAMILY, size: 10, bold: true }
    row.getCell(5).font = { name: FONT_FAMILY, size: 10, bold: true }
  }

  const tableHeaderRowIdx = startRow + 3
  const headers = lang === 'ar'
    ? ['الشهر', 'السنة', 'الخدمة المقدمة', 'الكمية', 'السعر', 'الإجمالي المطلوب', 'المبلغ المدفوع', 'المتأخرات / الرصيد', 'الحالة', 'ملاحظات']
    : ['Month', 'Year', 'Service', 'Quantity', 'Price', 'Total Invoiced', 'Amount Paid', 'Balance / Credit', 'Status', 'Notes']

  const headerRow = worksheet.getRow(tableHeaderRowIdx)
  headerRow.values = headers
  headerRow.height = 24
  headerRow.eachCell((cell) => {
    cell.font = { name: FONT_FAMILY, size: 10, bold: true }
    cell.fill = HEADER_FILL
    cell.border = BORDER_STYLE
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  // Get historical child payments via statement service
  const existingPayments = db.prepare('SELECT month, year, service, unit, quantity, price, total, paid, balance, status, notes FROM payments WHERE child_id = ?').all(childId) as any[]
  const statement = getChildStatement(child, existingPayments, new Date())

  let currentRow = tableHeaderRowIdx + 1
  for (const p of statement.rows) {
    const rowValues = [
      translateMonthName(p.month, lang),
      p.year,
      p.service,
      p.quantity,
      p.price,
      p.total,
      p.paid,
      p.balance,
      p.status,
      p.notes || ''
    ]
    const dataRow = worksheet.getRow(currentRow)
    dataRow.values = rowValues
    dataRow.height = 20
    currentRow++
  }

  // Add Totals
  if (statement.rows.length > 0) {
    const totalRow = worksheet.getRow(currentRow)
    totalRow.height = 22
    totalRow.getCell(1).value = lang === 'ar' ? 'إجمالي الحساب التراكمي' : 'Cumulative Totals'
    totalRow.getCell(6).value = { formula: `SUM(F${tableHeaderRowIdx + 1}:F${currentRow - 1})` }
    totalRow.getCell(7).value = { formula: `SUM(G${tableHeaderRowIdx + 1}:G${currentRow - 1})` }
    totalRow.getCell(8).value = { formula: `SUM(H${tableHeaderRowIdx + 1}:H${currentRow - 1})` }

    for (let c = 1; c <= 10; c++) {
      const cell = totalRow.getCell(c)
      cell.fill = SUBHEADER_FILL
      cell.border = BORDER_STYLE
      cell.font = { name: FONT_FAMILY, size: 10, bold: true }
      if ([6, 7, 8].includes(c)) {
        cell.numFmt = '#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
    }
  }

  formatGridData(worksheet, tableHeaderRowIdx + 1, [5, 6, 7, 8], [], 9)
  autofitColumns(worksheet)
}

function translateMonthName(mAr: string, lang: string): string {
  if (lang === 'ar') return mAr
  const idx = arabicMonths.indexOf(mAr)
  return idx !== -1 ? englishMonths[idx] : mAr
}

// Main excel builder handler mapping to paths
export async function buildExcelFile(
  type: 'full' | 'month' | 'child' | 'childReport' | 'salaries' | 'expenses' | 'employees' | 'payrollReport',
  params: any,
  savePath: string
): Promise<void> {
  const { month, year, childId, lang = 'ar' } = params
  const workbook = new ExcelJS.Workbook()
  const brand = getExportHeader()

  // Build sheets based on type
  if (type === 'month') {
    const sheetName = lang === 'ar' ? `${month} ${year}` : `${month}_${year}`
    const ws = workbook.addWorksheet(sheetName)
    generateMonthSheet(ws, workbook, brand, month, year, lang, params.paymentIds)
  }

  else if (type === 'payrollReport') {
    const sheetName = lang === 'ar' ? 'تقرير الرواتب' : 'Payroll Report'
    const ws = workbook.addWorksheet(sheetName)
    generatePayrollReportSheet(ws, workbook, brand, { month: Number(params.month), year: Number(params.year) }, lang)
  }

  else if (type === 'childReport') {
    const ws = workbook.addWorksheet(lang === 'ar' ? 'تقرير الطفل' : 'Child Report')
    generateChildReportSheet(ws, workbook, brand, Number(childId), lang)
  }

  else if (type === 'child') {
    const ws = workbook.addWorksheet(lang === 'ar' ? 'كشف الحساب' : 'Statement')
    generateChildStatementSheet(ws, workbook, brand, Number(childId), lang)
  }
  
  else if (type === 'salaries') {
    const sheetName = lang === 'ar' ? 'الرواتب' : 'Salaries'
    const ws = workbook.addWorksheet(sheetName)
    generateSalariesSheet(ws, workbook, brand, month, year, lang)
  } 
  
  else if (type === 'expenses') {
    const sheetName = lang === 'ar' ? 'المصاريف' : 'Expenses'
    const ws = workbook.addWorksheet(sheetName)
    generateExpensesSheet(ws, workbook, brand, year, lang)
  }

  else if (type === 'employees') {
    const sheetName = lang === 'ar' ? 'الموظفون' : 'Employees'
    const ws = workbook.addWorksheet(sheetName)
    generateEmployeesSheet(ws, workbook, brand, lang)
  }
  
  else if (type === 'full') {
    // 1. Dashboard summary tab
    const wsDash = workbook.addWorksheet(lang === 'ar' ? 'لوحة القيادة' : 'Dashboard')
    wsDash.views = [{ showGridLines: true, rightToLeft: lang === 'ar' }]
    
    // Simple summary metrics card on full dashboard sheet
    const startRow = writeBrandingHeader(wsDash, workbook, brand, lang, lang === 'ar' ? 'الملخص المالي السنوي العام' : 'Annual Summary Dashboard')
    wsDash.getCell(`A${startRow}`).value = lang === 'ar' ? 'تحليل السنة المالية:' : 'Fiscal Year Analysis:'
    wsDash.getCell(`A${startRow}`).font = { name: FONT_FAMILY, size: 11, bold: true }
    wsDash.getCell(`B${startRow}`).value = year

    const db = getDb()
    const payRows = db.prepare("SELECT total, paid, balance FROM payments WHERE year = ?").all(year) as any[]
    const expRows = db.prepare("SELECT amount FROM expenses WHERE year = ?").all(year) as any[]
    const salRows = db.prepare("SELECT actual_paid FROM salary_payments WHERE year = ?").all(year) as any[]

    const invoiced = payRows.reduce((s, r) => s + r.total, 0)
    const collected = payRows.reduce((s, r) => s + r.paid, 0)
    const arrears = payRows.reduce((s, r) => s + Math.max(0, r.balance), 0)
    const expTotal = expRows.reduce((s, r) => s + r.amount, 0)
    const salTotal = salRows.reduce((s, r) => s + r.actual_paid, 0)
    const netProfit = collected - (expTotal + salTotal)
    const collectionRate = invoiced > 0 ? (collected / invoiced) : 0

    const wsDashValues = [
      [lang === 'ar' ? 'إجمالي المطلوب سداده' : 'Total Invoiced', invoiced],
      [lang === 'ar' ? 'إجمالي المبالغ المحصلة' : 'Total Collected', collected],
      [lang === 'ar' ? 'إجمالي المتأخرات المستحقة' : 'Outstanding Arrears', arrears],
      [lang === 'ar' ? 'إجمالي المصاريف التشغيلية' : 'Operational Cost', expTotal],
      [lang === 'ar' ? 'إجمالي المرتبات المنصرفة' : 'Employee Salaries', salTotal],
      [lang === 'ar' ? 'صافي الأرباح المحققة' : 'Net Annual Profit', netProfit],
      [lang === 'ar' ? 'معدل التحصيل السنوي' : 'Annual Collection Rate', collectionRate]
    ]

    let rIdx = startRow + 2
    for (const [lbl, val] of wsDashValues) {
      wsDash.getCell(`A${rIdx}`).value = lbl
      wsDash.getCell(`B${rIdx}`).value = val
      wsDash.getCell(`A${rIdx}`).font = { name: FONT_FAMILY, size: 10, bold: true }
      wsDash.getCell(`B${rIdx}`).font = { name: FONT_FAMILY, size: 10, bold: true }
      wsDash.getCell(`A${rIdx}`).border = BORDER_STYLE
      wsDash.getCell(`B${rIdx}`).border = BORDER_STYLE
      
      if (lbl === (lang === 'ar' ? 'معدل التحصيل السنوي' : 'Annual Collection Rate')) {
        wsDash.getCell(`B${rIdx}`).numFmt = '0%'
      } else {
        wsDash.getCell(`B${rIdx}`).numFmt = '#,##0.00'
      }
      rIdx++
    }
    autofitColumns(wsDash)

    // 2. Children list tab
    const wsKids = workbook.addWorksheet(lang === 'ar' ? 'الأطفال' : 'Children')
    generateChildrenSheet(wsKids, workbook, brand, lang)

    // 3. Salaries tab
    const wsSal = workbook.addWorksheet(lang === 'ar' ? 'الرواتب' : 'Salaries')
    generateSalariesSheet(wsSal, workbook, brand, 'ديسمبر', year, lang) // Generate December default summary

    // 4. Expenses tab
    const wsExp = workbook.addWorksheet(lang === 'ar' ? 'المصاريف' : 'Expenses')
    generateExpensesSheet(wsExp, workbook, brand, year, lang)

    // 5. 12 Monthly billing sheets
    for (const m of arabicMonths) {
      const wsMonth = workbook.addWorksheet(m)
      generateMonthSheet(wsMonth, workbook, brand, m, year, lang)
    }
  }

  // Write workbook to file
  await workbook.xlsx.writeFile(savePath)
}
