import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__gzHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__gzHandlers[channel] = callback
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/studentsIPC.js'
import '../../electron/ipc/installmentsIPC.js'
import '../../electron/ipc/branchesIPC.js'
import '../../electron/ipc/hallsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Branches / Halls / Instalments IPC contract', () => {
  let db: any
  const handler = (channel: string) => (globalThis as any).__gzHandlers[channel] as Function

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM student_installments').run()
    db.prepare('DELETE FROM hall_time_slots').run()
    db.prepare('DELETE FROM halls').run()
    db.prepare('DELETE FROM students').run()
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  const addStudent = async (extra: Record<string, any> = {}) =>
    handler('students:add')(null, {
      name: 'طالب اختبار',
      guardian: 'ولي الأمر',
      guardian_phone: '01000000000',
      reg_date: '2026-01-10',
      services: [{ service: 'A1', unit: 'شهر', price: 1000 }],
      ...extra,
    })

  // ── Schema ──────────────────────────────────────────────────────────────────

  it('creates the branches, halls and instalment tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      .map((r: any) => r.name)
    expect(tables).toEqual(expect.arrayContaining([
      'branches', 'user_branches', 'halls', 'hall_time_slots', 'student_installments',
    ]))
  })

  it('seeds a main branch and an online branch', () => {
    const kinds = db.prepare('SELECT kind FROM branches ORDER BY kind').all().map((r: any) => r.kind)
    expect(kinds).toEqual(expect.arrayContaining(['online', 'physical']))
  })

  // ── Instalments ─────────────────────────────────────────────────────────────

  it('spreads a plan across months at enrollment instead of one lump of arrears', async () => {
    const student = await addStudent({
      installments_count: 4,
      installment_total: 4000,
      installment_start_date: '2026-01-10',
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq')
      .all(student.id)

    expect(rows).toHaveLength(4)
    expect(rows.map((r: any) => r.month)).toEqual(['يناير', 'فبراير', 'مارس', 'أبريل'])
    expect(rows.map((r: any) => r.amount)).toEqual([1000, 1000, 1000, 1000])
    expect(rows.every((r: any) => r.status === 'unpaid' && r.balance === r.amount)).toBe(true)
  })

  it('lists only the instalment due in the requested month', async () => {
    const student = await addStudent({
      installments_count: 3, installment_total: 3000, installment_start_date: '2026-01-10',
    })

    const february = await handler('installments:list')(null, { year: 2026, month: 'فبراير' })
    expect(february.installments).toHaveLength(1)
    expect(february.installments[0].student_id).toBe(student.id)
    expect(february.summary.total).toBe(1000)
    expect(february.summary.outstanding).toBe(1000)
  })

  it('reports a full twelve-month calendar with each month carrying only its own due amount', async () => {
    await addStudent({
      installments_count: 3, installment_total: 3000, installment_start_date: '2026-01-10',
    })

    const calendar = await handler('installments:calendar')(null, { year: 2026 })
    expect(calendar).toHaveLength(12)
    expect(calendar.map((m: any) => m.due).slice(0, 4)).toEqual([1000, 1000, 1000, 0])
  })

  it('records a collection and moves the instalment to partial then paid', async () => {
    const student = await addStudent({
      installments_count: 2, installment_total: 2000, installment_start_date: '2026-01-10',
    })
    const first = db.prepare('SELECT * FROM student_installments WHERE student_id = ? AND seq = 1').get(student.id)

    const partial = await handler('installments:pay')(null, { id: first.id, amount: 400 })
    expect(partial.status).toBe('partial')
    expect(partial.balance).toBe(600)

    const settled = await handler('installments:pay')(null, { id: first.id, amount: 600 })
    expect(settled.status).toBe('paid')
    expect(settled.balance).toBe(0)
  })

  it('refuses a collection larger than the instalment balance', async () => {
    const student = await addStudent({
      installments_count: 2, installment_total: 2000, installment_start_date: '2026-01-10',
    })
    const first = db.prepare('SELECT * FROM student_installments WHERE student_id = ? AND seq = 1').get(student.id)

    await expect(handler('installments:pay')(null, { id: first.id, amount: 1500 }))
      .rejects.toThrow(/أكبر من قيمة الدفعة|exceeds the instalment balance/)
  })

  it('preserves collected amounts when the plan is re-planned', async () => {
    const student = await addStudent({
      installments_count: 2, installment_total: 2000, installment_start_date: '2026-01-10',
    })
    const first = db.prepare('SELECT * FROM student_installments WHERE student_id = ? AND seq = 1').get(student.id)
    await handler('installments:pay')(null, { id: first.id, amount: 1000 })

    await handler('installments:plan')(null, {
      student_id: student.id, count: 4, total: 4000, start_date: '2026-01-10',
    })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ? ORDER BY seq').all(student.id)
    expect(rows).toHaveLength(4)
    // The 1000 already collected is re-applied oldest-first, not silently lost.
    expect(rows[0].paid).toBe(1000)
    expect(rows[0].status).toBe('paid')
    expect(rows[1].paid).toBe(0)
  })

  it('clears the plan when the instalment count is set to null', async () => {
    const student = await addStudent({
      installments_count: 3, installment_total: 3000, installment_start_date: '2026-01-10',
    })

    await handler('students:update')(null, { id: student.id, patch: { installments_count: null } })

    const rows = db.prepare('SELECT * FROM student_installments WHERE student_id = ?').all(student.id)
    expect(rows).toHaveLength(0)
    const row = db.prepare('SELECT installments_count FROM students WHERE id = ?').get(student.id)
    expect(row.installments_count).toBeNull()
  })

  it('adds a student with no plan at all', async () => {
    const student = await addStudent()
    expect(db.prepare('SELECT * FROM student_installments WHERE student_id = ?').all(student.id)).toHaveLength(0)
  })

  // ── Branches ────────────────────────────────────────────────────────────────

  it('scopes the students list to the selected branch', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    const online = db.prepare("SELECT id FROM branches WHERE code = 'ONLINE'").get()

    await addStudent({ name: 'طالب المقر', branch_id: main.id })
    await addStudent({ name: 'طالب أونلاين', branch_id: online.id })

    const atMain = await handler('students:get')(null, { branch_id: main.id })
    expect(atMain.map((s: any) => s.name)).toEqual(['طالب المقر'])

    const everywhere = await handler('students:get')(null, {})
    expect(everywhere).toHaveLength(2)
  })

  it('assigns a user to a single branch, to online, or to a mix', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    const online = db.prepare("SELECT id FROM branches WHERE code = 'ONLINE'").get()

    const single = await handler('branches:assignUser')(null, { user_id: 1, mode: 'branch', branch_ids: [main.id] })
    expect(single.branches.map((b: any) => b.id)).toEqual([main.id])

    // 'online' with no explicit list resolves to the online branches on its own.
    const onlineOnly = await handler('branches:assignUser')(null, { user_id: 1, mode: 'online' })
    expect(onlineOnly.branches.map((b: any) => b.id)).toEqual([online.id])

    const mixed = await handler('branches:assignUser')(null, {
      user_id: 1, mode: 'mixed', branch_ids: [main.id, online.id], primary_branch_id: online.id,
    })
    expect(mixed.branches).toHaveLength(2)
    expect(db.prepare('SELECT branch_mode, primary_branch_id FROM users WHERE id = 1').get())
      .toMatchObject({ branch_mode: 'mixed', primary_branch_id: online.id })
  })

  it('refuses single-branch mode with more than one branch', async () => {
    const branchIds = db.prepare('SELECT id FROM branches').all().map((r: any) => r.id)
    await expect(handler('branches:assignUser')(null, { user_id: 1, mode: 'branch', branch_ids: branchIds }))
      .rejects.toThrow(/فرع واحد|one branch only/)
  })

  it('refuses to delete a branch that still has students', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    await addStudent({ branch_id: main.id })

    await expect(handler('branches:delete')(null, { id: main.id }))
      .rejects.toThrow(/انقلهم أولاً|reassign them first/)
  })

  it('grants the manager coverage of the branch they manage', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    await handler('branches:setManager')(null, { branch_id: main.id, user_id: 1 })

    const covered = db.prepare('SELECT * FROM user_branches WHERE user_id = 1 AND branch_id = ?').get(main.id)
    expect(covered).toBeTruthy()
  })

  // ── Halls ───────────────────────────────────────────────────────────────────

  it('stores several opening intervals on the same weekday', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()

    const hall = await handler('halls:add')(null, {
      name: 'قاعة 11',
      branch_id: main.id,
      capacity: 20,
      slots: [
        { day_of_week: 1, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 1, start_time: '20:00', end_time: '24:00' },
      ],
    })

    expect(hall.slots).toHaveLength(2)
    expect(hall.slots.map((s: any) => `${s.start_time}-${s.end_time}`))
      .toEqual(['13:00-18:00', '20:00-24:00'])

    const listed = await handler('halls:list')(null, {})
    expect(listed[0].total_hours).toBe(9) // 5 hours + 4 hours
  })

  it('rejects overlapping intervals when creating a hall', async () => {
    await expect(handler('halls:add')(null, {
      name: 'قاعة متداخلة',
      slots: [
        { day_of_week: 2, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 2, start_time: '15:00', end_time: '19:00' },
      ],
    })).rejects.toThrow(/متداخلة|Overlapping/)
  })

  it('replaces the whole timetable on update', async () => {
    const hall = await handler('halls:add')(null, {
      name: 'قاعة 2',
      slots: [{ day_of_week: 1, start_time: '13:00', end_time: '18:00' }],
    })

    const updated = await handler('halls:update')(null, {
      id: hall.id,
      patch: { slots: [{ day_of_week: 3, start_time: '09:00', end_time: '12:00' }] },
    })

    expect(updated.slots).toHaveLength(1)
    expect(updated.slots[0]).toMatchObject({ day_of_week: 3, start_time: '09:00', end_time: '12:00' })
  })

  it('leaves the timetable untouched when update omits slots', async () => {
    const hall = await handler('halls:add')(null, {
      name: 'قاعة 3',
      slots: [{ day_of_week: 1, start_time: '13:00', end_time: '18:00' }],
    })

    const updated = await handler('halls:update')(null, { id: hall.id, patch: { capacity: 30 } })
    expect(updated.capacity).toBe(30)
    expect(updated.slots).toHaveLength(1)
  })

  it('buckets the timetable by weekday, all seven days present', async () => {
    await handler('halls:add')(null, {
      name: 'قاعة 4',
      slots: [
        { day_of_week: 1, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 1, start_time: '20:00', end_time: '24:00' },
        { day_of_week: 4, start_time: '10:00', end_time: '12:00' },
      ],
    })

    const week = await handler('halls:timetable')(null, {})
    expect(week).toHaveLength(7)
    expect(week[1].slots).toHaveLength(2)
    expect(week[4].slots).toHaveLength(1)
    expect(week[0].slots).toHaveLength(0)
  })

  it('deletes a hall together with its timetable', async () => {
    const hall = await handler('halls:add')(null, {
      name: 'قاعة 5',
      slots: [{ day_of_week: 1, start_time: '13:00', end_time: '18:00' }],
    })

    await handler('halls:delete')(null, { id: hall.id })
    expect(db.prepare('SELECT * FROM hall_time_slots WHERE hall_id = ?').all(hall.id)).toHaveLength(0)
  })

  it('refuses a duplicate hall name within the same branch', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    await handler('halls:add')(null, { name: 'قاعة مكررة', branch_id: main.id, slots: [] })

    await expect(handler('halls:add')(null, { name: 'قاعة مكررة', branch_id: main.id, slots: [] }))
      .rejects.toThrow(/موجود بالفعل|already exists/)
  })

  it('requires admin rights to create a hall', async () => {
    setCurrentUser({ id: 2, username: 'emp', role: 'employee', is_active: 1 })
    await expect(handler('halls:add')(null, { name: 'قاعة موظف', slots: [] }))
      .rejects.toThrow(/FORBIDDEN/)
  })
})
