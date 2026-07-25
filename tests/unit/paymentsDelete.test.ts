import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/paymentsIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('payments:deleteBulk / payments:deleteAll — admin-only bulk deletion', () => {
  let db: any
  let childId: number
  let p1: number, p2: number, p3: number

  const deleteBulk = getHandler('payments:deleteBulk')
  const deleteAll = getHandler('payments:deleteAll')

  beforeAll(() => {
    db = initDb()
    runMigrations(db)

    const now = new Date().toISOString()
    childId = Number(db.prepare(`
      INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
      VALUES ('Sami', 'Guardian', '0100', 'جلسة', 'جلسة', 100, '2026-01-01', ?, ?)
    `).run(now, now).lastInsertRowid)

    const insertPayment = (month: string, price: number) => Number(db.prepare(`
      INSERT INTO payments (child_id, month, year, service, unit, price, total, balance, status, created_at, updated_at)
      VALUES (?, ?, 2026, 'جلسة', 'جلسة', ?, ?, ?, 'unpaid', ?, ?)
    `).run(childId, month, price, price, price, now, now).lastInsertRowid)
    p1 = insertPayment('يوليو', 100)
    p2 = insertPayment('يوليو', 150)
    p3 = insertPayment('أغسطس', 200)

    // Installment transaction on p1 — must be cleaned up alongside its payment.
    db.prepare(`
      INSERT INTO payment_transactions (payment_id, amount, created_at, updated_at)
      VALUES (?, 50, ?, ?)
    `).run(p1, now, now)
  })

  it('rejects non-admins', async () => {
    setCurrentUser({ id: 2, username: 'staff', role: 'employee', is_active: 1 })
    await expect(deleteBulk(null, { ids: [p1] })).rejects.toThrow('FORBIDDEN')
    await expect(deleteAll(null, { month: 'يوليو', year: 2026 })).rejects.toThrow('FORBIDDEN')
  })

  it('deletes selected payments and their installment transactions', async () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    const result = await deleteBulk(null, { ids: [p1] })
    expect(result.deleted).toBe(1)
    expect(db.prepare('SELECT * FROM payments WHERE id = ?').get(p1)).toBeUndefined()
    expect(db.prepare('SELECT * FROM payment_transactions WHERE payment_id = ?').get(p1)).toBeUndefined()
    // p2 and p3 untouched
    expect(db.prepare('SELECT * FROM payments WHERE id = ?').get(p2)).toBeDefined()
    expect(db.prepare('SELECT * FROM payments WHERE id = ?').get(p3)).toBeDefined()
  })

  it('deletes all payments for the given month/year only', async () => {
    const result = await deleteAll(null, { month: 'يوليو', year: 2026 })
    expect(result.deleted).toBe(1) // only p2 remained in July
    expect(db.prepare('SELECT * FROM payments WHERE id = ?').get(p2)).toBeUndefined()
    // August payment untouched
    expect(db.prepare('SELECT * FROM payments WHERE id = ?').get(p3)).toBeDefined()
  })

  it('deleteBulk with empty ids is a no-op', async () => {
    const result = await deleteBulk(null, { ids: [] })
    expect(result).toEqual({ ok: true, deleted: 0 })
  })
})
