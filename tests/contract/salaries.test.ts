import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron modules
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__salariesHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__salariesHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

import '../../electron/ipc/salariesIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Salaries IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__salariesHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    // Clear payroll + anything that FK-references employees, in dependency order
    db.prepare('DELETE FROM salary_payments').run()
    db.prepare('DELETE FROM attendance_records').run()
    db.prepare('DELETE FROM session_teachers').run()
    db.prepare('DELETE FROM scheduled_sessions').run()
    db.prepare('DELETE FROM children').run()
    db.prepare('DELETE FROM employees').run()
    setCurrentUser(null)
  })

  const adminSession = () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  }

  const employeeSession = () => {
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
  }

  describe('Employee Management Channels', () => {
    it('should block employees from employees:get', async () => {
      const getHandler = getHandlers()['employees:get']
      expect(getHandler).toBeDefined()

      employeeSession()
      await expect(getHandler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admins to manage employees and calculate net salary', async () => {
      const getHandler = getHandlers()['employees:get']
      const addHandler = getHandlers()['employees:add']
      const updateHandler = getHandlers()['employees:update']
      const deactivateHandler = getHandlers()['employees:deactivate']

      adminSession()

      // Add employee
      const emp = await addHandler(null, {
        name: 'أحمد محمود',
        role: 'أخصائي تخاطب',
        base_salary: 4000,
        housing: 500,
        transport: 300
      })

      expect(emp.id).toBeDefined()
      expect(emp.name).toBe('أحمد محمود')
      expect(emp.net_salary).toBe(4800) // 4000 + 500 + 300
      expect(emp.is_active).toBe(1)

      // List employees
      const list = await getHandler(null)
      expect(list.length).toBe(1)

      // Update employee
      const updated = await updateHandler(null, {
        id: emp.id,
        patch: {
          base_salary: 4500,
          transport: 400
        }
      })
      expect(updated.net_salary).toBe(5400) // 4500 + 500 + 400

      // Deactivate employee
      const dec = await deactivateHandler(null, { id: emp.id })
      expect(dec.ok).toBe(true)

      const activeCheck = db.prepare('SELECT is_active FROM employees WHERE id = ?').get(emp.id)
      expect(activeCheck.is_active).toBe(0)
    })
  })

  describe('Salary Payment Channels', () => {
    it('should block employees from salary:get and salary:update', async () => {
      const getHandler = getHandlers()['salary:get']
      const updateHandler = getHandlers()['salary:update']

      employeeSession()
      await expect(getHandler(null, { month: 'يناير', year: 2026 })).rejects.toThrow('FORBIDDEN')
      await expect(updateHandler(null, { employee_id: 1, month: 'يناير', year: 2026, bonus: 100, deductions: 50 })).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admins to update salary payments and compute actual paid', async () => {
      const getHandler = getHandlers()['salary:get']
      const updateHandler = getHandlers()['salary:update']
      const addHandler = getHandlers()['employees:add']

      adminSession()

      const emp = await addHandler(null, {
        name: 'فاطمة علي',
        role: 'معلمة حضانة',
        base_salary: 3000,
        housing: 200,
        transport: 100
      })

      // Update payroll for January 2026
      const pay = await updateHandler(null, {
        employee_id: emp.id,
        month: 'يناير',
        year: 2026,
        bonus: 300,
        deductions: 100,
        notes: 'مكافأة تميز وخصم تأخير'
      })

      expect(pay.employee_id).toBe(emp.id)
      expect(pay.month).toBe('يناير')
      expect(pay.year).toBe(2026)
      expect(pay.bonus).toBe(300)
      expect(pay.deductions).toBe(100)
      expect(pay.actual_paid).toBe(3500) // Net 3300 + 300 - 100
      expect(pay.pay_date).toBeNull()

      // List payroll
      const payrollList = await getHandler(null, { month: 'يناير', year: 2026 })
      expect(payrollList.length).toBe(1)
      expect(payrollList[0].employee_name).toBe('فاطمة علي')
      expect(payrollList[0].actual_paid).toBe(3500)
    })

    it('computes per-session salary from session attendance', async () => {
      adminSession()
      const now = new Date().toISOString()
      const st = db.prepare(
        "INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at) VALUES ('PS150','per_session_fixed',150,?,?)"
      ).run(now, now)
      const stId = Number(st.lastInsertRowid)

      const emp = await getHandlers()['employees:add'](null, {
        name: 'PerSession Teacher', role: 'teacher', base_salary: 0, salary_type_override_id: stId
      })

      const sres = db.prepare(
        "INSERT INTO scheduled_sessions (session_date, created_at, updated_at, synced) VALUES ('2026-01-10', ?, ?, 0)"
      ).run(now, now)
      const sid = Number(sres.lastInsertRowid)
      const child = db.prepare(
        "INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, teacher_id, is_active, created_at, updated_at) VALUES ('K','G','0','s','u',0,?,?,1,?,?)"
      ).run(now, emp.id, now, now)
      const cid = Number(child.lastInsertRowid)
      db.prepare(
        "INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?,?, 'attended', ?, ?)"
      ).run(sid, cid, now, now)
      db.prepare('INSERT INTO session_teachers (session_id, employee_id, synced) VALUES (?, ?, 0)').run(sid, emp.id)

      const rows = await getHandlers()['salary:get'](null, { month: 'يناير', year: 2026 })
      const row = rows.find((r: any) => r.employee_id === emp.id)
      expect(row).toBeTruthy()
      expect(row.payable_sessions).toBe(1)
      expect(row.actual_paid).toBe(150)
      // Net Salary column also reflects the per-session base for the period
      expect(row.net_salary).toBe(150)
    })

    it('salary:update stores per-session pay, not net_salary (no stale 0)', async () => {
      adminSession()
      const now = new Date().toISOString()
      const st = db.prepare(
        "INSERT INTO salary_types (name, mode, session_rate, created_at, updated_at) VALUES ('PS200','per_session_fixed',200,?,?)"
      ).run(now, now)
      const emp = await getHandlers()['employees:add'](null, {
        name: 'Saved PerSession', role: 'teacher', base_salary: 0, salary_type_override_id: Number(st.lastInsertRowid)
      })
      const sres = db.prepare(
        "INSERT INTO scheduled_sessions (session_date, created_at, updated_at, synced) VALUES ('2026-02-05', ?, ?, 0)"
      ).run(now, now)
      const sid = Number(sres.lastInsertRowid)
      const child = db.prepare(
        "INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, teacher_id, is_active, created_at, updated_at) VALUES ('K2','G','0','s','u',0,?,?,1,?,?)"
      ).run(now, emp.id, now, now)
      db.prepare("INSERT INTO attendance_records (session_id, child_id, status, recorded_at, updated_at) VALUES (?,?, 'attended', ?, ?)")
        .run(sid, Number(child.lastInsertRowid), now, now)
      db.prepare('INSERT INTO session_teachers (session_id, employee_id, synced) VALUES (?, ?, 0)').run(sid, emp.id)

      // Saving payroll must persist the per-session amount (200), not net_salary (0)
      const pay = await getHandlers()['salary:update'](null, { employee_id: emp.id, month: 'فبراير', year: 2026 })
      expect(pay.actual_paid).toBe(200)

      // And reading it back still shows 200 (stored value is correct, not a stale 0)
      const rows = await getHandlers()['salary:get'](null, { month: 'فبراير', year: 2026 })
      expect(rows.find((r: any) => r.employee_id === emp.id).actual_paid).toBe(200)
    })
  })
})
