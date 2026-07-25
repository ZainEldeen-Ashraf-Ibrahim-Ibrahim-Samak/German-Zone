import { ipcMain, dialog } from 'electron'
import { requireAdmin } from './_guard.js'
import { getCurrentUser } from './authIPC.js'
import { buildExcelFile } from '../services/exportService.js'
import { buildPdfFile } from '../services/pdfService.js'
import { buildCsvFile } from '../services/csvService.js'
import { buildPrintPreviewHtml } from '../services/printService.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
  return user
}

// Utility to handle export build logic depending on format
async function executeExport(
  type: 'full' | 'month' | 'child' | 'childReport' | 'salaries' | 'expenses' | 'employees' | 'payrollReport',
  params: any,
  defaultFilename: string
) {
  const isAr = params.lang === 'ar'
  const filters = params.format === 'xlsx'
    ? [{ name: 'Excel Workbook (*.xlsx)', extensions: ['xlsx'] }]
    : params.format === 'csv'
      ? [{ name: 'CSV (*.csv)', extensions: ['csv'] }]
      : [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }]

  const result = await dialog.showSaveDialog({
    title: isAr ? 'حفظ ملف التصدير' : 'Save Exported File',
    defaultPath: defaultFilename,
    filters
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  const savePath = result.filePath

  if (params.format === 'xlsx') {
    await buildExcelFile(type, params, savePath)
  } else if (params.format === 'csv') {
    await buildCsvFile(type as 'payrollReport' | 'expenses' | 'childReport' | 'month', params, savePath)
  } else {
    await buildPdfFile(type, params, savePath)
  }

  return { filePath: savePath }
}

// 1. Full database export (Admin only)
ipcMain.handle('export:full', async (_event, { year, format, lang }) => {
  try {
    requireAdmin()
    const filename = lang === 'ar' 
      ? `التقرير_السنوي_الشامل_${year}.${format}`
      : `full_annual_report_${year}.${format}`
    return await executeExport('full', { year, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run full export:', error)
    throw new Error(error.message || 'Failed to complete full database export')
  }
})

// 2. Month payments sheet export (All authenticated users)
// paymentIds — optional list of selected payment row IDs; when omitted/empty, all rows for the
// period are exported (select-to-export with "no selection = export all" fallback).
ipcMain.handle('export:month', async (_event, { month, year, format, lang, paymentIds }) => {
  try {
    checkAuth()
    const filename = lang === 'ar'
      ? `مطالبات_${month}_${year}.${format}`
      : `billing_${month}_${year}.${format}`
    return await executeExport('month', { month, year, format, lang, paymentIds }, filename)
  } catch (error: any) {
    console.error('Failed to run month payments export:', error)
    throw new Error(error.message || 'Failed to export monthly payments')
  }
})

// 3. Child account statement export (All authenticated users - employees can export statement)
ipcMain.handle('export:child', async (_event, { childId, format, lang }) => {
  try {
    checkAuth()
    const filename = lang === 'ar'
      ? `كشف_حساب_طفل_${childId}.${format}`
      : `child_statement_${childId}.${format}`
    return await executeExport('child', { childId, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run child statement export:', error)
    throw new Error(error.message || 'Failed to export child statement')
  }
})

// 3b. Full Child Report export — feature 007, FR-007 (All authenticated users, matches export:child access)
ipcMain.handle('export:childReport', async (_event, { childId, format, lang }) => {
  try {
    checkAuth()
    const filename = lang === 'ar'
      ? `تقرير_طفل_شامل_${childId}.${format}`
      : `child_report_${childId}.${format}`
    return await executeExport('childReport', { childId, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run child report export:', error)
    throw new Error(error.message || 'Failed to export child report')
  }
})

// 4. Salaries export (Admin only)
ipcMain.handle('export:salaries', async (_event, { month, year, format, lang }) => {
  try {
    requireAdmin()
    const filename = lang === 'ar'
      ? `رواتب_${month}_${year}.${format}`
      : `payroll_${month}_${year}.${format}`
    return await executeExport('salaries', { month, year, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run salaries export:', error)
    throw new Error(error.message || 'Failed to export payroll report')
  }
})

// 7. Payroll (attendance-based) report export — feature 007, FR-005 (Admin only)
ipcMain.handle('export:payrollReport', async (_event, { month, year, format, lang }) => {
  try {
    requireAdmin()
    const filename = lang === 'ar'
      ? `تقرير_رواتب_المعلمين_${month}_${year}.${format}`
      : `teacher_payroll_report_${month}_${year}.${format}`
    return await executeExport('payrollReport', { month, year, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run payroll report export:', error)
    throw new Error(error.message || 'Failed to export payroll report')
  }
})

// 6. Employees roster export (Admin only)
ipcMain.handle('export:employees', async (_event, { format, lang }) => {
  try {
    requireAdmin()
    const filename = lang === 'ar'
      ? `سجل_الموظفين.${format}`
      : `employees_roster.${format}`
    return await executeExport('employees', { format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run employees export:', error)
    throw new Error(error.message || 'Failed to export employees roster')
  }
})

// 5. Expenses export (Admin only)
ipcMain.handle('export:expenses', async (_event, { year, format, lang }) => {
  try {
    requireAdmin()
    const filename = lang === 'ar'
      ? `مصاريف_تشغيلية_${year}.${format}`
      : `expenses_report_${year}.${format}`
    return await executeExport('expenses', { year, format, lang }, filename)
  } catch (error: any) {
    console.error('Failed to run expenses export:', error)
    throw new Error(error.message || 'Failed to export expenses report')
  }
})

// 8. Print preview — feature 007. Renders the SAME query as the equivalent export:* handler so
// Print can never disagree with Export PDF/Excel (FR-003).
ipcMain.handle('print:preview', async (_event, args) => {
  try {
    if (args.reportType === 'payroll' || args.reportType === 'expenses') requireAdmin()
    else checkAuth()
    return { html: buildPrintPreviewHtml(args.reportType, args) }
  } catch (error: any) {
    console.error('Failed to build print preview:', error)
    throw new Error(error.message || 'Failed to build print preview')
  }
})