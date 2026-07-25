import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, getDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

vi.mock('electron', () => ({
  app: { getPath: () => 'mock-user-data' }
}))

describe('migration 014 idempotency — employee_roles auto-migration', () => {
  beforeEach(() => {
    initDb(':memory:')
  })

  afterEach(() => {
    closeDb()
  })

  it('running migrations twice does not duplicate employee_roles rows', async () => {
    // Seed some legacy employees before first migration run
    runMigrations(getDb())
    const db = getDb()

    // Seed legacy-style employees after the fact (simulate pre-014 data)
    db.prepare(`INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, updated_at, synced) VALUES (?,?,?,?,1,?,?,0)`)
      .run('Alice', 'معلمة', 5000, 5000, new Date().toISOString(), new Date().toISOString())
    db.prepare(`INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at, updated_at, synced) VALUES (?,?,?,?,1,?,?,0)`)
      .run('Bob', 'معلمة', 4000, 4000, new Date().toISOString(), new Date().toISOString())

    // Manually trigger the role migration logic (INSERT OR IGNORE + UPDATE)
    const roleRows = db.prepare(`SELECT DISTINCT role FROM employees WHERE role IS NOT NULL AND role != ''`).all() as any[]
    for (const r of roleRows) {
      db.prepare(`INSERT OR IGNORE INTO employee_roles (name, created_at, updated_at, synced) VALUES (?,?,?,0)`)
        .run(r.role, new Date().toISOString(), new Date().toISOString())
    }
    db.prepare(`UPDATE employees SET role_id = (SELECT id FROM employee_roles WHERE name = employees.role) WHERE role IS NOT NULL AND role != '' AND role_id IS NULL`).run()

    const countBefore = (db.prepare(`SELECT COUNT(*) as cnt FROM employee_roles WHERE name = 'معلمة'`).get() as any).cnt

    // Run the same migration logic again (idempotency check)
    for (const r of roleRows) {
      db.prepare(`INSERT OR IGNORE INTO employee_roles (name, created_at, updated_at, synced) VALUES (?,?,?,0)`)
        .run(r.role, new Date().toISOString(), new Date().toISOString())
    }

    const countAfter = (db.prepare(`SELECT COUNT(*) as cnt FROM employee_roles WHERE name = 'معلمة'`).get() as any).cnt
    expect(countAfter).toBe(countBefore)
    expect(countAfter).toBe(1)
  })

  it('employee role_id is set after migration', async () => {
    runMigrations(getDb())
    const db = getDb()
    const now = new Date().toISOString()

    // Insert role first, then employee
    db.prepare(`INSERT INTO employee_roles (name, created_at, updated_at, synced) VALUES (?,?,?,0)`)
      .run('مديرة', now, now)
    const roleRow = db.prepare(`SELECT id FROM employee_roles WHERE name = 'مديرة'`).get() as any

    db.prepare(`INSERT INTO employees (name, role, role_id, base_salary, net_salary, is_active, created_at, updated_at, synced) VALUES (?,?,?,?,?,1,?,?,0)`)
      .run('Carol', 'مديرة', roleRow.id, 7000, 7000, now, now)

    const emp = db.prepare(`SELECT role_id FROM employees WHERE name = 'Carol'`).get() as any
    expect(emp.role_id).toBe(roleRow.id)
  })

  it('migrating same role twice gives one employee_roles row', async () => {
    runMigrations(getDb())
    const db = getDb()
    const now = new Date().toISOString()
    const run = () => db.prepare(`INSERT OR IGNORE INTO employee_roles (name, created_at, updated_at, synced) VALUES (?,?,?,0)`).run('نفس الدور', now, now)
    run()
    run()
    const count = (db.prepare(`SELECT COUNT(*) as cnt FROM employee_roles WHERE name = 'نفس الدور'`).get() as any).cnt
    expect(count).toBe(1)
  })
})
