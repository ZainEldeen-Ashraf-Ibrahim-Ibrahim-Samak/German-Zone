import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/childrenIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('children:update with two same-named service enrollments (multiple teachers) never collides on payments UNIQUE constraint', () => {
  let db: any
  let childId: number
  let svc1Id: number
  let svc2Id: number

  const update = getHandler('children:update')

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    // Two enrollments of the SAME service name, each for a different teacher (feature 006).
    svc1Id = Number(db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at)
      VALUES (?, 'جلسة', 'جلسة', 100, ?, ?)
    `).run(childId, now, now).lastInsertRowid)
    svc2Id = Number(db.prepare(`
      INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at)
      VALUES (?, 'جلسة', 'جلسة', 150, ?, ?)
    `).run(childId, now, now).lastInsertRowid)

    // Each enrollment already has its own payment for the same month/year — this is the
    // exact scenario that used to collide when re-linking by name after a blanket delete.
    db.prepare(`
      INSERT INTO payments (child_id, service_id, month, year, service, unit, price, total, balance, status, created_at, updated_at)
      VALUES (?, ?, 'يوليو', 2026, 'جلسة', 'جلسة', 100, 100, 100, 'unpaid', ?, ?)
    `).run(childId, svc1Id, now, now)
    db.prepare(`
      INSERT INTO payments (child_id, service_id, month, year, service, unit, price, total, balance, status, created_at, updated_at)
      VALUES (?, ?, 'يوليو', 2026, 'جلسة', 'جلسة', 150, 150, 150, 'unpaid', ?, ?)
    `).run(childId, svc2Id, now, now)
  })

  it('updating the child (re-submitting both enrollments by id) does not throw a UNIQUE constraint error', async () => {
    await expect(update(null, {
      id: childId,
      patch: {
        services: [
          { id: svc1Id, service: 'جلسة', unit: 'جلسة', price: 100, teacher_id: null, lesson_days: [] },
          { id: svc2Id, service: 'جلسة', unit: 'جلسة', price: 150, teacher_id: null, lesson_days: [] },
        ]
      }
    })).resolves.toBeTruthy()
  })

  it('each payment keeps its own distinct service_id after the update', () => {
    const p1 = db.prepare('SELECT service_id FROM payments WHERE child_id = ? AND price = 100').get(childId) as any
    const p2 = db.prepare('SELECT service_id FROM payments WHERE child_id = ? AND price = 150').get(childId) as any
    expect(p1.service_id).toBe(svc1Id)
    expect(p2.service_id).toBe(svc2Id)
    expect(p1.service_id).not.toBe(p2.service_id)
  })

  it('a genuinely new (id-less) enrollment is still inserted correctly alongside the existing two', async () => {
    const result = await update(null, {
      id: childId,
      patch: {
        services: [
          { id: svc1Id, service: 'جلسة', unit: 'جلسة', price: 100, teacher_id: null, lesson_days: [] },
          { id: svc2Id, service: 'جلسة', unit: 'جلسة', price: 150, teacher_id: null, lesson_days: [] },
          { service: 'جلسة', unit: 'جلسة', price: 200, teacher_id: null, lesson_days: [] },
        ]
      }
    })
    expect(result.services.length).toBe(3)
  })
})
