import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron modules
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__childrenHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__childrenHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

// Import files to register handlers and manipulate session
import '../../electron/ipc/childrenIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Children IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__childrenHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    // Clear children table before each test
    db.prepare('DELETE FROM children').run()
    setCurrentUser(null)
  })

  const adminSession = () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  }

  const employeeSession = () => {
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
  }

  it('should allow anyone to read children list', async () => {
    const getHandler = getHandlers()['children:get']
    expect(getHandler).toBeDefined()

    // Add a child directly to DB
    const insertChild = db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, is_active)
      VALUES ('طفل 1', 'ولي الأمر 1', '01000000000', 'حضانة', 'شهر', 2500, '2026-06-01', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z', 1)
    `).run()
    db.prepare(`INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      insertChild.lastInsertRowid, 'حضانة', 'شهر', 2500, '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z'
    )

    // Read as anonymous
    await expect(getHandler(null, {})).rejects.toThrow('UNAUTHORIZED')

    // Read as employee
    employeeSession()
    let list = await getHandler(null, {})
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('طفل 1')

    // Read as admin
    adminSession()
    list = await getHandler(null, {})
    expect(list.length).toBe(1)
  })

  it('should allow employees to add children (feature 004, FR-012)', async () => {
    const addHandler = getHandlers()['children:add']
    expect(addHandler).toBeDefined()

    employeeSession()
    const created = await addHandler(null, {
      name: 'طفل جديد',
      guardian: 'ولي أمر',
      guardian_phone: '01000000000',
      service: 'جلسة',
      unit: 'جلسة',
      price: 120,
      reg_date: '2026-06-06'
    })
    expect(created.id).toBeDefined()
    expect(created.name).toBe('طفل جديد')
  })

  it('should allow admins to add children and apply dates/defaults', async () => {
    const addHandler = getHandlers()['children:add']
    
    adminSession()
    const childInput = {
      name: 'أحمد علي',
      guardian: 'علي أحمد',
      guardian_phone: '01111111111',
      service: 'حضانة' as any,
      unit: 'شهر' as any,
      price: 2500,
      reg_date: '2026-06-06',
      notes: 'لا توجد ملاحظات'
    }

    const created = await addHandler(null, childInput)
    expect(created.id).toBeDefined()
    expect(created.name).toBe('أحمد علي')
    expect(created.is_active).toBe(1)
    expect(created.created_at).toBeDefined()
    expect(created.updated_at).toBeDefined()
    expect(created.synced).toBe(0)
  })

  it('should support search and status filters in children:get', async () => {
    const getHandler = getHandlers()['children:get']
    
    // Seed test children
    // Seed test children
    const child1 = db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, is_active)
      VALUES ('محمد مصطفى', 'مصطفى', '0101', 'حضانة', 'شهر', 2500, '2026-06-01', '2026-06-06', '2026-06-06', 1)
    `).run()
    db.prepare(`INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      child1.lastInsertRowid, 'حضانة', 'شهر', 2500, '2026-06-06', '2026-06-06'
    )

    const child2 = db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at, is_active)
      VALUES ('كريم أحمد', 'أحمد', '0102', 'جلسة', 'جلسة', 100, '2026-06-01', '2026-06-06', '2026-06-06', 0)
    `).run()
    db.prepare(`INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      child2.lastInsertRowid, 'جلسة', 'جلسة', 100, '2026-06-06', '2026-06-06'
    )

    employeeSession()

    // 1. Search text filter
    let res = await getHandler(null, { search: 'محمد' })
    expect(res.length).toBe(1)
    expect(res[0].name).toBe('محمد مصطفى')

    // 2. Active filter (activeOnly defaults to true or custom)
    res = await getHandler(null, { activeOnly: false })
    expect(res.length).toBe(2)

    res = await getHandler(null, { activeOnly: true })
    expect(res.length).toBe(1)
    expect(res[0].name).toBe('محمد مصطفى')

    // 3. Service filter
    res = await getHandler(null, { service: 'جلسة', activeOnly: false })
    expect(res.length).toBe(1)
    expect(res[0].name).toBe('كريم أحمد')
  })
})
