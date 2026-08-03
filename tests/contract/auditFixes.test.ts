import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__fixHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__fixHandlers[channel] = callback
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
import '../../electron/ipc/branchesIPC.js'
import '../../electron/ipc/hallsIPC.js'
import '../../electron/ipc/dashboardIPC.js'
import '../../electron/ipc/transactionsIPC.js'
import '../../electron/ipc/targetIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Audit fixes', () => {
  let db: any
  const handler = (c: string) => (globalThis as any).__fixHandlers[c] as Function
  let MAIN = 0
  let ONLINE = 0

  const admin = () => setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
    MAIN = (db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get() as any).id
    ONLINE = (db.prepare("SELECT id FROM branches WHERE code = 'ONLINE'").get() as any).id
  })

  beforeEach(() => {
    db.prepare('DELETE FROM student_installment_transactions').run()
    db.prepare('DELETE FROM student_installments').run()
    db.prepare('DELETE FROM payment_transactions').run()
    db.prepare('DELETE FROM payments').run()
    db.prepare('DELETE FROM students').run()
    db.prepare('DELETE FROM halls').run()
    db.prepare('DELETE FROM user_branches').run()
    db.prepare('DELETE FROM expenses').run()
    db.prepare('DELETE FROM tombstones').run()
    admin()
  })

  const addStudent = async (extra: Record<string, any> = {}) =>
    handler('students:add')(null, {
      name: 'طالب', guardian: 'ولي', guardian_phone: '01000000000', reg_date: '2026-01-01',
      branch_id: MAIN,
      services: [{ service: 'A1', unit: TOTAL_UNIT, price: 10000 }],
      ...extra,
    })

  const plannedStudentWhoPaid = async (amount = 2500) => {
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-01' })
    const first = db.prepare('SELECT * FROM student_installments WHERE student_id = ? AND seq = 1').get(student.id)
    await handler('installments:pay')(null, { id: first.id, amount, paid_date: '2026-01-15' })
    return { student, first }
  }

  // ── CRITICAL: instalment money reaches every financial report ───────────────

  it('counts instalment charges and collections in the dashboard', async () => {
    await plannedStudentWhoPaid(2500)

    const dash = await handler('dashboard:get')(null, { month: 'يناير', year: 2026 })

    expect(dash.kpis.invoiced).toBe(2500)   // the instalment due in January
    expect(dash.kpis.collected).toBe(2500)  // and the money actually taken
  })

  it('shows an instalment collection on the transactions view', async () => {
    const { student } = await plannedStudentWhoPaid(2500)

    const rows = await handler('transactions:list')(null, { range: 'month', date: '2026-01-15' })

    const mine = rows.filter((r: any) => r.student_id === student.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].amount).toBe(2500)
    expect(mine[0].type).toBe('payment')
  })

  it('counts instalment collections toward the target', async () => {
    await plannedStudentWhoPaid(2500)

    const result = await handler('target:get')(null, { year: 2026 })
    const january = result.rows.find((r: any) => r.month === 'يناير')

    expect(january.collected).toBe(2500)
    expect(result.annualCollected).toBe(2500)
  })

  it('puts instalments on the student statement', async () => {
    const { student } = await plannedStudentWhoPaid(2500)

    const statement = await handler('students:statement')(null, { studentId: student.id })

    expect(statement.summary.totalInvoiced).toBe(10000)
    expect(statement.summary.totalCollected).toBe(2500)
    expect(statement.summary.totalBalance).toBe(7500)
    // Future instalments are not dropped just because they fall after today.
    const instalmentRows = statement.rows.filter((r: any) => String(r.notes).startsWith('دفعة'))
    expect(instalmentRows).toHaveLength(4)
    expect(instalmentRows.reduce((s: number, r: any) => s + r.total, 0)).toBe(10000)
  })

  it('breaks instalment collections down by payment method', async () => {
    const method = db.prepare('SELECT id, name FROM payment_methods LIMIT 1').get() as any
    const student = await addStudent({ installments_count: 4, installment_start_date: '2026-01-01' })
    const first = db.prepare('SELECT * FROM student_installments WHERE student_id = ? AND seq = 1').get(student.id)
    await handler('installments:pay')(null, { id: first.id, amount: 2500, payment_method_id: method.id, paid_date: '2026-01-15' })

    const dash = await handler('dashboard:get')(null, { month: 'يناير', year: 2026 })
    const row = dash.collectedByMethod.find((m: any) => m.method === method.name)

    expect(row?.total).toBe(2500)
  })

  // ── Instalment collections are an auditable ledger ──────────────────────────

  it('records who collected an instalment, and can reverse it', async () => {
    const { first } = await plannedStudentWhoPaid(1000)

    const history = await handler('installments:listTransactions')(null, { installment_id: first.id })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ amount: 1000, recorded_by: 1 })

    await handler('installments:deleteTransaction')(null, { id: history[0].id })

    const after = db.prepare('SELECT * FROM student_installments WHERE id = ?').get(first.id)
    expect(after.paid).toBe(0)
    expect(after.balance).toBe(after.amount)
    expect(after.status).toBe('unpaid')
  })

  it('carries collection history across a re-plan instead of destroying it', async () => {
    const { student } = await plannedStudentWhoPaid(2500)

    await handler('installments:plan')(null, { student_id: student.id, count: 2, start_date: '2026-01-01' })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows).toHaveLength(2)
    expect(rows[0].paid).toBe(2500)

    // The money is still backed by a real collection row, not an orphaned number.
    const history = await handler('installments:listTransactions')(null, { installment_id: rows[0].id })
    expect(history).toHaveLength(1)
    expect(history[0].amount).toBe(2500)
  })

  it('splits a carried collection across instalments when the new ones are smaller', async () => {
    // Two instalments of 5,000; the family pays 5,000 then 1,000 → 6,000 collected in total.
    const student = await addStudent({ installments_count: 2, installment_start_date: '2026-01-01' })
    const [one, two] = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    await handler('installments:pay')(null, { id: one.id, amount: 5000, paid_date: '2026-01-15' })
    await handler('installments:pay')(null, { id: two.id, amount: 1000, paid_date: '2026-02-15' })

    // Re-split into 4 × 2,500 → fills #1 and #2 (2,500 each) and part of #3.
    await handler('installments:plan')(null, { student_id: student.id, count: 4, start_date: '2026-01-01' })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows.map((r: any) => r.paid)).toEqual([2500, 2500, 1000, 0])
    const totalPaid = rows.reduce((s: number, r: any) => s + r.paid, 0)
    expect(totalPaid).toBe(6000)
  })

  // ── Branch scope is enforced in the backend ────────────────────────────────

  const scopedEmployee = (branchId: number) => {
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role, is_active) VALUES (99, 'emp99', 'x', 'employee', 1)").run()
    db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id, created_at, updated_at, synced) VALUES (99, ?, ?, ?, 0)')
      .run(branchId, '2026-01-01', '2026-01-01')
    setCurrentUser({ id: 99, username: 'emp99', role: 'employee', is_active: 1 })
  }

  it('hides other branches from a scoped user even with no filter supplied', async () => {
    await addStudent({ name: 'طالب المقر', branch_id: MAIN })
    await addStudent({ name: 'طالب أونلاين', branch_id: ONLINE })

    scopedEmployee(ONLINE)
    const seen = await handler('students:get')(null, {})

    expect(seen.map((s: any) => s.name)).toEqual(['طالب أونلاين'])
  })

  it('scopes the payments list the same way', async () => {
    await addStudent({ name: 'A', branch_id: MAIN, services: [{ service: 'A1', unit: 'شهر', price: 100 }] })
    await addStudent({ name: 'B', branch_id: ONLINE, services: [{ service: 'A1', unit: 'شهر', price: 100 }] })
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    scopedEmployee(ONLINE)
    const res = await handler('payments:get')(null, { month: 'يناير', year: 2026 })

    expect(res.payments.map((p: any) => p.student_name)).toEqual(['B'])
  })

  it('scopes instalments and their year strip', async () => {
    await addStudent({ name: 'A', branch_id: MAIN, installments_count: 2, installment_start_date: '2026-01-01' })
    await addStudent({ name: 'B', branch_id: ONLINE, installments_count: 2, installment_start_date: '2026-01-01' })

    scopedEmployee(ONLINE)
    const list = await handler('installments:list')(null, { year: 2026 })
    const calendar = await handler('installments:calendar')(null, { year: 2026 })

    expect(new Set(list.installments.map((i: any) => i.student_name))).toEqual(new Set(['B']))
    expect(calendar.find((m: any) => m.month === 'يناير').count).toBe(1)
  })

  it('scopes halls', async () => {
    await handler('halls:add')(null, { name: 'قاعة المقر', branch_id: MAIN, slots: [] })
    await handler('halls:add')(null, { name: 'قاعة أونلاين', branch_id: ONLINE, slots: [] })

    scopedEmployee(ONLINE)
    const halls = await handler('halls:list')(null, {})

    expect(halls.map((h: any) => h.name)).toEqual(['قاعة أونلاين'])
  })

  it('refuses to enroll a student into a branch the user does not cover', async () => {
    scopedEmployee(ONLINE)
    await expect(addStudent({ branch_id: MAIN })).rejects.toThrow(/لا تملك صلاحية|do not have access/)
  })

  it('leaves users with no branch assignment unrestricted, so upgrades do not lock anyone out', async () => {
    await addStudent({ name: 'طالب المقر', branch_id: MAIN })
    await addStudent({ name: 'طالب أونلاين', branch_id: ONLINE })

    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role, is_active) VALUES (98, 'legacy', 'x', 'employee', 1)").run()
    setCurrentUser({ id: 98, username: 'legacy', role: 'employee', is_active: 1 })

    expect(await handler('students:get')(null, {})).toHaveLength(2)
  })

  // ── Branchless students stay visible ───────────────────────────────────────

  it('keeps a student with no branch visible when a branch is selected', async () => {
    await addStudent({ name: 'بدون فرع', branch_id: null })

    const filtered = await handler('students:get')(null, { branch_id: MAIN })

    expect(filtered.map((s: any) => s.name)).toContain('بدون فرع')
  })

  it('keeps a branchless student on the payments list too', async () => {
    await addStudent({ name: 'بدون فرع', branch_id: null, services: [{ service: 'A1', unit: 'شهر', price: 100 }] })
    await handler('payments:generate')(null, { month: 'يناير', year: 2026 })

    const res = await handler('payments:get')(null, { month: 'يناير', year: 2026, branch_id: MAIN })

    expect(res.payments.map((p: any) => p.student_name)).toContain('بدون فرع')
  })

  // ── Branch manager has real privileges ─────────────────────────────────────

  const branchManager = (branchId: number) => {
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role, is_active) VALUES (97, 'mgr', 'x', 'branch_manager', 1)").run()
    db.prepare("UPDATE users SET role = 'branch_manager' WHERE id = 97").run()
    db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id, created_at, updated_at, synced) VALUES (97, ?, ?, ?, 0)')
      .run(branchId, '2026-01-01', '2026-01-01')
    setCurrentUser({ id: 97, username: 'mgr', role: 'branch_manager' as any, is_active: 1 })
  }

  it('lets a branch manager edit students and manage halls in their branch', async () => {
    const student = await addStudent({ branch_id: MAIN })
    branchManager(MAIN)

    await expect(handler('students:update')(null, { id: student.id, patch: { name: 'معدّل' } })).resolves.toBeTruthy()
    await expect(handler('halls:add')(null, { name: 'قاعة المدير', branch_id: MAIN, slots: [] })).resolves.toBeTruthy()
  })

  it('stops a branch manager acting on a branch they do not cover', async () => {
    const student = await addStudent({ branch_id: ONLINE })
    branchManager(MAIN)

    await expect(handler('students:update')(null, { id: student.id, patch: { name: 'x' } }))
      .rejects.toThrow(/لا تملك صلاحية|do not have access/)
  })

  it('keeps destructive and global actions away from a branch manager', async () => {
    const student = await addStudent({ branch_id: MAIN })
    await handler('students:deactivate')(null, { id: student.id })
    branchManager(MAIN)

    // Hard delete wipes payments and history — admin only.
    await expect(handler('students:delete')(null, { id: student.id })).rejects.toThrow(/FORBIDDEN/)
    // The branch list itself is global configuration.
    await expect(handler('branches:add')(null, { name: 'فرع جديد' })).rejects.toThrow(/FORBIDDEN/)
  })

  it('still blocks a plain employee from management actions', async () => {
    const student = await addStudent({ branch_id: MAIN })
    scopedEmployee(MAIN)

    await expect(handler('students:update')(null, { id: student.id, patch: { name: 'x' } }))
      .rejects.toThrow(/FORBIDDEN/)
  })
})
