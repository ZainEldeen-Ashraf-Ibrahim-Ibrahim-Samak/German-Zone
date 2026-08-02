import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__syncNewHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__syncNewHandlers[channel] = callback
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'
import { SYNC_ENTITIES } from '../../electron/services/mongoSync.js'
import { DELETABLE_ENTITIES, applyCloudTombstones } from '../../electron/services/tombstones.js'

import '../../electron/ipc/studentsIPC.js'
import '../../electron/ipc/installmentsIPC.js'
import '../../electron/ipc/branchesIPC.js'
import '../../electron/ipc/hallsIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

const NEW_TABLES = ['student_installments', 'branches', 'user_branches', 'halls', 'hall_time_slots']

describe('MongoDB sync coverage for branches / halls / instalments', () => {
  let db: any
  const handler = (channel: string) => (globalThis as any).__syncNewHandlers[channel] as Function

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM tombstones').run()
    db.prepare('DELETE FROM student_installments').run()
    db.prepare('DELETE FROM hall_time_slots').run()
    db.prepare('DELETE FROM halls').run()
    db.prepare('DELETE FROM students').run()
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  // ── Registration ────────────────────────────────────────────────────────────

  it('registers every new table in SYNC_ENTITIES', () => {
    const registered = SYNC_ENTITIES.map((e) => e.table)
    for (const table of NEW_TABLES) expect(registered).toContain(table)
  })

  it('gives every new table the columns the sync engine requires', () => {
    // `synced` drives the push query; `updated_at` drives conflict resolution and is written
    // into every cloud document, so a table missing it breaks the pull's INSERT.
    for (const table of NEW_TABLES) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c: any) => c.name)
      expect(columns, `${table} must have synced`).toContain('synced')
      expect(columns, `${table} must have updated_at`).toContain('updated_at')
      expect(columns, `${table} must have an id`).toContain('id')
    }
  })

  it('orders entities so a table is never pulled before the tables it references', () => {
    const position = (table: string) => SYNC_ENTITIES.findIndex((e) => e.table === table)
    // students/employees carry branch_id, and branches.manager_user_id points back at users.
    expect(position('users')).toBeLessThan(position('branches'))
    expect(position('branches')).toBeLessThan(position('students'))
    expect(position('branches')).toBeLessThan(position('employees'))
    expect(position('branches')).toBeLessThan(position('halls'))
    expect(position('branches')).toBeLessThan(position('user_branches'))
    expect(position('users')).toBeLessThan(position('user_branches'))
    expect(position('halls')).toBeLessThan(position('hall_time_slots'))
    expect(position('students')).toBeLessThan(position('student_installments'))
  })

  it('exposes every model field that exists as a local column', () => {
    // A column missing from the Mongoose schema is silently dropped on push, so the value
    // would never reach another machine.
    for (const entity of SYNC_ENTITIES.filter((e) => NEW_TABLES.includes(e.table))) {
      const columns = db.prepare(`PRAGMA table_info(${entity.table})`).all().map((c: any) => c.name)
      const modelled = Object.keys(entity.model.schema.paths)
      for (const column of columns) {
        expect(modelled, `${entity.table}.${column} is missing from its Mongoose schema`).toContain(column)
      }
    }
  })

  it('carries the new columns on the existing students / users / employees schemas', () => {
    const fieldsOf = (table: string) =>
      Object.keys(SYNC_ENTITIES.find((e) => e.table === table)!.model.schema.paths)

    expect(fieldsOf('students')).toEqual(expect.arrayContaining([
      'branch_id', 'installments_count', 'installment_total', 'installment_start_date',
    ]))
    expect(fieldsOf('users')).toEqual(expect.arrayContaining(['branch_mode', 'primary_branch_id']))
    expect(fieldsOf('employees')).toEqual(expect.arrayContaining(['branch_id']))
  })

  // ── Push eligibility ────────────────────────────────────────────────────────

  it('marks newly written rows unsynced so the next push picks them up', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    const student = await handler('students:add')(null, {
      name: 'طالب', guardian: 'ولي', guardian_phone: '01000000000', reg_date: '2026-01-10',
      branch_id: main.id,
      services: [{ service: 'A1', unit: 'شهر', price: 1000 }],
      installments_count: 2, installment_total: 2000, installment_start_date: '2026-01-10',
    })
    await handler('halls:add')(null, {
      name: 'قاعة 11', branch_id: main.id,
      slots: [{ day_of_week: 1, start_time: '13:00', end_time: '18:00' }],
    })
    await handler('branches:assignUser')(null, { user_id: 1, mode: 'branch', branch_ids: [main.id] })

    for (const table of ['student_installments', 'halls', 'hall_time_slots', 'user_branches']) {
      const pending = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE synced = 0`).get()
      expect(pending.c, `${table} should have unsynced rows waiting to push`).toBeGreaterThan(0)
    }
    expect(db.prepare('SELECT synced FROM students WHERE id = ?').get(student.id).synced).toBe(0)
  })

  // ── Delete propagation ──────────────────────────────────────────────────────

  it('allows cloud tombstones to delete from every new table', () => {
    for (const table of NEW_TABLES) expect(DELETABLE_ENTITIES).toContain(table)
  })

  it('tombstones instalments torn down by a re-plan, so a pull cannot resurrect them', async () => {
    const student = await handler('students:add')(null, {
      name: 'طالب', guardian: 'ولي', guardian_phone: '01000000000', reg_date: '2026-01-10',
      services: [{ service: 'A1', unit: 'شهر', price: 1000 }],
      installments_count: 2, installment_total: 2000, installment_start_date: '2026-01-10',
    })
    const originalIds = db.prepare('SELECT id FROM student_installments WHERE student_id = ?')
      .all(student.id).map((r: any) => r.id)

    await handler('installments:plan')(null, {
      student_id: student.id, count: 4, total: 4000, start_date: '2026-01-10',
    })

    const tombstoned = db.prepare("SELECT record_id FROM tombstones WHERE entity = 'student_installments'")
      .all().map((r: any) => r.record_id)
    expect(tombstoned).toEqual(expect.arrayContaining(originalIds))
    expect(db.prepare("SELECT COUNT(*) AS c FROM tombstones WHERE entity = 'student_installments' AND synced = 0").get().c)
      .toBeGreaterThan(0)
  })

  it('tombstones replaced hall slots when a timetable is rewritten', async () => {
    const hall = await handler('halls:add')(null, {
      name: 'قاعة 11',
      slots: [{ day_of_week: 1, start_time: '13:00', end_time: '18:00' }],
    })
    const originalSlotId = hall.slots[0].id

    await handler('halls:update')(null, {
      id: hall.id,
      patch: { slots: [{ day_of_week: 1, start_time: '20:00', end_time: '24:00' }] },
    })

    const tombstoned = db.prepare("SELECT record_id FROM tombstones WHERE entity = 'hall_time_slots'")
      .all().map((r: any) => r.record_id)
    expect(tombstoned).toContain(originalSlotId)
  })

  it('tombstones a deleted hall and its cascaded slots', async () => {
    const hall = await handler('halls:add')(null, {
      name: 'قاعة 12',
      slots: [{ day_of_week: 2, start_time: '09:00', end_time: '12:00' }],
    })
    const slotId = hall.slots[0].id

    await handler('halls:delete')(null, { id: hall.id })

    expect(db.prepare("SELECT * FROM tombstones WHERE entity = 'halls' AND record_id = ?").get(hall.id)).toBeTruthy()
    expect(db.prepare("SELECT * FROM tombstones WHERE entity = 'hall_time_slots' AND record_id = ?").get(slotId)).toBeTruthy()
  })

  it('tombstones branch coverage rows dropped by a reassignment', async () => {
    const main = db.prepare("SELECT id FROM branches WHERE code = 'MAIN'").get()
    const online = db.prepare("SELECT id FROM branches WHERE code = 'ONLINE'").get()

    await handler('branches:assignUser')(null, { user_id: 1, mode: 'branch', branch_ids: [main.id] })
    const firstIds = db.prepare('SELECT id FROM user_branches WHERE user_id = 1').all().map((r: any) => r.id)

    await handler('branches:assignUser')(null, { user_id: 1, mode: 'online', branch_ids: [online.id] })

    const tombstoned = db.prepare("SELECT record_id FROM tombstones WHERE entity = 'user_branches'")
      .all().map((r: any) => r.record_id)
    expect(tombstoned).toEqual(expect.arrayContaining(firstIds))
  })

  it('applies an incoming cloud tombstone by deleting the local row', async () => {
    const hall = await handler('halls:add')(null, { name: 'قاعة 13', slots: [] })

    applyCloudTombstones(db, [{ entity: 'halls', record_id: hall.id }])

    expect(db.prepare('SELECT * FROM halls WHERE id = ?').get(hall.id)).toBeUndefined()
    // Recorded as already-synced so it isn't pushed back out as a fresh delete.
    expect(db.prepare("SELECT synced FROM tombstones WHERE entity = 'halls' AND record_id = ?").get(hall.id).synced).toBe(1)
  })

  it('ignores a cloud tombstone naming a table that is not deletable', () => {
    // Guards the SQL-injection surface: only whitelisted names ever reach a DELETE.
    expect(() => applyCloudTombstones(db, [{ entity: 'sqlite_master; DROP TABLE halls', record_id: 1 }]))
      .not.toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'halls'").get()).toBeTruthy()
  })
})
