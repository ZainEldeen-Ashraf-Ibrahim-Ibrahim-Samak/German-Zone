import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__mergeHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__mergeHandlers[channel] = callback
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
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

/**
 * The fee a student owes must be charged exactly once. A student on an instalment plan is
 * billed by that plan; the monthly service generation must not add the same fee a second time.
 */
describe('Instalment plan and service price are one charge, not two', () => {
  let db: any
  const handler = (channel: string) => (globalThis as any).__mergeHandlers[channel] as Function

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

  /** A1 priced at 10,000 — the case that surfaced the double charge. */
  const addStudent = async (extra: Record<string, any> = {}) =>
    handler('students:add')(null, {
      name: 'طالب', guardian: 'ولي', guardian_phone: '01000000000', reg_date: '2026-01-10',
      services: [{ service: 'A1', unit: TOTAL_UNIT, price: 10000 }],
      ...extra,
    })

  it('takes the plan amount from the enrolled service price without it being typed in', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([2500, 2500, 2500, 2500])

    const saved = db.prepare('SELECT installment_total FROM students WHERE id = ?').get(student.id)
    expect(saved.installment_total).toBe(10000)
  })

  it('sums every enrolled service when the student takes more than one', async () => {
    const student = await addStudent({
      services: [
        { service: 'A1', unit: TOTAL_UNIT, price: 10000 },
        { service: 'A2', unit: TOTAL_UNIT, price: 6000 },
      ],
      installments_count: 4, installment_start_date: '2026-01-10',
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([4000, 4000, 4000, 4000])
  })

  it('does not also generate a monthly service charge for a planned enrollment', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })

    const result = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    expect(result.planSkipped).toBe(1)
    const charges = db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)
    expect(charges).toHaveLength(0)

    // The family owes 10,000 in total — the plan — not 10,000 of plan plus 10,000 of service.
    const owed = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM student_installments WHERE student_id = ?')
      .get(student.id).s
    expect(owed).toBe(10000)
  })

  it('still generates the service charge for a student with no plan', async () => {
    const student = await addStudent()

    const result = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    expect(result.planSkipped).toBe(0)
    expect(result.created).toBeGreaterThan(0)
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id).length).toBe(1)
  })

  it('retires an already-generated duplicate charge when a plan is added afterwards', async () => {
    // The state users are already in: monthly charge generated first, plan added second.
    const student = await addStudent()
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id).length).toBe(1)

    const planned = await handler('installments:plan')(null, {
      student_id: student.id, count: 4, start_date: '2026-01-10',
    })

    expect(planned.duplicatesRemoved).toBe(1)
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(0)
    expect(planned.total).toBe(10000)
  })

  it('never deletes a charge that already has money against it', async () => {
    const student = await addStudent()
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    const charge = db.prepare('SELECT * FROM payments WHERE student_id = ?').get(student.id)
    await handler('payments:addTransaction')(null, { payment_id: charge.id, amount: 500 })

    const planned = await handler('installments:plan')(null, {
      student_id: student.id, count: 4, start_date: '2026-01-10',
    })

    // A real collection is history — it survives, and is reported as not removed.
    expect(planned.duplicatesRemoved).toBe(0)
    const surviving = db.prepare('SELECT * FROM payments WHERE id = ?').get(charge.id)
    expect(surviving).toBeTruthy()
    expect(surviving.paid).toBe(500)
  })

  it('tombstones the retired duplicate so other machines drop it too', async () => {
    const student = await addStudent()
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    const charge = db.prepare('SELECT * FROM payments WHERE student_id = ?').get(student.id)

    await handler('installments:plan')(null, { student_id: student.id, count: 4, start_date: '2026-01-10' })

    expect(db.prepare("SELECT * FROM tombstones WHERE entity = 'payments' AND record_id = ?").get(charge.id))
      .toBeTruthy()
  })

  it('re-splits over the new price when the service price changes', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })
    const enrollment = db.prepare('SELECT * FROM student_services WHERE student_id = ?').get(student.id)

    await handler('students:update')(null, {
      id: student.id,
      patch: {
        services: [{ id: enrollment.id, service: 'A1', unit: TOTAL_UNIT, price: 12000 }],
        installments_count: 4,
      },
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([3000, 3000, 3000, 3000])
  })

  it('honours an explicit custom amount over the service price', async () => {
    const student = await addStudent({
      installments_count: 4, installment_total: 8000, installment_start_date: '2026-01-10',
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.amount)).toEqual([2000, 2000, 2000, 2000])
  })

  it('resumes normal service billing once the plan is cancelled', async () => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-10' })
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(0)

    await handler('students:update')(null, { id: student.id, patch: { installments_count: null } })
    const result = await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    expect(result.planSkipped).toBe(0)
    expect(db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)).toHaveLength(1)
  })

  it('refuses a plan when the total-billed service has no price and no custom amount', async () => {
    const student = await addStudent({ services: [{ service: 'A1', unit: TOTAL_UNIT, price: 0 }] })

    await expect(handler('installments:plan')(null, { student_id: student.id, count: 4, start_date: '2026-01-10' }))
      .rejects.toThrow(/إجمالي|billed as a total/)
  })

  it('reports the fee a plan would be built from, per service', async () => {
    const student = await addStudent({
      services: [
        { service: 'A1', unit: TOTAL_UNIT, price: 10000 },
        { service: 'A2', unit: TOTAL_UNIT, price: 6000 },
      ],
    })

    const fee = await handler('installments:enrolledFee')(null, { student_id: student.id })
    expect(fee.total).toBe(16000)
    expect(fee.services.map((s: any) => s.price)).toEqual([10000, 6000])
  })

  it('still charges extra sessions on top of a plan', async () => {
    // Extra lessons are beyond the agreed fee, so they are billed separately by design.
    const student = await addStudent({
      installments_count: 4, installment_start_date: '2026-01-10',
      services: [{ service: 'A1', unit: TOTAL_UNIT, price: 10000, extra_lessons: 2, session_price: 250 }],
    })
    db.prepare('UPDATE students SET extra_lessons = 2, session_price = 250 WHERE id = ?').run(student.id)

    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    const charges = db.prepare('SELECT * FROM payments WHERE student_id = ?').all(student.id)
    expect(charges).toHaveLength(1)
    expect(charges[0].service).toBe('حصص إضافية')
    expect(charges[0].total).toBe(500)
  })
})
