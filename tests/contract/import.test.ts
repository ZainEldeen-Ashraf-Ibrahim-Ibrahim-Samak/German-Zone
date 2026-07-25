import { vi, describe, it, expect, beforeAll } from 'vitest'

// Mock Electron so connection.ts / env.ts can be imported in the test runner.
vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  app: { getPath: () => 'mock-user-data', isPackaged: false }
}))

import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { importFromWorkbook } from '../../electron/services/importService.js'
import { writeSampleWorkbook } from '../fixtures/makeWorkbook.js'

let db: any
let fixturePath: string

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.IMPORT_DEFAULT_YEAR = '2025'
  db = initDb()
  runMigrations(db)
  fixturePath = await writeSampleWorkbook()
})

describe('importFromWorkbook — contract', () => {
  it('imports children, payments, employees, salaries and expenses (US1)', async () => {
    const summary = await importFromWorkbook(fixturePath)

    // Year resolved from IMPORT_DEFAULT_YEAR
    expect(summary.year).toBe(2025)

    // Children: 3 from the master sheet, with real guardian/phone/unit
    expect(summary.children.imported).toBe(3)
    const ahmed = db.prepare('SELECT * FROM children WHERE name = ?').get('أحمد محمد')
    expect(ahmed.guardian).toBe('ولي أمر 1')
    expect(ahmed.guardian_phone).toBe('01000000001')
    expect(ahmed.unit).toBe('شهر')
    expect(ahmed.price).toBe(3500)

    // Payments: يناير (3) + فبراير (2) = 5; the blank-name row is skipped
    expect(summary.payments.imported).toBe(5)
    const janAhmed = db.prepare(
      'SELECT * FROM payments WHERE child_id = ? AND month = ? AND year = ?'
    ).get(ahmed.id, 'يناير', 2025)
    expect(janAhmed.status).toBe('paid')       // recomputed: paid >= total
    expect(janAhmed.total).toBe(3500)

    const fatima = db.prepare('SELECT id FROM children WHERE name = ?').get('فاطمة علي')
    const janFatima = db.prepare(
      'SELECT status, balance FROM payments WHERE child_id = ? AND month = ?'
    ).get(fatima.id, 'يناير')
    expect(janFatima.status).toBe('partial')   // paid 1000 of 3500
    expect(janFatima.balance).toBe(2500)

    // Employees: 2, with net salary
    expect(summary.employees.imported).toBe(2)
    const mgr = db.prepare('SELECT * FROM employees WHERE name = ?').get('مدير')
    expect(mgr.net_salary).toBe(6800)
    expect(mgr.role).toBe('المدير')

    // Salary payments: 12 months × 2 employees = 24
    expect(summary.salaryPayments.imported).toBe(24)

    // Expenses: 2 items × 12 months = 24
    expect(summary.expenses.imported).toBe(24)

    // Sheets classification — the dashboard sheet is now imported as a snapshot
    // (no longer ignored) per the full-workbook import scope.
    expect(summary.sheetsProcessed).toContain('📊 داشبورد')
    expect(summary.sheetsProcessed).toContain('👶 بيانات الأطفال')
  })

  it('is idempotent and resilient on re-import (US1)', async () => {
    const before = {
      children: db.prepare('SELECT COUNT(*) c FROM children').get().c,
      payments: db.prepare('SELECT COUNT(*) c FROM payments').get().c,
      salaries: db.prepare('SELECT COUNT(*) c FROM salary_payments').get().c,
      expenses: db.prepare('SELECT COUNT(*) c FROM expenses').get().c,
    }

    const summary = await importFromWorkbook(fixturePath)

    // Nothing new on the second pass
    expect(summary.children.imported).toBe(0)
    expect(summary.payments.imported).toBe(0)
    expect(summary.salaryPayments.imported).toBe(0)
    expect(summary.expenses.imported).toBe(0)

    // Previously-present rows reported as skipped
    expect(summary.payments.skipped).toBe(5)

    // Row counts unchanged
    expect(db.prepare('SELECT COUNT(*) c FROM children').get().c).toBe(before.children)
    expect(db.prepare('SELECT COUNT(*) c FROM payments').get().c).toBe(before.payments)
    expect(db.prepare('SELECT COUNT(*) c FROM salary_payments').get().c).toBe(before.salaries)
    expect(db.prepare('SELECT COUNT(*) c FROM expenses').get().c).toBe(before.expenses)

    // Blank-name row never created a child and never threw
    expect(summary.rowErrors).toBe(0)
  })
})
