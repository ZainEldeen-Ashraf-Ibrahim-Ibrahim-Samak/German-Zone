import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__totalUnitHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__totalUnitHandlers[channel] = callback
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'
import { TOTAL_UNIT } from '../../src/types/index.js'

import '../../electron/ipc/studentsIPC.js'
import '../../electron/ipc/installmentsIPC.js'
import '../../electron/ipc/paymentsIPC.js'
import '../../electron/ipc/serviceDefinitionsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

/**
 * 'إجمالي' is a one-off fee for the whole course, and the only unit an instalment plan can
 * split — a recurring month/day/hour rate has no final figure to divide.
 */
describe('Total ("إجمالي") billing unit', () => {
  let db: any
  const handler = (channel: string) => (globalThis as any).__totalUnitHandlers[channel] as Function

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM payment_transactions').run()
    db.prepare('DELETE FROM payments').run()
    db.prepare('DELETE FROM student_installments').run()
    db.prepare('DELETE FROM students').run()
    db.prepare('DELETE FROM tombstones').run()
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  const addStudent = async (extra: Record<string, any> = {}) =>
    handler('students:add')(null, {
      name: 'طالب', guardian: 'ولي', guardian_phone: '01000000000', reg_date: '2026-01-10',
      services: [{ service: 'A1', unit: TOTAL_UNIT, price: 10000 }],
      ...extra,
    })

  it('adds a total price column services can be defined with', async () => {
    const columns = db.prepare('PRAGMA table_info(service_definitions)').all().map((c: any) => c.name)
    expect(columns).toContain('price_total')

    const created = await handler('serviceDefinitions:add')(null, { name: 'كورس مكثف', price_total: 15000 })
    expect(created.price_total).toBe(15000)
  })

  it('accepts a service priced only as a total', async () => {
    await expect(handler('serviceDefinitions:add')(null, { name: 'كورس صيفي', price_total: 9000 }))
      .resolves.toMatchObject({ price_total: 9000 })
  })

  it('still requires at least one price of some kind', async () => {
    await expect(handler('serviceDefinitions:add')(null, { name: 'بدون سعر' }))
      .rejects.toThrow(/سعر واحد على الأقل|At least one price/)
  })

  // ── Plans only apply to total-billed enrollments ────────────────────────────

  it('builds the plan from a total-billed enrollment', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([2500, 2500, 2500, 2500])
  })

  it('refuses a plan for a student billed only on a recurring rate', async () => {
    const student = await addStudent({ services: [{ service: 'A1', unit: 'شهر', price: 10000 }] })

    await expect(handler('installments:plan')(null, { student_id: student.id, count: 4, start_date: '2026-01-10' }))
      .rejects.toThrow(/إجمالي|billed as a total/)
  })

  it('ignores recurring enrollments when sizing a plan', async () => {
    // Only the 10,000 course fee is splittable; the 800/month subscription keeps billing monthly.
    const student = await addStudent({
      services: [
        { service: 'A1', unit: TOTAL_UNIT, price: 10000 },
        { service: 'A2', unit: 'شهر', price: 800 },
      ],
      installments_count: 4, installment_start_date: '2026-01-10',
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([2500, 2500, 2500, 2500])

    const fee = await handler('installments:enrolledFee')(null, { student_id: student.id })
    expect(fee.total).toBe(10000)
    expect(fee.services).toHaveLength(1)
    expect(fee.recurringServices).toHaveLength(1)
    expect(fee.plannable).toBe(true)
  })

  it('reports a recurring-only student as having nothing to plan', async () => {
    const student = await addStudent({ services: [{ service: 'A1', unit: 'شهر', price: 10000 }] })

    const fee = await handler('installments:enrolledFee')(null, { student_id: student.id })
    expect(fee.plannable).toBe(false)
    expect(fee.total).toBe(0)
  })

  // ── Generation ──────────────────────────────────────────────────────────────

  it('charges a total-billed enrollment once, not every month', async () => {
    const student = await addStudent()

    const january = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    expect(january.created).toBe(1)

    // February must not raise the course fee a second time.
    const february = await handler('payments:generate')(null, { month: 'فبراير', year: 2026 })
    expect(february.created).toBe(0)

    const charges = db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)
    expect(charges).toHaveLength(1)
    expect(charges[0].total).toBe(10000)
    expect(charges[0].quantity).toBe(1)
  })

  it('keeps billing a monthly enrollment every month', async () => {
    const student = await addStudent({ services: [{ service: 'A1', unit: 'شهر', price: 800 }] })

    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    await handler('payments:generate')(null, { month: 'فبراير', year: 2026 })

    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(2)
  })

  it('does not pro-rate a whole-course fee for a mid-month registration', async () => {
    // The course costs what it costs regardless of the day the student signs up.
    const student = await addStudent({ reg_date: '2026-01-20' })

    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    const charge = db.prepare('SELECT * FROM payments WHERE student_id = ?').get(student.id)
    expect(charge.total).toBe(10000)
    expect(charge.prorated_calculated).toBeNull()
  })

  it('bills a planned course fee through the plan alone', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })

    const result = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    expect(result.planSkipped).toBe(1)
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(0)
  })

  it('bills the recurring service normally while the course fee runs on a plan', async () => {
    // Registered on the 1st so the monthly charge is not pro-rated, keeping the assertion about
    // the plan rather than about mid-month arithmetic.
    const student = await addStudent({
      reg_date: '2026-01-01',
      services: [
        { service: 'A1', unit: TOTAL_UNIT, price: 10000 },
        { service: 'A2', unit: 'شهر', price: 800 },
      ],
      installments_count: 4, installment_start_date: '2026-01-01',
    })

    const result = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    // Only the course fee is on the plan. The 800/month subscription is NOT in the plan total,
    // so it must still be invoiced — suppressing it would drop the charge entirely.
    expect(result.planSkipped).toBe(1)
    const charges = db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)
    expect(charges).toHaveLength(1)
    expect(charges[0].service).toBe('A2')
    expect(charges[0].total).toBe(800)
  })

  it('keeps invoicing a recurring service when an unscoped plan is added later', async () => {
    const student = await addStudent({
      services: [
        { service: 'A1', unit: TOTAL_UNIT, price: 10000 },
        { service: 'A2', unit: 'شهر', price: 800 },
      ],
    })
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(2)

    // Retiring duplicates must take the course fee only, never the subscription's invoice.
    const planned = await handler('installments:plan')(null, {
      student_id: student.id, count: 4, start_date: '2026-01-10',
    })

    expect(planned.duplicatesRemoved).toBe(1)
    const remaining = db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].service).toBe('A2')
  })

  it('reports the total unit on the payment row it creates', async () => {
    const student = await addStudent()
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    const charge = db.prepare('SELECT * FROM payments WHERE student_id = ?').get(student.id)
    expect(charge.unit).toBe(TOTAL_UNIT)

    const listed = await handler('payments:get')(null, { month: 'يناير', year: 2026 })
    const row = listed.payments.find((p: any) => p.student_id === student.id)
    expect(row.expected_quantity).toBe(1)
    expect(row.expected_total).toBe(10000)
  })
})
