import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron — capture registered ipcMain handlers (feature 004, FR-015).
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {}
  ;(globalThis as any).__targetHandlers = handlers
  return {
    ipcMain: {
      handle: (channel: string, cb: Function) => {
        ;(globalThis as any).__targetHandlers[channel] = cb
      }
    },
    app: { getPath: () => 'mock-user-data' }
  }
})

import '../../electron/ipc/targetIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('target:calc Target Profit % input (feature 004)', () => {
  let db: any
  const handlers = () => (globalThis as any).__targetHandlers
  const MONTH = 'يناير'
  const YEAR = 2026

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
    db.prepare('DELETE FROM expenses').run()
    db.prepare('DELETE FROM salary_payments').run()
    // Known target profit % setting and some costs so targetRequired is non-zero.
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('target_profit_pct', '0.2')").run()
    db.prepare(
      "INSERT INTO expenses (item, month, year, amount, created_at) VALUES ('rent', ?, ?, 10000, '2026-01-01')"
    ).run(MONTH, YEAR)
  })

  const distribution = { حضانة: 10, استضافة: 5, جلسة: 20 }

  it('reproduces the settings-only result when given the same profit % (FR-015)', async () => {
    const fromSetting = await handlers()['target:calc'](null, { distribution, month: MONTH, year: YEAR })
    const fromInput = await handlers()['target:calc'](null, {
      distribution,
      month: MONTH,
      year: YEAR,
      targetProfitPct: 0.2
    })
    expect(fromInput).toEqual(fromSetting)
  })

  it('changes targetRequired when a different profit % is supplied (FR-014)', async () => {
    const base = await handlers()['target:calc'](null, { distribution, month: MONTH, year: YEAR })
    const higher = await handlers()['target:calc'](null, {
      distribution,
      month: MONTH,
      year: YEAR,
      targetProfitPct: 0.5
    })
    expect(higher.targetRequired).toBeGreaterThan(base.targetRequired)
    // Projected revenue depends only on distribution/pricing — unchanged.
    expect(higher.projectedRevenue).toBe(base.projectedRevenue)
  })
})
