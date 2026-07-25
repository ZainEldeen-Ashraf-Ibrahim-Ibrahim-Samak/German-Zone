import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__dashHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, cb: Function) => {
        ;(globalThis as any).__dashHandlers[channel] = cb
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/dashboardIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

// ── helpers ────────────────────────────────────────────────────────────────
function insertChild(db: any, overrides: Record<string, any> = {}) {
  const res = db.prepare(`
    INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, is_active)
    VALUES (?, ?, '01000000000', 'حضانة', 'شهر', ?, '2026-01-01', '2026-06-01', '2026-06-01', 1)
  `).run(
    overrides.name ?? 'طفل',
    overrides.guardian ?? 'ولي',
    overrides.price ?? 3000
  )
  return Number(res.lastInsertRowid)
}

function insertService(db: any, childId: number, price = 3000) {
  const res = db.prepare(`
    INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at)
    VALUES (?, 'حضانة', 'شهر', ?, '2026-06-01', '2026-06-01')
  `).run(childId, price)
  return Number(res.lastInsertRowid)
}

function insertPayment(db: any, childId: number, svcId: number, opts: any) {
  db.prepare(`
    INSERT INTO payments (child_id, service_id, month, year, service, unit, quantity, price, total, paid, balance, status, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, 'حضانة', 'شهر', 1, ?, ?, ?, ?, ?, '2026-06-01', '2026-06-01', 0)
  `).run(childId, svcId, opts.month, opts.year, opts.price, opts.total, opts.paid, opts.balance, opts.status)
}

// ── tests ──────────────────────────────────────────────────────────────────
describe('dashboard:get IPC contract', () => {
  let db: any
  const h = () => (globalThis as any).__dashHandlers['dashboard:get']

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM payments').run()
    db.prepare('DELETE FROM child_services').run()
    db.prepare('DELETE FROM children').run()
    db.prepare('DELETE FROM expenses').run()
    db.prepare('DELETE FROM salary_payments').run()
    db.prepare('DELETE FROM employees').run()
    setCurrentUser(null)
  })

  const admin = () => setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  const employee = () => setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })

  it('blocks anonymous access', async () => {
    await expect(h()(null, { month: 'يونيو', year: 2026 })).rejects.toThrow('UNAUTHORIZED')
  })

  it('allows employee access', async () => {
    employee()
    const result = await h()(null, { month: 'يونيو', year: 2026 })
    expect(result.kpis).toBeDefined()
  })

  it('requires month and year', async () => {
    admin()
    await expect(h()(null, {})).rejects.toThrow()
  })

  it('returns zeroed KPIs when no data exists for month', async () => {
    admin()
    const result = await h()(null, { month: 'يناير', year: 2099 })
    expect(result.kpis.invoiced).toBe(0)
    expect(result.kpis.collected).toBe(0)
    expect(result.kpis.arrears).toBe(0)
    expect(result.kpis.netProfit).toBe(0)
  })

  it('aggregates payment KPIs correctly', async () => {
    admin()
    const cid = insertChild(db, { price: 3000 })
    const sid = insertService(db, cid, 3000)
    insertPayment(db, cid, sid, { month: 'يونيو', year: 2026, price: 3000, total: 3000, paid: 1500, balance: 1500, status: 'partial' })

    const result = await h()(null, { month: 'يونيو', year: 2026 })
    expect(result.kpis.invoiced).toBe(3000)
    expect(result.kpis.collected).toBe(1500)
    expect(result.kpis.arrears).toBe(1500)
    expect(result.kpis.collectionRate).toBe(0.5)
  })

  it('computes netProfit subtracting expenses and salaries', async () => {
    admin()
    const cid = insertChild(db, { price: 3000 })
    const sid = insertService(db, cid, 3000)
    insertPayment(db, cid, sid, { month: 'مارس', year: 2026, price: 3000, total: 3000, paid: 3000, balance: 0, status: 'paid' })

    db.prepare(`INSERT INTO expenses (item, month, year, amount, created_at) VALUES ('إيجار', 'مارس', 2026, 500, '2026-06-01')`).run()

    const empId = Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, updated_at, synced)
      VALUES ('موظف', 'معلم', 1000, 1000, 1, '2026-06-01', '2026-06-01', 0)
    `).run().lastInsertRowid)
    db.prepare(`
      INSERT INTO salary_payments (employee_id, month, year, bonus, deductions, actual_paid, updated_at, synced)
      VALUES (?, 'مارس', 2026, 0, 0, 1000, '2026-06-01', 0)
    `).run(empId)

    const result = await h()(null, { month: 'مارس', year: 2026 })
    expect(result.kpis.netProfit).toBe(1500)   // 3000 − 500 − 1000
    expect(result.kpis.expensesTotal).toBe(500)
    expect(result.kpis.salariesTotal).toBe(1000)
  })

  it('returns 12-month summary array with one entry per month', async () => {
    admin()
    const result = await h()(null, { month: 'يونيو', year: 2026 })
    expect(result.summary12Month).toHaveLength(12)
    expect(result.summary12Month[0].month).toBe('يناير')
    expect(result.summary12Month[11].month).toBe('ديسمبر')
  })

  it('returns revenueByService array with 3 services', async () => {
    admin()
    const result = await h()(null, { month: 'يونيو', year: 2026 })
    expect(result.revenueByService).toHaveLength(3)
    const services = result.revenueByService.map((r: any) => r.service)
    expect(services).toContain('حضانة')
    expect(services).toContain('استضافة')
    expect(services).toContain('جلسة')
  })

  it('breaks down collected amounts by payment method', async () => {
    admin()
    const addPaid = (paid: number, method: string | null) => {
      const cid = insertChild(db, { name: `طفل ${method ?? 'بدون'} ${paid}`, price: 3000 })
      const sid = insertService(db, cid, 3000)
      db.prepare(`
        INSERT INTO payments (child_id, service_id, month, year, service, unit, quantity, price, total, paid, balance, status, payment_method_name, created_at, updated_at, synced)
        VALUES (?, ?, 'يونيو', 2026, 'حضانة', 'شهر', 1, 3000, 3000, ?, ?, 'paid', ?, '2026-06-01', '2026-06-01', 0)
      `).run(cid, sid, paid, 3000 - paid, method)
    }
    addPaid(1000, 'كاش')
    addPaid(500, 'كاش')
    addPaid(2000, 'فودافون كاش')
    addPaid(300, null) // unspecified method

    const result = await h()(null, { month: 'يونيو', year: 2026 })
    const byMethod: { method: string; total: number }[] = result.collectedByMethod
    const cash = byMethod.find((m) => m.method === 'كاش')
    const vodafone = byMethod.find((m) => m.method === 'فودافون كاش')
    const unspecified = byMethod.find((m) => m.method === 'غير محدد')
    expect(cash?.total).toBe(1500)
    expect(vodafone?.total).toBe(2000)
    expect(unspecified?.total).toBe(300)
    // sorted descending by total
    expect(byMethod[0].total).toBeGreaterThanOrEqual(byMethod[byMethod.length - 1].total)
  })

  it('emits an arrears alert when arrears > 0', async () => {
    admin()
    const cid = insertChild(db, { price: 2000 })
    const sid = insertService(db, cid, 2000)
    insertPayment(db, cid, sid, { month: 'أبريل', year: 2026, price: 2000, total: 2000, paid: 0, balance: 2000, status: 'unpaid' })

    const result = await h()(null, { month: 'أبريل', year: 2026 })
    const dangerAlert = result.alerts.find((a: any) => a.type === 'danger')
    expect(dangerAlert).toBeDefined()
  })

  it('emits a low-collection-rate info alert when rate < 80%', async () => {
    admin()
    const cid = insertChild(db, { price: 5000 })
    const sid = insertService(db, cid, 5000)
    insertPayment(db, cid, sid, { month: 'مايو', year: 2026, price: 5000, total: 5000, paid: 1000, balance: 4000, status: 'partial' })

    const result = await h()(null, { month: 'مايو', year: 2026 })
    const infoAlert = result.alerts.find((a: any) => a.type === 'info')
    expect(infoAlert).toBeDefined()
  })

  it('target.status is "missed" when gap > 0', async () => {
    admin()
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('target_profit_pct', '0.2')").run()

    const cid = insertChild(db, { price: 3000 })
    const sid = insertService(db, cid, 3000)
    insertPayment(db, cid, sid, { month: 'فبراير', year: 2026, price: 3000, total: 3000, paid: 500, balance: 2500, status: 'partial' })
    db.prepare(`INSERT INTO expenses (item, month, year, amount, created_at) VALUES ('إيجار', 'فبراير', 2026, 10000, '2026-06-01')`).run()

    const result = await h()(null, { month: 'فبراير', year: 2026 })
    expect(result.target.gap).toBeGreaterThan(0)
    expect(result.target.status).toBe('missed')
  })
})
