import PdfPrinter from 'pdfmake'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '../db/connection.js'
import { getExportHeader } from './exportHeader.js'
import { getChildStatement } from './statementService.js'
import ArabicReshaper from 'arabic-persian-reshaper'

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

// Pure helper function to shape and reverse Arabic text for pdfmake (since pdfmake prints LTR)
export function shapeText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return ''
  const str = String(text)
  const hasArabic = /[\u0600-\u06FF]/.test(str)
  if (!hasArabic) return str

  // Reshape Arabic ligatures
  const shaped = ArabicReshaper.default.ArabicShaper.convertArabic(str)

  // Split into words. Reverse character order for Arabic words.
  // Reversing word order flows the sentence from right to left in LTR rendering.
  const words = shaped.split(' ')
  const processedWords = words.map((word: string) => {
    const isArabic = /[\u0600-\u06FF\uFE70-\uFEFF]/.test(word)
    if (isArabic) {
      return word.split('').reverse().join('')
    }
    return word
  })

  return processedWords.reverse().join(' ')
}

// Generate the standard branding block for PDF
function getPdfHeader(brand: any, lang: string, titleText: string): any[] {
  const isAr = lang === 'ar'
  const headerContent: any[] = []

  // Create organization info columns
  const infoCol = {
    stack: [
      { text: shapeText(brand.orgName), fontSize: 15, bold: true, color: brand.primaryColor },
      { text: shapeText(brand.tagline), fontSize: 9, italic: true, color: '#64748b', margin: [0, 2, 0, 4] },
      { 
        text: shapeText(`${isAr ? 'هاتف:' : 'Tel:'} ${brand.phone} | ${isAr ? 'عنوان:' : 'Addr:'} ${brand.address}`),
        fontSize: 8, 
        color: '#64748b' 
      },
      { 
        text: shapeText(`${isAr ? 'بريد:' : 'Email:'} ${brand.email}`),
        fontSize: 8, 
        color: '#64748b' 
      }
    ],
    alignment: isAr ? 'right' : 'left'
  }

  // Create logo column if enabled and logo file exists
  if (brand.showLogo && brand.logoPath && fs.existsSync(brand.logoPath)) {
    headerContent.push({
      columns: isAr 
        ? [infoCol, { image: brand.logoPath, width: 70, height: 45, alignment: 'left' }] 
        : [{ image: brand.logoPath, width: 70, height: 45, alignment: 'left' }, infoCol],
      columnGap: 15,
      margin: [0, 0, 0, 15]
    })
  } else {
    headerContent.push(infoCol)
  }

  // Divider line
  headerContent.push({
    canvas: [{ type: 'line', x1: 0, y1: 5, x2: isAr ? 762 : 515, y2: 5, lineWidth: 1.5, strokeColor: brand.primaryColor }],
    margin: [0, 0, 0, 15]
  })

  // Document Title
  headerContent.push({
    text: shapeText(titleText),
    fontSize: 13,
    bold: true,
    alignment: isAr ? 'right' : 'left',
    margin: [0, 0, 0, 15]
  })

  return headerContent
}

// Format numbers
const formatCurrency = (val: number, lang: string) => {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(val)
}

function getStatusColor(status: string): string {
  const normalStatus = status.toLowerCase()
  if (normalStatus === 'paid' || normalStatus === 'active' || normalStatus === 'نشط' || normalStatus === 'met' || normalStatus === 'target_met' || normalStatus === 'مكتمل' || normalStatus === 'ناجح') {
    return '#059669' // Green 600
  }
  if (normalStatus === 'unpaid' || normalStatus === 'inactive' || normalStatus === 'غير نشط' || normalStatus === 'missed' || normalStatus === 'target_missed' || normalStatus === 'عجز' || normalStatus === 'غير مكتمل') {
    return '#dc2626' // Red 600
  }
  return '#d97706' // Amber 600
}

export function buildPdfFile(
  type: 'full' | 'month' | 'child' | 'childReport' | 'salaries' | 'expenses' | 'employees' | 'payrollReport',
  params: any,
  savePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const db = getDb()
      const brand = getExportHeader()
      const { month, year, childId, lang = 'ar' } = params
      const isAr = lang === 'ar'

      // Initialize Font Descriptors from userData path
      const fontsDir = path.join(app.getPath('userData'), 'branding/fonts')
      const fontDescriptors = {
        Cairo: {
          normal: path.join(fontsDir, 'Cairo-Regular.ttf'),
          bold: path.join(fontsDir, 'Cairo-Bold.ttf'),
          italic: path.join(fontsDir, 'Cairo-Regular.ttf'),
          bolditalic: path.join(fontsDir, 'Cairo-Bold.ttf'),
        }
      }

      const printer = new PdfPrinter(fontDescriptors)

      // Layout orientation
      let pageOrientation: 'portrait' | 'landscape' = 'portrait'
      if (['full', 'month', 'salaries', 'expenses', 'employees', 'payrollReport'].includes(type)) {
        pageOrientation = 'landscape'
      }

      const docDefinition: any = {
        pageOrientation,
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        defaultStyle: {
          font: 'Cairo',
          fontSize: 9,
          alignment: isAr ? 'right' : 'left'
        },
        content: [],
        footer: (currentPage: number, pageCount: number) => {
          return {
            text: shapeText(`${isAr ? 'صفحة' : 'Page'} ${currentPage} / ${pageCount}`),
            alignment: 'center',
            fontSize: 8,
            color: '#94a3b8',
            margin: [0, 10, 0, 0]
          }
        }
      }

      if (type === 'month') {
        const title = isAr ? `مطالبات واشتراكات شهر ${month} لسنة ${year}` : `Billing Sheet: ${month} ${year}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        // Get monthly payments — filtered to the selected payment IDs when provided (empty = all)
        const hasSelection = Array.isArray(params.paymentIds) && params.paymentIds.length > 0
        const payments = db.prepare(`
          SELECT c.name as child_name, c.guardian, c.guardian_phone, p.service, p.unit, p.quantity, p.price, p.total, p.paid, p.balance, p.status, p.notes
          FROM payments p
          JOIN children c ON p.child_id = c.id
          WHERE p.month = ? AND p.year = ?
          ${hasSelection ? `AND p.id IN (${params.paymentIds.map(() => '?').join(',')})` : ''}
        `).all(month, year, ...(hasSelection ? params.paymentIds : [])) as any[]

        // Table headers
        const headers = isAr
          ? ['اسم الطفل', 'ولي الأمر', 'الهاتف', 'الخدمة', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'المتأخرات', 'الحالة']
          : ['Child Name', 'Guardian', 'Phone', 'Service', 'Unit', 'Qty', 'Price', 'Total', 'Paid', 'Arrears', 'Status']

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let totalInvoiced = 0
        let totalCollected = 0
        let arrears = 0

        for (const p of payments) {
          totalInvoiced += p.total
          totalCollected += p.paid
          arrears += p.balance

          body.push([
            { text: shapeText(p.child_name), bold: false, fillColor: '', color: '', alignment: isAr ? 'right' : 'left' },
            { text: shapeText(p.guardian), bold: false, fillColor: '', color: '', alignment: isAr ? 'right' : 'left' },
            { text: shapeText(p.guardian_phone), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(p.service), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(p.unit), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(p.quantity), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(formatCurrency(p.price, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.total, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.paid, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.balance, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(p.status), bold: true, fillColor: '', color: getStatusColor(p.status), alignment: 'center' }
          ])
        }

        // Add Totals Row
        body.push([
          { text: shapeText(isAr ? 'إجمالي المحاسبة' : 'Totals'), bold: true, fillColor: '#f1f5f9', color: '', alignment: isAr ? 'right' : 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: shapeText(formatCurrency(totalInvoiced, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: shapeText(formatCurrency(totalCollected, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: shapeText(formatCurrency(arrears, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' }
        ])

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      } 
      
      else if (type === 'childReport') {
        const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
        if (!child) throw new Error('Child not found')

        const title = isAr ? `تقرير الطفل الشامل: ${child.name}` : `Full Child Report: ${child.name}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        const sectionHeader = (text: string) => ({
          text: shapeText(text), fontSize: 12, bold: true, color: '#ffffff',
          fillColor: brand.primaryColor, margin: [4, 4, 4, 4] as [number, number, number, number]
        })
        const kvTable = (pairs: [string, any][]) => ({
          margin: [0, 6, 0, 10] as [number, number, number, number],
          table: {
            widths: ['auto', '*'],
            body: pairs.map(([k, v]) => [
              { text: shapeText(k), bold: true, color: '#64748b' },
              { text: shapeText(v ?? ''), }
            ])
          },
          layout: 'noBorders'
        })
        const simpleTable = (headers: string[], rows: any[][], emptyMsg: string) => {
          if (rows.length === 0) {
            return { text: shapeText(emptyMsg), italics: true, color: '#94a3b8', margin: [0, 0, 0, 10] as [number, number, number, number] }
          }
          const body = [
            headers.map((h) => ({ text: shapeText(h), bold: true, fillColor: '#f1f5f9', alignment: 'center' })),
            ...rows.map((r) => r.map((c) => ({ text: shapeText(c ?? ''), alignment: isAr ? 'right' : 'left' })))
          ]
          return {
            margin: [0, 0, 0, 10] as [number, number, number, number],
            table: { headerRows: 1, widths: headers.map(() => '*'), body },
            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }
          }
        }

        // Personal Information
        docDefinition.content.push(sectionHeader(isAr ? '📋 البيانات الشخصية' : '📋 Personal Information'))
        docDefinition.content.push(kvTable([
          [isAr ? 'الاسم' : 'Name', child.name],
          [isAr ? 'ولي الأمر' : 'Guardian', child.guardian],
          [isAr ? 'هاتف ولي الأمر' : 'Guardian Phone', child.guardian_phone],
          [isAr ? 'تاريخ التسجيل' : 'Registration Date', child.reg_date],
          [isAr ? 'الحالة' : 'Status', child.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')]
        ]))

        // Enrolled Services & Teachers
        docDefinition.content.push(sectionHeader(isAr ? '🏷️ الخدمات والمعلمون' : '🏷️ Services & Teachers'))
        const services = db.prepare(`
          SELECT cs.service, cs.unit, cs.price, e.name as teacher_name
          FROM child_services cs LEFT JOIN employees e ON e.id = cs.teacher_id
          WHERE cs.child_id = ?
        `).all(childId) as any[]
        docDefinition.content.push(simpleTable(
          isAr ? ['الخدمة', 'الوحدة', 'السعر', 'المعلم'] : ['Service', 'Unit', 'Price', 'Teacher'],
          services.map((s) => [s.service, s.unit, formatCurrency(s.price, lang), s.teacher_name || (isAr ? 'بدون معلم' : 'No teacher')]),
          isAr ? 'لا توجد خدمات مسجلة.' : 'No services enrolled.'
        ))

        // Attendance History + Percentage
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
        docDefinition.content.push(sectionHeader(
          isAr ? `📅 سجل الحضور — نسبة الحضور: ${pct != null ? pct + '%' : 'غير متاح'}` : `📅 Attendance History — Attendance %: ${pct != null ? pct + '%' : 'N/A'}`
        ))
        docDefinition.content.push(simpleTable(
          isAr ? ['التاريخ', 'المعلم', 'حالة المعلم', 'حالة الطفل'] : ['Date', 'Teacher', 'Teacher Status', 'Child Status'],
          attendanceRows.map((a) => [a.attendance_date, a.teacher_name || '', a.teacher_status || '', a.child_status]),
          isAr ? 'لا يوجد سجل حضور بعد.' : 'No attendance history yet.'
        ))

        // Payment History
        docDefinition.content.push(sectionHeader(isAr ? '💰 السجل المالي' : '💰 Payment History'))
        const existingPaymentsForReport = db.prepare(
          'SELECT month, year, service, unit, quantity, price, total, paid, balance, status FROM payments WHERE child_id = ?'
        ).all(childId) as any[]
        const statementForReport = getChildStatement(child, existingPaymentsForReport, new Date())
        docDefinition.content.push(simpleTable(
          isAr ? ['الشهر', 'السنة', 'الخدمة', 'الإجمالي', 'المدفوع', 'الرصيد', 'الحالة'] : ['Month', 'Year', 'Service', 'Total', 'Paid', 'Balance', 'Status'],
          statementForReport.rows.map((p: any) => {
            const mIdx = arabicMonths.indexOf(p.month)
            const mStr = isAr ? p.month : (mIdx !== -1 ? englishMonths[mIdx] : p.month)
            return [mStr, p.year, p.service, formatCurrency(p.total, lang), formatCurrency(p.paid, lang), formatCurrency(p.balance, lang), p.status]
          }),
          isAr ? 'لا توجد معاملات مالية مسجلة.' : 'No financial transactions recorded.'
        ))

        // Notes
        docDefinition.content.push(sectionHeader(isAr ? '📝 ملاحظات' : '📝 Notes'))
        docDefinition.content.push({ text: shapeText(child.notes || (isAr ? 'لا توجد ملاحظات.' : 'No notes.')), margin: [0, 6, 0, 0] })
      }

      else if (type === 'child') {
        const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId) as any
        if (!child) throw new Error('Child not found')

        const title = isAr ? `كشف حساب الطفل: ${child.name}` : `Account Statement: ${child.name}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        // Child Details Block
        docDefinition.content.push({
          margin: [0, 0, 0, 15],
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: shapeText(`${isAr ? 'ولي الأمر:' : 'Guardian:'} ${child.guardian}`), bold: true },
                { text: shapeText(`${isAr ? 'الهاتف:' : 'Phone:'} ${child.guardian_phone}`), bold: true }
              ],
              [
                { text: shapeText(`${isAr ? 'الخدمة الأساسية:' : 'Service:'} ${child.service}`), bold: true },
                { text: shapeText(`${isAr ? 'تاريخ التسجيل:' : 'Reg Date:'} ${child.reg_date}`), bold: true }
              ]
            ]
          },
          layout: 'noBorders'
        })

        // Fetch child statements via statement service
        const existingPayments = db.prepare('SELECT month, year, service, unit, quantity, price, total, paid, balance, status FROM payments WHERE child_id = ?').all(childId) as any[]
        const statement = getChildStatement(child, existingPayments, new Date())

        const headers = isAr
          ? ['الشهر', 'السنة', 'الخدمة المقدمة', 'الكمية', 'السعر', 'الإجمالي المطلـوب', 'المبلغ المدفوع', 'المتأخرات', 'الحالة']
          : ['Month', 'Year', 'Service', 'Qty', 'Price', 'Invoiced', 'Paid', 'Balance', 'Status']

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let totalInvoiced = 0
        let totalCollected = 0
        let totalBalance = 0

        for (const p of statement.rows) {
          totalInvoiced += p.total
          totalCollected += p.paid
          totalBalance += p.balance

          const mIdx = arabicMonths.indexOf(p.month)
          const mStr = isAr ? p.month : (mIdx !== -1 ? englishMonths[mIdx] : p.month)

          body.push([
            { text: shapeText(mStr), bold: false, fillColor: '', color: '', alignment: isAr ? 'right' : 'left' },
            { text: shapeText(p.year), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(p.service), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(p.quantity), bold: false, fillColor: '', color: '', alignment: 'center' },
            { text: shapeText(formatCurrency(p.price, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.total, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.paid, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(formatCurrency(p.balance, lang)), bold: false, fillColor: '', color: '', alignment: 'right' },
            { text: shapeText(p.status), bold: true, fillColor: '', color: getStatusColor(p.status), alignment: 'center' }
          ])
        }

        // Totals Row
        body.push([
          { text: shapeText(isAr ? 'إجمالي الحساب التراكمي' : 'Totals'), bold: true, fillColor: '#f1f5f9', color: '', alignment: isAr ? 'right' : 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' },
          { text: shapeText(formatCurrency(totalInvoiced, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: shapeText(formatCurrency(totalCollected, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: shapeText(formatCurrency(totalBalance, lang)), bold: true, fillColor: '#f1f5f9', color: '', alignment: 'right' },
          { text: '', bold: false, fillColor: '#f1f5f9', color: '', alignment: 'left' }
        ])

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      } 
      
      else if (type === 'salaries') {
        const title = isAr ? `مرتبات ومكافآت الموظفين لشهر ${month} لسنة ${year}` : `Employee Payroll: ${month} ${year}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        const payroll = db.prepare(`
          SELECT e.name, e.role, e.base_salary, e.housing, e.transport, e.net_salary,
                 s.bonus, s.deductions, s.actual_paid, s.paid_date as pay_date
          FROM employees e
          LEFT JOIN salary_payments s ON e.id = s.employee_id AND s.month = ? AND s.year = ?
          WHERE e.is_active = 1 OR s.id IS NOT NULL
        `).all(month, year) as any[]

        const headers = isAr
          ? ['اسم الموظف', 'الدور', 'الراتب الأساسي', 'بدل سكن', 'بدل انتقال', 'صافي الراتب', 'مكافآت', 'خصومات', 'المدفوع الفعلي', 'تاريخ الصرف']
          : ['Employee Name', 'Role', 'Base Salary', 'Housing', 'Transport', 'Net Salary', 'Bonuses', 'Deductions', 'Actual Paid', 'Pay Date']

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let sumPaid = 0
        for (const p of payroll) {
          const actualPaid = p.actual_paid !== null && p.actual_paid !== undefined ? p.actual_paid : p.net_salary
          sumPaid += actualPaid

          body.push([
            { text: shapeText(p.name), bold: false, alignment: isAr ? 'right' : 'left' },
            { text: shapeText(p.role === 'admin' ? (isAr ? 'مسؤول' : 'Admin') : (isAr ? 'موظف' : 'Employee')), alignment: 'center' },
            { text: shapeText(formatCurrency(p.base_salary, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(p.housing, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(p.transport, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(p.net_salary, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(p.bonus || 0, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(p.deductions || 0, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(actualPaid, lang)), bold: true, alignment: 'right' },
            { text: shapeText(p.pay_date || ''), alignment: 'center' }
          ])
        }

        body.push([
          { text: shapeText(isAr ? 'إجمالي منصرف الرواتب' : 'Total Payroll'), bold: true, fillColor: '#f1f5f9', alignment: isAr ? 'right' : 'left' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: '', fillColor: '#f1f5f9' },
          { text: shapeText(formatCurrency(sumPaid, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
          { text: '', fillColor: '#f1f5f9' }
        ])

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      } 
      
      else if (type === 'employees') {
        const title = isAr ? 'سجل الموظفين' : 'Employees Roster'
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        const employees = db.prepare(`
          SELECT name, role, base_salary, housing, transport, net_salary, is_active
          FROM employees
          ORDER BY is_active DESC, name ASC
        `).all() as any[]

        const headers = isAr
          ? ['اسم الموظف', 'الوظيفة', 'الراتب الأساسي', 'بدل سكن', 'بدل انتقال', 'صافي الراتب', 'الحالة']
          : ['Employee Name', 'Role', 'Base Salary', 'Housing', 'Transport', 'Net Salary', 'Status']

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let sumBase = 0, sumHousing = 0, sumTransport = 0, sumNet = 0
        for (const e of employees) {
          if (e.is_active === 1) {
            sumBase += e.base_salary || 0
            sumHousing += e.housing || 0
            sumTransport += e.transport || 0
            sumNet += e.net_salary || 0
          }
          body.push([
            { text: shapeText(e.name), alignment: isAr ? 'right' : 'left' },
            { text: shapeText(e.role), alignment: 'center' },
            { text: shapeText(formatCurrency(e.base_salary, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(e.housing, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(e.transport, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(e.net_salary, lang)), bold: true, alignment: 'right' },
            { text: shapeText(e.is_active === 1 ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')), alignment: 'center' }
          ])
        }

        body.push([
          { text: shapeText(isAr ? 'الإجمالي (النشطون)' : 'Totals (active)'), bold: true, fillColor: '#f1f5f9', alignment: isAr ? 'right' : 'left' },
          { text: '', fillColor: '#f1f5f9' },
          { text: shapeText(formatCurrency(sumBase, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
          { text: shapeText(formatCurrency(sumHousing, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
          { text: shapeText(formatCurrency(sumTransport, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
          { text: shapeText(formatCurrency(sumNet, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
          { text: '', fillColor: '#f1f5f9' }
        ])

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      }

      else if (type === 'payrollReport') {
        const monthNum = Number(month)
        const monthLabel = isAr ? arabicMonths[monthNum - 1] : englishMonths[monthNum - 1]
        const title = isAr ? `تقرير رواتب المعلمين لشهر ${monthLabel} ${year}` : `Teacher Payroll Report: ${monthLabel} ${year}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        const mm = String(monthNum).padStart(2, '0')
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

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let sumTotal = 0
        for (const r of rows) {
          sumTotal += r.total_salary
          body.push([
            { text: shapeText(r.teacher_name), alignment: isAr ? 'right' : 'left' },
            { text: shapeText(r.sessions_paid), alignment: 'center' },
            { text: shapeText(formatCurrency(r.session_cost || 0, lang)), alignment: 'right' },
            { text: shapeText(formatCurrency(r.total_salary, lang)), bold: true, alignment: 'right' }
          ])
        }

        if (rows.length > 0) {
          body.push([
            { text: shapeText(isAr ? 'إجمالي الرواتب' : 'Total Payroll'), bold: true, fillColor: '#f1f5f9', alignment: isAr ? 'right' : 'left' },
            { text: '', fillColor: '#f1f5f9' },
            { text: '', fillColor: '#f1f5f9' },
            { text: shapeText(formatCurrency(sumTotal, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' }
          ])
        } else {
          // FR-009: a valid, clearly-labeled empty report rather than an error.
          body.push([
            { text: shapeText(isAr ? 'لا توجد جلسات مدفوعة لهذا الشهر.' : 'No paid sessions for this month.'), italic: true, color: '#94a3b8', colSpan: 4 },
            {}, {}, {}
          ])
        }

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      }

      else if (type === 'expenses') {
        const title = isAr ? `تقرير المصاريف التشغيلية السنوية لسنة ${year}` : `Annual Expenses: ${year}`
        docDefinition.content.push(...getPdfHeader(brand, lang, title))

        const items = db.prepare('SELECT DISTINCT item, category FROM expenses WHERE year = ? UNION SELECT DISTINCT item, category FROM expenses').all(year) as any[]

        const monthsHeaders = arabicMonths.map((m, idx) => isAr ? m : englishMonths[idx])
        const headers = [
          isAr ? 'البند' : 'Item',
          isAr ? 'التصنيف' : 'Category',
          ...monthsHeaders,
          isAr ? 'الإجمالي' : 'Total'
        ]

        const body: any[][] = [
          headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
        ]

        let grandTotal = 0
        const colTotals = Array(12).fill(0)

        for (const it of items) {
          const row: any[] = [
            { text: shapeText(it.item), bold: false, alignment: isAr ? 'right' : 'left' },
            { text: shapeText(it.category || ''), alignment: 'center' }
          ]

          let itemTotal = 0
          for (let mIdx = 0; mIdx < arabicMonths.length; mIdx++) {
            const m = arabicMonths[mIdx]
            const exp = db.prepare('SELECT amount FROM expenses WHERE item = ? AND month = ? AND year = ?').get(it.item, m, year) as any
            const amount = exp ? exp.amount : 0
            row.push({ text: shapeText(formatCurrency(amount, lang)), alignment: 'right' })
            itemTotal += amount
            colTotals[mIdx] += amount
          }

          row.push({ text: shapeText(formatCurrency(itemTotal, lang)), bold: true, alignment: 'right' })
          body.push(row)
          grandTotal += itemTotal
        }

        // Add monthly sums row
        const totalRow: any[] = [
          { text: shapeText(isAr ? 'المجموع الشهري' : 'Monthly Totals'), bold: true, fillColor: '#f1f5f9', alignment: isAr ? 'right' : 'left' },
          { text: '', fillColor: '#f1f5f9' }
        ]
        for (const colSum of colTotals) {
          totalRow.push({ text: shapeText(formatCurrency(colSum, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' })
        }
        totalRow.push({ text: shapeText(formatCurrency(grandTotal, lang)), bold: true, fillColor: '#f8fafc', alignment: 'right' })
        body.push(totalRow)

        // Custom column widths: item name, category, 12 months (each auto), total (auto)
        const widths = ['*', 'auto', ...Array(12).fill('auto'), 'auto']

        docDefinition.content.push({
          table: {
            headerRows: 1,
            widths,
            body
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1'
          }
        })
      } 
      
      else if (type === 'full') {
        // Full export renders multiple pages
        // Page 1: cover sheet/dashboard stats
        const coverTitle = isAr ? `التقرير السنوي الشامل لسنة ${year}` : `Full Annual Report: ${year}`
        docDefinition.content.push(...getPdfHeader(brand, lang, coverTitle))

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

        docDefinition.content.push({
          text: shapeText(isAr ? 'البيانات المالية السنوية التراكمية' : 'Annual Financial Cumulative Summary'),
          fontSize: 12, bold: true, margin: [0, 10, 0, 10]
        })

        const summaryTable = {
          widths: ['*', '*'],
          body: [
            [{ text: shapeText(isAr ? 'المؤشر المالي' : 'Key Performance Indicator'), bold: true, fillColor: brand.primaryColor, color: '#ffffff' }, { text: shapeText(isAr ? 'القيمة الإجمالية' : 'Total Value'), bold: true, fillColor: brand.primaryColor, color: '#ffffff' }],
            [shapeText(isAr ? 'إجمالي المطلوب سداده' : 'Total Invoiced'), shapeText(formatCurrency(invoiced, lang))],
            [shapeText(isAr ? 'إجمالي المبالغ المحصلة' : 'Total Collected'), shapeText(formatCurrency(collected, lang))],
            [shapeText(isAr ? 'إجمالي المتأخرات المستحقة' : 'Outstanding Arrears'), shapeText(formatCurrency(arrears, lang))],
            [shapeText(isAr ? 'إجمالي المصاريف التشغيلية' : 'Operational Cost'), shapeText(formatCurrency(expTotal, lang))],
            [shapeText(isAr ? 'إجمالي المرتبات المنصرفة' : 'Employee Salaries'), shapeText(formatCurrency(salTotal, lang))],
            [shapeText(isAr ? 'صافي الأرباح المحققة' : 'Net Annual Profit'), shapeText(formatCurrency(netProfit, lang))],
            [shapeText(isAr ? 'معدل التحصيل السنوي' : 'Annual Collection Rate'), shapeText(`${Math.round(collectionRate * 100)}%`)]
          ]
        }

        docDefinition.content.push({ table: summaryTable, margin: [0, 0, 0, 20] })

        // Page break to children list
        docDefinition.content.push({ text: '', pageBreak: 'after' })

        // 2. Children roster
        docDefinition.content.push(...getPdfHeader(brand, lang, isAr ? 'قائمة سجلات الأطفال' : 'Children Records List'))
        const kids = db.prepare('SELECT name, guardian, guardian_phone, service, price, reg_date FROM children').all() as any[]
        
        const kidHeaders = isAr 
          ? ['اسم الطفل', 'ولي الأمر', 'رقم الهاتف', 'الخدمة', 'السعر', 'تاريخ التسجيل']
          : ['Child Name', 'Guardian', 'Phone', 'Service', 'Price', 'Reg Date']

        const kidBody: any[][] = [kidHeaders.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))]
        for (const k of kids) {
          kidBody.push([
            shapeText(k.name),
            shapeText(k.guardian),
            shapeText(k.guardian_phone),
            shapeText(k.service),
            shapeText(formatCurrency(k.price, lang)),
            shapeText(k.reg_date)
          ])
        }
        docDefinition.content.push({ table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto', 'auto', 'auto'], body: kidBody } })

        // Page break to monthly sheets
        docDefinition.content.push({ text: '', pageBreak: 'after' })

        // 3. Render 12 months billing tables
        for (let mIdx = 0; mIdx < arabicMonths.length; mIdx++) {
          const m = arabicMonths[mIdx]
          const mTitle = isAr ? `مطالبات شهر ${m} لسنة ${year}` : `Billing Sheet: ${englishMonths[mIdx]} ${year}`
          
          docDefinition.content.push(...getPdfHeader(brand, lang, mTitle))

          const payments = db.prepare(`
            SELECT c.name as child_name, p.service, p.quantity, p.price, p.total, p.paid, p.balance, p.status
            FROM payments p
            JOIN children c ON p.child_id = c.id
            WHERE p.month = ? AND p.year = ?
          `).all(m, year) as any[]

          const headers = isAr
            ? ['اسم الطفل', 'الخدمة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'المتأخرات', 'الحالة']
            : ['Child Name', 'Service', 'Qty', 'Price', 'Total', 'Paid', 'Arrears', 'Status']

          const body: any[][] = [
            headers.map(h => ({ text: shapeText(h), bold: true, fillColor: brand.primaryColor, color: '#ffffff', alignment: 'center' }))
          ]

          let totalM = 0
          let collectedM = 0
          let arrearsM = 0

          for (const p of payments) {
            totalM += p.total
            collectedM += p.paid
            arrearsM += p.balance

            body.push([
              { text: shapeText(p.child_name), alignment: isAr ? 'right' : 'left' },
              { text: shapeText(p.service), alignment: 'center' },
              { text: shapeText(p.quantity), alignment: 'center' },
              { text: shapeText(formatCurrency(p.price, lang)), alignment: 'right' },
              { text: shapeText(formatCurrency(p.total, lang)), alignment: 'right' },
              { text: shapeText(formatCurrency(p.paid, lang)), alignment: 'right' },
              { text: shapeText(formatCurrency(p.balance, lang)), alignment: 'right' },
              { text: shapeText(p.status), bold: true, color: getStatusColor(p.status), alignment: 'center' }
            ])
          }

          body.push([
            { text: shapeText(isAr ? 'المجموع' : 'Total'), bold: true, fillColor: '#f1f5f9', alignment: isAr ? 'right' : 'left' },
            { text: '', fillColor: '#f1f5f9' },
            { text: '', fillColor: '#f1f5f9' },
            { text: '', fillColor: '#f1f5f9' },
            { text: shapeText(formatCurrency(totalM, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
            { text: shapeText(formatCurrency(collectedM, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
            { text: shapeText(formatCurrency(arrearsM, lang)), bold: true, fillColor: '#f1f5f9', alignment: 'right' },
            { text: '', fillColor: '#f1f5f9' }
          ])

          docDefinition.content.push({
            table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'], body }
          })

          if (mIdx < arabicMonths.length - 1) {
            docDefinition.content.push({ text: '', pageBreak: 'after' })
          }
        }
      }

      // Generate PDF doc stream
      const pdfDoc = printer.createPdfKitDocument(docDefinition)
      const writeStream = fs.createWriteStream(savePath)

      pdfDoc.pipe(writeStream)

      writeStream.on('finish', () => {
        resolve()
      })

      writeStream.on('error', (err) => {
        reject(err)
      })

      pdfDoc.end()
    } catch (e) {
      reject(e)
    }
  })
}
