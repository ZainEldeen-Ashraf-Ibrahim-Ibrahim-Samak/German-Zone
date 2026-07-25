import ExcelJS from 'exceljs'
import os from 'node:os'
import path from 'node:path'

/**
 * Build a small workbook that mirrors the real `Nursery_V4_Final_5.xlsx` layout:
 * two blank lead columns (data starts at column C = index 3), title in row 1,
 * header in row 3, data from row 4. Returns the path to the written .xlsx.
 *
 * Contents: 3 children, 2 monthly sheets (يناير، فبراير), 2 employees with
 * monthly net columns, 2 expense items, plus one ignored dashboard sheet.
 */
export async function writeSampleWorkbook(): Promise<string> {
  const wb = new ExcelJS.Workbook()

  const setRow = (ws: ExcelJS.Worksheet, rowNum: number, startCol: number, values: any[]) => {
    const row = ws.getRow(rowNum)
    values.forEach((v, i) => { row.getCell(startCol + i).value = v })
    row.commit()
  }

  // Ignored sheet
  wb.addWorksheet('📊 داشبورد')

  // Children master — real layout: blank col A, "#" in col B(2), data from C(3)
  const kids = wb.addWorksheet('👶 بيانات الأطفال')
  setRow(kids, 1, 3, ['👶 بيانات الأطفال'])
  setRow(kids, 3, 2, ['#', 'اسم الطفل', 'اسم ولي الأمر', 'رقم هاتف ولي الأمر', 'رقم هاتف الطفل', 'الرقم القومي', 'الخدمة', 'الوحدة', 'السعر', 'تاريخ التسجيل', 'ملاحظات'])
  setRow(kids, 4, 2, [1, 'أحمد محمد', 'ولي أمر 1', '01000000001', null, '20000000000000', 'حضانة', 'شهر', 3500, '2025-01-01', null])
  setRow(kids, 5, 2, [2, 'فاطمة علي', 'ولي أمر 2', '01000000002', null, '20000000000001', 'حضانة', 'شهر', 3500, '2025-01-01', null])
  setRow(kids, 6, 2, [3, 'سارة خالد', 'ولي أمر 3', '01000000003', null, '20000000000002', 'استضافة', 'شهر', 3000, '2025-02-01', null])

  // Monthly sheet builder ("#" in col B, child name in col C)
  const buildMonth = (name: string, rows: any[][]) => {
    const ws = wb.addWorksheet(name)
    setRow(ws, 1, 3, [`📅 ${name}`])
    setRow(ws, 3, 2, ['#', 'اسم الطفل', 'الخدمة', 'الوحدة', 'الكمية', 'السعر', 'الإجمالي', 'المدفوع', 'الرصيد', 'الحالة', 'ملاحظات'])
    rows.forEach((r, i) => setRow(ws, 4 + i, 2, [i + 1, ...r]))
  }

  // يناير: 3 children; one fully paid, one partial, one unpaid; plus a blank-name
  // row and an embedded summary row (both must be skipped by the importer)
  buildMonth('يناير', [
    ['أحمد محمد', 'حضانة', 'شهر', 1, 3500, 3500, 3500, 0, '✅', null],
    ['فاطمة علي', 'حضانة', 'شهر', 1, 3500, 3500, 1000, 2500, '⚠️', null],
    ['سارة خالد', 'استضافة', 'شهر', 1, 3000, 3000, 0, 3000, '❌', null],
    ['', 'حضانة', 'شهر', 1, 0, 0, 0, 0, '', null], // blank name → skipped
    ['💰 إجمالي الفواتير', '', '', '', '', 10000, 0, 0, '', null], // summary → skipped
    ['📈 صافي الربح', '', '', '', '', 5000, 0, 0, '', null],       // summary → skipped
  ])
  // فبراير: 2 children
  buildMonth('فبراير', [
    ['أحمد محمد', 'حضانة', 'شهر', 1, 3500, 3500, 3500, 0, '✅', null],
    ['فاطمة علي', 'حضانة', 'شهر', 1, 3500, 3500, 3500, 0, '✅', null],
  ])

  // Salaries: header has net at col 11, monthly nets at cols 13..24
  const sal = wb.addWorksheet('👔 الرواتب')
  setRow(sal, 1, 3, ['👔 الرواتب'])
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  // "#" col B(2): name C(3), role D(4), base E(5), housing F(6), transport G(7),
  // bonus H(8), deductions I(9), net J(10), blank K(11), months L(12)..W(23), total X(24)
  setRow(sal, 3, 2, ['#', 'الاسم', 'الوظيفة', 'الراتب الأساسي', 'بدل سكن', 'بدل مواصلات', 'حوافز', 'خصومات', 'صافي الراتب', null, ...months, 'إجمالي'])
  setRow(sal, 4, 2, [1, 'مدير', 'المدير', 6000, 500, 300, 0, 0, 6800, null, ...Array(12).fill(6800), 81600])
  setRow(sal, 5, 2, [2, 'موظفة 1', 'معلمة', 5000, 300, 200, 0, 0, 5500, null, ...Array(12).fill(5500), 66000])
  // Totals row → must be skipped by the importer
  setRow(sal, 6, 2, [3, 'إجمالي الرواتب الشهرية', '', 11000, 800, 500, 0, 0, 12300, null, ...Array(12).fill(12300), 147600])

  // Expenses: "#" B(2), item C(3), months D(4)..O(15), total P(16)
  const exp = wb.addWorksheet('💸 المصروفات')
  setRow(exp, 1, 3, ['💸 المصروفات'])
  setRow(exp, 3, 2, ['#', 'بند المصروف', ...months, 'إجمالي'])
  setRow(exp, 4, 2, [1, 'إيجار المبنى', ...Array(12).fill(15000), 180000])
  setRow(exp, 5, 2, [2, 'فاتورة كهرباء', ...Array(12).fill(2000), 24000])
  // Totals row → must be skipped by the importer
  setRow(exp, 6, 2, [3, 'إجمالي المصروفات التشغيلية', ...Array(12).fill(17000), 204000])

  const filePath = path.join(os.tmpdir(), `nursery-sample-${Date.now()}.xlsx`)
  await wb.xlsx.writeFile(filePath)
  return filePath
}
