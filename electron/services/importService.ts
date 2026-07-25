import ExcelJS from 'exceljs'
import { getDb } from '../db/connection.js'

/**
 * Import service for the Nursery Management System.
 *
 * Reads the center's `Nursery_V4_Final_5.xlsx` workbook (and workbooks of the same
 * layout) and loads children, payments, employees, salary payments, and expenses
 * into the local SQLite database.
 *
 * Workbook layout facts (see specs/002-excel-import-env-config/data-model.md):
 * - Two blank lead columns (A, B); the first data column is index 3 ("C").
 * - Header is row 3; data starts at row 4.
 * - Many cells are Excel formulas — only their cached `.result` carries the value.
 * - Monthly sheets are named with an Arabic month only (no year).
 *
 * Strategy:
 * - Idempotent: existing rows are matched and skipped, never overwritten.
 * - Children matched by name; payments by (child_id, month, year, service);
 *   employees by name; salaries by (employee_id, month, year); expenses by
 *   (item, month, year).
 * - Required fields missing from the workbook are auto-filled with safe
 *   placeholders so the record still imports (FR-006a).
 * - Each sheet's writes run inside a transaction (atomic per sheet).
 */

// ── Shared contract (specs/.../contracts/import-ipc.md) ───────────────────────

export interface EntityCount {
  imported: number
  skipped: number
}

export interface ImportSummary {
  children: EntityCount
  payments: EntityCount
  employees: EntityCount
  salaryPayments: EntityCount
  expenses: EntityCount
  settings: EntityCount
  snapshots: EntityCount
  sheetsProcessed: string[]
  sheetsIgnored: string[]
  year: number
  rowErrors: number
  /** Per-row failures with the reason, so the UI can show what to fix. */
  rowErrorDetails: { sheet: string; row: number; name: string; message: string }[]
}

export interface ImportResult {
  imported: ImportSummary
}

// ── Layout constants ──────────────────────────────────────────────────────────

const DATA_START_ROW = 4

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

// Column numbers are 1-based (ExcelJS getCell). The workbook has a single blank
// lead column (A); the row number ("#") sits in column B(2) and real data starts
// at column C(3). Verified against Nursery_V4_Final_5.xlsx.

// Children master sheet (👶 بيانات الأطفال)
const CHILD_COL = {
  name: 3, guardian: 4, guardianPhone: 5, childPhone: 6, nationalId: 7,
  service: 8, unit: 9, price: 10, regDate: 11, notes: 12
}

// Monthly revenue sheets (يناير … ديسمبر)
const PAY_COL = {
  name: 3, service: 4, unit: 5, quantity: 6, price: 7,
  total: 8, paid: 9, balance: 10, status: 11, notes: 12
}

// Salaries sheet (👔 الرواتب) — monthly net columns span 12..23
const SAL_COL = {
  name: 3, role: 4, base: 5, housing: 6, transport: 7,
  bonus: 8, deductions: 9, net: 10, firstMonth: 12
}

// Expenses sheet (💸 المصروفات) — monthly amount columns span 4..15
const EXP_COL = {
  item: 3, firstMonth: 4
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve an ExcelJS cell value to its effective primitive: formula cells expose
 * their cached `.result`, rich text is joined, hyperlinks use their text.
 */
function resolveCellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as any
    if ('result' in o) return o.result
    if ('richText' in o && Array.isArray(o.richText)) {
      return o.richText.map((r: any) => r?.text ?? '').join('')
    }
    if ('text' in o) return o.text
    if ('error' in o) return null
  }
  return v
}

function cellAt(row: ExcelJS.Row, col: number): unknown {
  return resolveCellValue(row.getCell(col).value)
}

function toNum(val: unknown): number {
  const v = resolveCellValue(val)
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function toStr(val: unknown): string {
  const v = resolveCellValue(val)
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/** Empty string → null (for nullable columns; node:sqlite rejects undefined). */
function orNull(s: string): string | null {
  return s === '' ? null : s
}

/**
 * The workbook sheets embed summary/total/tip rows (e.g. "إجمالي الرواتب",
 * "💰 إجمالي الفواتير", "💡 ..."). These are NOT real records and must be
 * skipped so they don't pollute children/employees/expenses.
 */
function isDataName(name: string): boolean {
  if (!name) return false
  const first = name.trimStart().charAt(0)
  // Leading decorative symbol/emoji (not an Arabic/Latin letter or digit)
  if (!/[؀-ۿA-Za-z0-9]/.test(first)) return false
  // Summary / total / tip keywords
  if (/إجمالي|الإجمالي|ملخّص|ملخص|صافي الربح|التارجت|نسبة التحصيل|المحصّل|المحصل/.test(name)) return false
  return true
}

// ── Year & date resolution ────────────────────────────────────────────────────

function resolveImportYear(): number {
  const envYear = parseInt(process.env.IMPORT_DEFAULT_YEAR ?? '', 10)
  if (!isNaN(envYear) && envYear > 1900 && envYear < 3000) return envYear
  return new Date().getFullYear()
}

function firstOfMonth(year: number, monthIndex: number): string {
  const mm = String(monthIndex + 1).padStart(2, '0')
  return `${year}-${mm}-01`
}

// ── Sheet classification ──────────────────────────────────────────────────────

function isIgnoredSheet(name: string): boolean {
  return (
    name.includes('داشبورد') ||
    name.includes('إعدادات') || name.includes('الإعدادات') ||
    name.includes('كشف حساب') ||
    name.includes('تخطيط') || name.includes('تارجت') ||
    name.toLowerCase().includes('dashboard') ||
    name.toLowerCase().includes('setting')
  )
}

function isChildrenSheet(name: string): boolean {
  return name.includes('بيانات الأطفال') || name.includes('الأطفال')
}

function isSalarySheet(name: string): boolean {
  return name.includes('رواتب') || name.includes('راتب') || name.includes('موظف') ||
    name.toLowerCase().includes('salary')
}

function isExpensesSheet(name: string): boolean {
  return name.includes('مصروف') || name.toLowerCase().includes('expense')
}

// Previously-ignored sheets, now imported (FR-023).
function isSettingsSheet(name: string): boolean {
  return name.includes('إعداد') || name.includes('الإعداد') || name.toLowerCase().includes('setting')
}

function isTargetSheet(name: string): boolean {
  return name.includes('تخطيط') || name.includes('تارجت') || name.toLowerCase().includes('target')
}

function isDashboardSheet(name: string): boolean {
  return name.includes('داشبورد') || name.toLowerCase().includes('dashboard')
}

function isStatementSheet(name: string): boolean {
  return name.includes('كشف حساب') || name.toLowerCase().includes('statement')
}

function monthOfSheet(name: string): number {
  return ARABIC_MONTHS.findIndex((m) => name.includes(m))
}

/**
 * Return only the rows from DATA_START_ROW onward that actually hold values.
 *
 * `sheet.rowCount` can balloon to tens of thousands when a workbook carries
 * stray formatting far below the data, which makes a `for (r <= rowCount)` loop
 * crawl over endless empty rows. `eachRow({ includeEmpty: false })` visits only
 * populated rows, so the import stays fast regardless of the sheet's formatting.
 */
function dataRows(sheet: ExcelJS.Worksheet): ExcelJS.Row[] {
  const rows: ExcelJS.Row[] = []
  sheet.eachRow({ includeEmpty: false }, (row, r) => {
    if (r >= DATA_START_ROW) rows.push(row)
  })
  return rows
}

// ── Main import ───────────────────────────────────────────────────────────────

export async function importFromWorkbook(
  filePath: string,
  onProgress?: (current: number, total: number, phase?: string) => void
): Promise<ImportSummary> {
  const db = getDb()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const year = resolveImportYear()
  const now = new Date().toISOString()

  // Progress is tracked per worksheet so the renderer can show a real bar.
  const totalSheets = Math.max(1, workbook.worksheets.length)
  let sheetsDone = 0
  const tick = (phase: string) => onProgress?.(++sheetsDone, totalSheets, phase)
  onProgress?.(0, totalSheets, 'starting')

  const summary: ImportSummary = {
    children: { imported: 0, skipped: 0 },
    payments: { imported: 0, skipped: 0 },
    employees: { imported: 0, skipped: 0 },
    salaryPayments: { imported: 0, skipped: 0 },
    expenses: { imported: 0, skipped: 0 },
    settings: { imported: 0, skipped: 0 },
    snapshots: { imported: 0, skipped: 0 },
    sheetsProcessed: [],
    sheetsIgnored: [],
    year,
    rowErrors: 0,
    rowErrorDetails: []
  }

  /** Record a swallowed row failure with its reason (logged + returned to UI). */
  function recordRowError(sheet: string, row: number, name: string, err: unknown) {
    summary.rowErrors++
    const message = err instanceof Error ? err.message : String(err)
    // Keep the payload bounded; first 50 reasons are plenty to diagnose.
    if (summary.rowErrorDetails.length < 50) {
      summary.rowErrorDetails.push({ sheet, row, name, message })
    }
    console.error(`[import] row error — sheet="${sheet}" row=${row} name="${name}": ${message}`)
  }

  // Prepared statements reused across sheets
  const findChild = db.prepare('SELECT id FROM children WHERE name = ?')
  const insertChild = db.prepare(`
    INSERT INTO children
      (name, guardian, guardian_phone, child_phone, national_id, service, unit, price,
       reg_date, notes, is_active, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
  `)
  const findPayment = db.prepare(
    'SELECT id FROM payments WHERE child_id = ? AND month = ? AND year = ? AND service = ?'
  )
  const insertPayment = db.prepare(`
    INSERT INTO payments
      (child_id, service_id, month, year, service, unit, quantity, price, total, paid, balance,
       status, notes, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
  // Each imported child must have a matching service enrollment so the
  // service filter, payment generation, and sync stay consistent.
  const insertChildService = db.prepare(`
    INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `)
  const findChildService = db.prepare(
    'SELECT id FROM child_services WHERE child_id = ? AND service = ?'
  )
  /** Ensure a (child, service) enrollment exists; return its id. Idempotent. */
  function ensureEnrollment(childId: number, service: string, unit: string, price: number): number | null {
    const row = findChildService.get(childId, service) as any
    if (row) return row.id
    const res = insertChildService.run(childId, service, unit, price, now, now)
    return Number(res.lastInsertRowid)
  }
  const findEmployee = db.prepare('SELECT id FROM employees WHERE name = ?')
  const insertEmployee = db.prepare(`
    INSERT INTO employees
      (name, role, base_salary, housing, transport, net_salary, is_active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)
  `)
  const findSalary = db.prepare(
    'SELECT id FROM salary_payments WHERE employee_id = ? AND month = ? AND year = ?'
  )
  const insertSalary = db.prepare(`
    INSERT INTO salary_payments
      (employee_id, month, year, bonus, deductions, actual_paid, paid_date, notes, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
  const insertExpense = db.prepare(`
    INSERT INTO expenses (item, month, year, amount, category, notes, created_at, synced)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, 0)
    ON CONFLICT(item, month, year) DO NOTHING
  `)
  // Settings upsert — bump updated_at and reset synced so the change propagates.
  // Device-local keys (e.g. the connection string) are never written by import.
  const SETTINGS_IMPORT_DENYLIST = new Set(['sync_mongo_uri'])
  const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value, updated_at, synced)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, synced = 0
  `)
  function setSetting(key: string, value: string | number): void {
    if (SETTINGS_IMPORT_DENYLIST.has(key)) return
    upsertSetting.run(key, String(value), now)
    summary.settings.imported++
  }
  // Service pricing lives in service_definitions (Settings → Services), not the legacy
  // settings-table keys — update the matching service definition's price in place instead.
  function setServicePrice(serviceName: string, field: 'price_monthly' | 'price_daily' | 'price_hourly', value: number): void {
    const res = db.prepare(`UPDATE service_definitions SET ${field} = ?, updated_at = ?, synced = 0 WHERE name = ?`)
      .run(value, now, serviceName)
    if (Number(res.changes) > 0) summary.settings.imported++
  }
  // Generic snapshot upsert for non-relational sheets (dashboard, statement).
  const upsertSnapshot = db.prepare(`
    INSERT INTO imported_snapshots (sheet, row_index, data_json, imported_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(sheet, row_index) DO UPDATE SET
      data_json = excluded.data_json, updated_at = excluded.updated_at, synced = 0
  `)

  /** Ensure a child row exists for `name`; return its id (creating a placeholder). */
  function ensureChild(name: string, opts: {
    service?: string; unit?: string; price?: number; regDate?: string
  } = {}): number {
    const existing = findChild.get(name) as any
    if (existing) return existing.id
    const svc = opts.service || 'حضانة'
    const unit = opts.unit || 'شهر'
    const price = opts.price ?? 0
    const res = insertChild.run(
      name, '—', '—', null, null,
      svc, unit, price,
      opts.regDate || now.slice(0, 10), null, now, now
    )
    const childId = Number(res.lastInsertRowid)
    ensureEnrollment(childId, svc, unit, price)
    summary.children.imported++
    return childId
  }

  // ── 1. Children master sheet ────────────────────────────────────────────────
  const childSheet = workbook.worksheets.find((ws) => isChildrenSheet(ws.name))
  if (childSheet) {
    summary.sheetsProcessed.push(childSheet.name)
    const importChildren = db.transaction(() => {
      for (const row of dataRows(childSheet)) {
        const r = row.number
        const name = toStr(cellAt(row, CHILD_COL.name))
        if (!isDataName(name)) continue
        if (findChild.get(name)) { summary.children.skipped++; continue }
        try {
          const svc = toStr(cellAt(row, CHILD_COL.service)) || 'حضانة'
          const unit = toStr(cellAt(row, CHILD_COL.unit)) || 'شهر'
          const price = toNum(cellAt(row, CHILD_COL.price))
          const res = insertChild.run(
            name,
            toStr(cellAt(row, CHILD_COL.guardian)) || '—',
            toStr(cellAt(row, CHILD_COL.guardianPhone)) || '—',
            orNull(toStr(cellAt(row, CHILD_COL.childPhone))),
            orNull(toStr(cellAt(row, CHILD_COL.nationalId))),
            svc,
            unit,
            price,
            toStr(cellAt(row, CHILD_COL.regDate)) || now.slice(0, 10),
            orNull(toStr(cellAt(row, CHILD_COL.notes))),
            now, now
          )
          ensureEnrollment(Number(res.lastInsertRowid), svc, unit, price)
          summary.children.imported++
        } catch (err) {
          recordRowError(childSheet.name, r, name, err)
        }
      }
    })
    importChildren()
    tick(childSheet.name)
  }

  // ── 2. Monthly payment sheets ───────────────────────────────────────────────
  for (const ws of workbook.worksheets) {
    if (isIgnoredSheet(ws.name) || isChildrenSheet(ws.name) ||
        isSalarySheet(ws.name) || isExpensesSheet(ws.name) ||
        isSettingsSheet(ws.name) || isTargetSheet(ws.name) ||
        isDashboardSheet(ws.name) || isStatementSheet(ws.name)) continue
    const monthIdx = monthOfSheet(ws.name)
    if (monthIdx < 0) continue

    summary.sheetsProcessed.push(ws.name)
    const month = ARABIC_MONTHS[monthIdx]
    const regBase = firstOfMonth(year, monthIdx)

    const importMonth = db.transaction(() => {
      for (const row of dataRows(ws)) {
        const r = row.number
        const name = toStr(cellAt(row, PAY_COL.name))
        if (!isDataName(name)) continue
        try {
          const service = toStr(cellAt(row, PAY_COL.service)) || 'حضانة'
          const unit = toStr(cellAt(row, PAY_COL.unit)) || 'شهر'
          const quantity = toNum(cellAt(row, PAY_COL.quantity)) || 1
          const price = toNum(cellAt(row, PAY_COL.price))
          const total = toNum(cellAt(row, PAY_COL.total)) || price * quantity
          const paid = toNum(cellAt(row, PAY_COL.paid))
          const balanceCell = toNum(cellAt(row, PAY_COL.balance))
          const balance = balanceCell || total - paid
          const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
          const notes = orNull(toStr(cellAt(row, PAY_COL.notes)))

          const childId = ensureChild(name, { service, unit, price, regDate: regBase })
          // Link to a (child, service) enrollment, creating it if this sheet
          // bills a service the child is not yet enrolled in (multi-service import).
          const serviceId = ensureEnrollment(childId, service, unit, price)

          if (findPayment.get(childId, month, year, service)) {
            summary.payments.skipped++
            continue
          }
          insertPayment.run(
            childId, serviceId, month, year, service, unit, quantity, price, total, paid,
            balance, status, notes, now, now
          )
          summary.payments.imported++
        } catch (err) {
          recordRowError(ws.name, r, name, err)
        }
      }
    })
    importMonth()
    tick(ws.name)
  }

  // ── 3. Employees + salary payments ──────────────────────────────────────────
  const salarySheet = workbook.worksheets.find((ws) => isSalarySheet(ws.name))
  if (salarySheet) {
    summary.sheetsProcessed.push(salarySheet.name)
    const importSalaries = db.transaction(() => {
      for (const row of dataRows(salarySheet)) {
        const r = row.number
        const name = toStr(cellAt(row, SAL_COL.name))
        if (!isDataName(name)) continue
        try {
          const role = toStr(cellAt(row, SAL_COL.role)) || 'موظف'
          const base = toNum(cellAt(row, SAL_COL.base))
          const housing = toNum(cellAt(row, SAL_COL.housing))
          const transport = toNum(cellAt(row, SAL_COL.transport))
          const bonus = toNum(cellAt(row, SAL_COL.bonus))
          const deductions = toNum(cellAt(row, SAL_COL.deductions))
          const net = toNum(cellAt(row, SAL_COL.net)) || base + housing + transport - deductions + bonus

          if (base === 0 && net === 0) continue

          let emp = findEmployee.get(name) as any
          if (!emp) {
            const res = insertEmployee.run(name, role, base, housing, transport, net, now)
            summary.employees.imported++
            emp = { id: Number(res.lastInsertRowid) }
          } else {
            summary.employees.skipped++
          }

          // One salary payment per month column that carries a value.
          for (let m = 0; m < 12; m++) {
            const actual = toNum(cellAt(row, SAL_COL.firstMonth + m))
            const paid = actual || net
            if (paid === 0) continue
            if (findSalary.get(emp.id, ARABIC_MONTHS[m], year)) {
              summary.salaryPayments.skipped++
              continue
            }
            insertSalary.run(
              emp.id, ARABIC_MONTHS[m], year, bonus, deductions, paid,
              firstOfMonth(year, m), null
            )
            summary.salaryPayments.imported++
          }
        } catch (err) {
          recordRowError(salarySheet.name, r, name, err)
        }
      }
    })
    importSalaries()
    tick(salarySheet.name)
  }

  // ── 4. Expenses ─────────────────────────────────────────────────────────────
  const expensesSheet = workbook.worksheets.find((ws) => isExpensesSheet(ws.name))
  if (expensesSheet) {
    summary.sheetsProcessed.push(expensesSheet.name)
    const importExpenses = db.transaction(() => {
      for (const row of dataRows(expensesSheet)) {
        const r = row.number
        const item = toStr(cellAt(row, EXP_COL.item))
        if (!isDataName(item)) continue
        try {
          for (let m = 0; m < 12; m++) {
            const amount = toNum(cellAt(row, EXP_COL.firstMonth + m))
            if (amount === 0) continue
            const res = insertExpense.run(item, ARABIC_MONTHS[m], year, amount, now)
            if (Number(res.changes) > 0) summary.expenses.imported++
            else summary.expenses.skipped++
          }
        } catch (err) {
          recordRowError(expensesSheet.name, r, item, err)
        }
      }
    })
    importExpenses()
    tick(expensesSheet.name)
  }

  // ── 5. Settings (⚙️ الإعدادات) ──────────────────────────────────────────────
  // Pricing/profit table: col B(2)=label, C(3)=hourly, D(4)=daily, E(5)=monthly.
  // Map the recognized rows to the setting keys the app/targets module consume.
  const settingsSheet = workbook.worksheets.find((ws) => isSettingsSheet(ws.name))
  if (settingsSheet) {
    summary.sheetsProcessed.push(settingsSheet.name)
    const importSettings = db.transaction(() => {
      settingsSheet.eachRow({ includeEmpty: false }, (row, r) => {
        try {
          const label = toStr(cellAt(row, 2))
          if (!label) return
          const hourly = toNum(cellAt(row, 3))
          const monthly = toNum(cellAt(row, 5))
          if (label.includes('حضانة')) {
            if (monthly > 0) {
              setServicePrice('حضانة', 'price_monthly', monthly)
              setSetting('nursery_monthly', monthly)
            }
          } else if (label.includes('استضافة')) {
            if (monthly > 0) {
              setServicePrice('استضافة', 'price_monthly', monthly)
              setSetting('hosting_monthly', monthly)
            }
          } else if (label.includes('جلسة')) {
            if (hourly > 0) {
              setServicePrice('جلسة', 'price_hourly', hourly)
              setSetting('session_hourly', hourly)
            }
          } else if (label.includes('نسبة الربح')) {
            if (hourly > 0) setSetting('target_profit_pct', hourly)
          }
        } catch (err) {
          recordRowError(settingsSheet.name, r, '', err)
        }
      })
    })
    importSettings()
    tick(settingsSheet.name)
  }

  // ── 6. Target Planning (🎯 تخطيط التارجت) ────────────────────────────────────
  // The targets module is derived from settings; the only durable config here is
  // the profit ratio (col E(5)=نسبة الربح on the monthly rows). Persist it as a setting.
  const targetSheet = workbook.worksheets.find((ws) => isTargetSheet(ws.name))
  if (targetSheet) {
    summary.sheetsProcessed.push(targetSheet.name)
    const importTarget = db.transaction(() => {
      for (const row of dataRows(targetSheet)) {
        const pct = toNum(cellAt(row, 5))
        if (pct > 0 && pct < 1) { setSetting('target_profit_pct', pct); break }
      }
    })
    importTarget()
    tick(targetSheet.name)
  }

  // ── 7. Dashboard & Account Statement snapshots ──────────────────────────────
  // Non-relational aggregate sheets: persist each populated row verbatim as a
  // snapshot. The live dashboard/statement views keep recomputing (spec edge case).
  const colCount = (ws: ExcelJS.Worksheet) => Math.max(1, ws.columnCount)
  function snapshotSheet(ws: ExcelJS.Worksheet): void {
    summary.sheetsProcessed.push(ws.name)
    const cols = colCount(ws)
    const run = db.transaction(() => {
      ws.eachRow({ includeEmpty: false }, (row, r) => {
        try {
          const values: unknown[] = []
          for (let c = 1; c <= cols; c++) values.push(resolveCellValue(row.getCell(c).value) ?? null)
          if (values.every((v) => v === null || v === '')) return
          upsertSnapshot.run(ws.name, r, JSON.stringify(values), now, now)
          summary.snapshots.imported++
        } catch (err) {
          recordRowError(ws.name, r, '', err)
        }
      })
    })
    run()
    tick(ws.name)
  }
  const dashboardSheet = workbook.worksheets.find((ws) => isDashboardSheet(ws.name))
  if (dashboardSheet) snapshotSheet(dashboardSheet)
  const statementSheet = workbook.worksheets.find((ws) => isStatementSheet(ws.name))
  if (statementSheet) snapshotSheet(statementSheet)

  // Record ignored sheets for the summary.
  summary.sheetsIgnored = workbook.worksheets
    .map((ws) => ws.name)
    .filter((n) => !summary.sheetsProcessed.includes(n))

  onProgress?.(totalSheets, totalSheets, 'done')
  return summary
}
