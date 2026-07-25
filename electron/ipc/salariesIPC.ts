import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'
import { resnapshotPendingTeacherPayments } from './attendanceIPC.js'
import type { Employee, SalaryPayment } from '../../src/types/index.js'

const ARABIC_MONTHS: Record<string, number> = {
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'مايو': 5, 'يونيو': 6,
  'يوليو': 7, 'أغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12
}

function monthBounds(month: string, year: number | string) {
  const n = ARABIC_MONTHS[month] ?? (Number(month) || 1)
  const mm = String(n).padStart(2, '0')
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-31` }
}

/**
 * Sums this employee's attendance-based teacher_payments for a month (feature 006), excluding
 * Void rows. This is the authoritative per-session earnings source for any employee who has
 * their own `teacher_session_rate` configured — it reflects their REAL rate and REAL attendance,
* not the older session_teachers/salary_types estimate (which used a shared, role-level rate and
 * a cruder "was any child payable in this session" count).
 */
function getTeacherPaymentsForMonth(db: any, employeeId: number, start: string, end: string) {
  const row = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(session_cost), 0) as total
    FROM teacher_payments
    WHERE teacher_id = ? AND status IN ('pending','paid') AND attendance_date >= ? AND attendance_date <= ?
  `).get(employeeId, start, end) as { cnt: number; total: number }
  return { count: row.cnt, total: row.total }
}

/**
 * Computes an employee's base monthly pay for a period from their effective salary type.
 * For per-session/hybrid types this reflects how many sessions were actually payable
 * (a session is payable when a child attended or was absent without excuse). Shared by
 * salary:get and salary:update so a saved payroll row never disagrees with the live view.
 *
 * If the employee has their own `teacher_session_rate` configured (feature 006), their
 * per-session earnings come from the teacher_payments ledger instead of the salary-type
 * estimate — that ledger is what attendance actually generated, at their real rate.
 */
function computeBaseSalary(db: any, employeeId: number, month: string, year: number | string) {
  // Heal any stale Pending snapshots first — rate sources can change from several places
  // (salary type edited in Settings, per-child override in the child form) that don't know
  // about this teacher's ledger. Pending is always "current rate"; Paid is frozen.
  resnapshotPendingTeacherPayments(db, employeeId)

  const row = db.prepare(`
    SELECT e.net_salary, e.teacher_session_rate, COALESCE(e.salary_type_override_id, er.salary_type_id) as eff
    FROM employees e LEFT JOIN employee_roles er ON e.role_id = er.id WHERE e.id = ?
  `).get(employeeId) as any
  const netSalary = row?.net_salary ?? 0
  let base = netSalary
  let payableSessions = 0
  let totalSessions = 0
  let salaryTypeName: string | null = null
  let salaryTypeMode: string | null = null

  const { start, end } = monthBounds(month, year)
  const hasOwnTeacherRate = row?.teacher_session_rate != null
  const teacherPayments = hasOwnTeacherRate ? getTeacherPaymentsForMonth(db, employeeId, start, end) : null

  if (row?.eff) {
    const st = db.prepare('SELECT * FROM salary_types WHERE id = ?').get(row.eff) as any
    if (st) {
      salaryTypeName = st.name
      salaryTypeMode = st.mode

      if (st.mode === 'per_child_session' || st.mode === 'per_session_pct') {
        // Pay is driven entirely by the attendance-based teacher_payments ledger, which already
        // resolves each session to its effective rate at generation time (per-child override →
        // the salary type's own session rate, or session_pct × the child's service price for the
        // percentage mode) — see resolveTeacherSessionRate. No hardcoded per-session value anywhere.
        const tp = hasOwnTeacherRate ? teacherPayments! : getTeacherPaymentsForMonth(db, employeeId, start, end)
        payableSessions = tp.count
        totalSessions = tp.count
        base = tp.total
      } else if (hasOwnTeacherRate && (st.mode === 'per_session_fixed' || st.mode === 'hybrid')) {
        payableSessions = teacherPayments!.count
        totalSessions = teacherPayments!.count
        base = st.mode === 'hybrid' ? (st.monthly_rate ?? 0) + teacherPayments!.total : teacherPayments!.total
      } else {
        const sessionIds = (db.prepare(`
          SELECT ss.id FROM scheduled_sessions ss
          JOIN session_teachers stc ON stc.session_id = ss.id
          WHERE stc.employee_id = ? AND ss.session_date >= ? AND ss.session_date <= ?
        `).all(employeeId, start, end) as { id: number }[]).map((s) => s.id)
        totalSessions = sessionIds.length
        if (sessionIds.length > 0) {
          const ph = sessionIds.map(() => '?').join(',')
          payableSessions = (db.prepare(`
            SELECT COUNT(DISTINCT session_id) as cnt FROM attendance_records
            WHERE session_id IN (${ph}) AND status IN ('attended','absent_unexcused')
          `).get(...sessionIds) as { cnt: number }).cnt
        }
        // per_session_pct never reaches here — it is ledger-driven above (pct × child price),
        // replacing the old formula that assumed every session was worth a flat 100 EGP.
        if (st.mode === 'fixed_monthly') base = st.monthly_rate ?? netSalary
        else if (st.mode === 'per_session_fixed') base = payableSessions * (st.session_rate ?? 0)
        else if (st.mode === 'hybrid') base = (st.monthly_rate ?? 0) + payableSessions * (st.session_rate ?? 0)
      }
    }
  } else if (hasOwnTeacherRate) {
    // No salary type at all, but this employee is a per-session teacher under the
    // attendance-based system — their earnings ARE the teacher_payments total, not netSalary.
    payableSessions = teacherPayments!.count
    totalSessions = teacherPayments!.count
    base = teacherPayments!.total
  }

  return { base, payableSessions, totalSessions, salaryTypeName, salaryTypeMode }
}

// 1. employees:get (Admin only)
ipcMain.handle('employees:get', async () => {
  try {
    requireAdmin()
    const db = getDb()
    const rows = db.prepare(`
      SELECT e.*, er.name as role_name, er.salary_type_id as role_salary_type_id
      FROM employees e
      LEFT JOIN employee_roles er ON e.role_id = er.id
      ORDER BY e.name ASC
    `).all() as Employee[]
    return rows
  } catch (error: any) {
    console.error('Failed to get employees:', error)
    throw new Error(error.message || 'Failed to get employees')
  }
})

// 2. employees:add (Admin only)
ipcMain.handle('employees:add', async (_event, employeeInput) => {
  try {
    requireAdmin()
    const db = getDb()
    const { name, role_id, base_salary = 0, housing = 0, transport = 0, salary_type_override_id = null, teacher_session_rate = null } = employeeInput

    if (!name) {
      throw new Error('جميع الحقول الإلزامية مطلوبة / Missing required fields')
    }

    // resolve role text from role_id if provided
    let roleText = employeeInput.role ?? ''
    if (role_id) {
      const roleRow = db.prepare('SELECT name FROM employee_roles WHERE id = ?').get(role_id) as any
      if (!roleRow) throw new Error('الدور غير موجود / Role not found')
      roleText = roleRow.name
    }

    const netSalary = Number(base_salary) + Number(housing) + Number(transport)
    const now = new Date().toISOString()

    const result = db.prepare(`
      INSERT INTO employees (name, role, role_id, salary_type_override_id, base_salary, housing, transport, net_salary, is_active, created_at, updated_at, synced, teacher_session_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?)
    `).run(name, roleText, role_id ?? null, salary_type_override_id, Number(base_salary), Number(housing), Number(transport), netSalary, now, now, teacher_session_rate !== null ? Number(teacher_session_rate) : null)

    const createdId = Number(result.lastInsertRowid)
    const createdEmployee = db.prepare(`
      SELECT e.*, er.name as role_name FROM employees e LEFT JOIN employee_roles er ON e.role_id = er.id WHERE e.id = ?
    `).get(createdId) as Employee
    return createdEmployee
  } catch (error: any) {
    console.error('Failed to add employee:', error)
    throw new Error(error.message || 'Failed to add employee')
  }
})

// 3. employees:update (Admin only)
ipcMain.handle('employees:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!id || !patch) {
      throw new Error('Employee ID and patch are required')
    }

    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as any
    if (!emp) {
      throw new Error('الموظف غير موجود / Employee not found')
    }

    const name = patch.name !== undefined ? patch.name : emp.name
    let role = patch.role !== undefined ? patch.role : emp.role
    let role_id = patch.role_id !== undefined ? patch.role_id : emp.role_id
    const salary_type_override_id = patch.salary_type_override_id !== undefined ? patch.salary_type_override_id : emp.salary_type_override_id
    const base_salary = patch.base_salary !== undefined ? Number(patch.base_salary) : emp.base_salary
    const housing = patch.housing !== undefined ? Number(patch.housing) : emp.housing
    const transport = patch.transport !== undefined ? Number(patch.transport) : emp.transport
    const teacher_session_rate = patch.teacher_session_rate !== undefined
      ? (patch.teacher_session_rate === null ? null : Number(patch.teacher_session_rate))
      : emp.teacher_session_rate

    // Sync role text from role_id
    if (patch.role_id !== undefined && patch.role_id !== null) {
      const roleRow = db.prepare('SELECT name FROM employee_roles WHERE id = ?').get(patch.role_id) as any
      if (!roleRow) throw new Error('الدور غير موجود / Role not found')
      role = roleRow.name
      role_id = patch.role_id
    }

    const netSalary = base_salary + housing + transport

    const now = new Date().toISOString()
    db.prepare(`
      UPDATE employees
      SET name = ?, role = ?, role_id = ?, salary_type_override_id = ?, base_salary = ?, housing = ?, transport = ?, net_salary = ?, updated_at = ?, synced = 0, teacher_session_rate = ?
      WHERE id = ?
    `).run(name, role, role_id, salary_type_override_id, base_salary, housing, transport, netSalary, now, teacher_session_rate, id)

    // If anything that feeds the rate resolution changed (own per-session rate, salary type
    // override, or role), re-snapshot this teacher's still-Pending payments using the full
    // per-child resolution — NOT a blanket flat-rate update, which would clobber per-child
    // pricing. Paid/Void rows are never touched (research.md #7).
    if (
      (patch.teacher_session_rate !== undefined && teacher_session_rate !== emp.teacher_session_rate) ||
      (patch.salary_type_override_id !== undefined && salary_type_override_id !== emp.salary_type_override_id) ||
      (patch.role_id !== undefined && role_id !== emp.role_id)
    ) {
      resnapshotPendingTeacherPayments(db, id)
    }

    const updatedEmployee = db.prepare(`
      SELECT e.*, er.name as role_name FROM employees e LEFT JOIN employee_roles er ON e.role_id = er.id WHERE e.id = ?
    `).get(id) as Employee
    return updatedEmployee
  } catch (error: any) {
    console.error('Failed to update employee:', error)
    throw new Error(error.message || 'Failed to update employee')
  }
})

// 4. employees:deactivate (Admin only)
ipcMain.handle('employees:deactivate', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()

    const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(id)
    if (!emp) {
      throw new Error('الموظف غير موجود / Employee not found')
    }

    db.prepare('UPDATE employees SET is_active = 0, updated_at = ?, synced = 0 WHERE id = ?').run(new Date().toISOString(), id)
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to deactivate employee:', error)
    throw new Error(error.message || 'Failed to deactivate employee')
  }
})

// 5. salary:get (Admin only)
ipcMain.handle('salary:get', async (_event, { month, year }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!month || !year) {
      throw new Error('Month and year are required')
    }

    const rows = db.prepare(`
      SELECT
        COALESCE(s.id, -e.id) as id,
        e.id as employee_id,
        e.name as employee_name,
        e.role as employee_role,
        e.role_id,
        e.salary_type_override_id,
        e.net_salary as net_salary,
        COALESCE(s.month, ?) as month,
        COALESCE(s.year, ?) as year,
        COALESCE(s.bonus, 0) as bonus,
        COALESCE(s.deductions, 0) as deductions,
        s.actual_paid as stored_actual_paid,
        s.paid_date,
        s.paid_date as pay_date,
        s.notes,
        er.salary_type_id as role_salary_type_id,
        COALESCE(e.salary_type_override_id, er.salary_type_id) as effective_salary_type_id
      FROM employees e
      LEFT JOIN salary_payments s ON e.id = s.employee_id AND s.month = ? AND s.year = ?
      LEFT JOIN employee_roles er ON e.role_id = er.id
      WHERE e.is_active = 1 OR s.id IS NOT NULL
      ORDER BY e.name ASC
    `).all(month, year, month, year) as any[]

    // Enrich with salary type info and compute actual_paid by formula. Delegates to
    // computeBaseSalary (shared with salary:update) instead of duplicating the per-mode
    // formulas here, so this view can never disagree with what gets saved — and so the
    // feature-006 teacher_payments override (own rate wins over the salary-type estimate)
    // only has to be implemented in one place.
    return rows.map((row) => {
      const { base: computedActualPaid, payableSessions, totalSessions, salaryTypeName, salaryTypeMode } =
        computeBaseSalary(db, row.employee_id, month, year)
      row.payable_sessions = payableSessions
      row.total_sessions = totalSessions

      const bonus = row.bonus ?? 0
      // Sum itemised deductions from employee_deductions table
      const deductionSum = (db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM employee_deductions WHERE employee_id = ? AND month = ? AND year = ?'
      ).get(row.employee_id, month, Number(year)) as any)?.total ?? 0

      return {
        ...row,
        salary_type_name: salaryTypeName,
        salary_type_mode: salaryTypeMode,
        // Net Salary column reflects the salary-type-derived base for this period (per-session
        // pay included), so the columns reconcile: Net + Bonus − Deductions = Actual Paid.
        net_salary: computedActualPaid,
        deductions: deductionSum,
        actual_paid: row.stored_actual_paid ?? (computedActualPaid + bonus - deductionSum),
      } as SalaryPayment
    })
  } catch (error: any) {
    console.error('Failed to get salary payments:', error)
    throw new Error(error.message || 'Failed to get salary payments')
  }
})

// 6. salary:update (Admin only)
ipcMain.handle('salary:update', async (_event, { employee_id, month, year, bonus = 0, deductions = 0, paid_date = null, notes = null, override_amount = null }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!employee_id || !month || !year) {
      throw new Error('Employee ID, month, and year are required')
    }

    const emp = db.prepare('SELECT net_salary FROM employees WHERE id = ?').get(employee_id) as any
    if (!emp) {
      throw new Error('الموظف غير موجود / Employee not found')
    }

    // Use itemised deductions sum; fall back to the passed-in deductions param if no table entries
    const tableDeductionRow = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM employee_deductions WHERE employee_id = ? AND month = ? AND year = ?'
    ).get(employee_id, month, Number(year)) as any
    const deductionSum = tableDeductionRow?.cnt > 0 ? (tableDeductionRow?.total ?? 0) : Number(deductions)

    // Base reflects the employee's salary type (per-session pay included) for this period,
    // not just net_salary — otherwise saving a per-session teacher would store 0.
    const { base } = computeBaseSalary(db, employee_id, month, year)
    const actualPaid = override_amount !== null ? Number(override_amount) : (base + Number(bonus) - deductionSum)

    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO salary_payments (employee_id, month, year, bonus, deductions, actual_paid, paid_date, notes, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(employee_id, month, year) DO UPDATE SET
        bonus = excluded.bonus,
        deductions = excluded.deductions,
        actual_paid = excluded.actual_paid,
        paid_date = excluded.paid_date,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        synced = 0
    `).run(employee_id, month, Number(year), Number(bonus), deductionSum, actualPaid, paid_date, notes, now)

    const updatedPayment = db.prepare(`
      SELECT s.*, s.paid_date as pay_date, e.name as employee_name, e.role as employee_role
      FROM salary_payments s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.employee_id = ? AND s.month = ? AND s.year = ?
    `).get(employee_id, month, year) as SalaryPayment

    return updatedPayment
  } catch (error: any) {
    console.error('Failed to update salary payment:', error)
    throw new Error(error.message || 'Failed to update salary payment')
  }
})

// 7. salary:getExpected (Admin only) — live forecast for the Employee details panel:
// the REMAINING scheduled sessions (today onward for the month in progress; the whole month for
// past/future periods) × each child's resolved rate (child override → salary type's session rate
// in per_child_session mode → teacher rate → salary type rate), reported next to what the ledger
// says has actually been earned so far. Attendance status does not change the expected total —
// only the earned figure.
ipcMain.handle('salary:getExpected', async (_event, { employee_id, month, year }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!employee_id || !month || !year) {
      throw new Error('Employee ID, month, and year are required')
    }

    const { start } = monthBounds(month, year)
    const { base: actualToDate, salaryTypeMode } = computeBaseSalary(db, employee_id, month, year)

    const emp = db.prepare('SELECT teacher_session_rate FROM employees WHERE id = ?').get(employee_id) as any

    // Expected salary is projected from the schedule for attendance-driven pay (per-session/
    // hybrid/per-child/percentage modes, or a plain per-session teacher with no salary type at
    // all). Only fixed-monthly isn't schedule-driven.
    const projectable = salaryTypeMode === null || ['per_session_fixed', 'hybrid', 'per_child_session', 'per_session_pct'].includes(salaryTypeMode ?? '')

    // Expected total = the remaining scheduled sessions (today onward, for the month in
    // progress) × each child's resolved rate — independent of what has been attended so far, so
    // it never mixes stale ledger amounts into the forecast. "Earned so far" (the ledger) is
    // reported alongside, not added in.
    let expectedTotal = actualToDate
    if (projectable) {
      const st = db.prepare(`
        SELECT st.session_rate as session_rate, st.monthly_rate as monthly_rate, st.session_pct as session_pct
        FROM employees e
        LEFT JOIN employee_roles er ON e.role_id = er.id
        LEFT JOIN salary_types st ON st.id = COALESCE(e.salary_type_override_id, er.salary_type_id)
        WHERE e.id = ?
      `).get(employee_id) as any
      const salaryTypeSessionRate = st?.session_rate ?? null

      const assignedChildren = db.prepare(`
        SELECT lesson_days, teacher_session_rate, price FROM child_services WHERE teacher_id = ?
      `).all(employee_id) as any[]

      const startDate = new Date(start)
      const y = startDate.getFullYear()
      const m = startDate.getMonth()
      const daysInMonth = new Date(y, m + 1, 0).getDate()
      // Occurrences from today (inclusive) onward, for the month currently in progress — already-
      // elapsed days don't inflate the projected total. Past/future periods count the whole month.
      const today = new Date()
      const isCurrentMonth = m === today.getMonth() && y === today.getFullYear()
      const startDay = isCurrentMonth ? today.getDate() : 1

      let scheduleTotal = 0
      for (const row of assignedChildren) {
        let days: number[] = []
        if (row.lesson_days) {
          try { days = JSON.parse(row.lesson_days) } catch { days = [] }
        }
        if (days.length === 0) continue
        // Same order as resolveTeacherSessionRate. per_child_session: child override → the
        // salary type's own session rate (the child's service/section price is never used).
        // per_session_pct: child override → session_pct × the child's service price. Other
        // modes: override → teacher's flat rate → salary type's session rate. The teacher's
        // flat "Per Session Cost" and the enrollment's session_price are never used by these modes.
        const rate = row.teacher_session_rate
          ?? (salaryTypeMode === 'per_child_session'
            ? salaryTypeSessionRate
            : salaryTypeMode === 'per_session_pct'
              ? (row.price != null && st?.session_pct != null ? Number((row.price * st.session_pct).toFixed(2)) : null)
              : (emp?.teacher_session_rate ?? salaryTypeSessionRate))
        if (!rate) continue

        let sessionCount = 0
        for (let d = startDay; d <= daysInMonth; d++) {
          if (days.includes(new Date(y, m, d).getDay())) sessionCount++
        }
        scheduleTotal += sessionCount * rate
      }

      expectedTotal = scheduleTotal
      // Hybrid pay adds the fixed monthly component on top of per-session earnings.
      if (salaryTypeMode === 'hybrid') expectedTotal += st?.monthly_rate ?? 0
    }

    return {
      actual_to_date: actualToDate,
      projected_remaining: Number(Math.max(0, expectedTotal - actualToDate).toFixed(2)),
      expected_total: Number(expectedTotal.toFixed(2)),
      salary_type_mode: salaryTypeMode,
    }
  } catch (error: any) {
    console.error('Failed to compute expected salary:', error)
    throw new Error(error.message || 'Failed to compute expected salary')
  }
})