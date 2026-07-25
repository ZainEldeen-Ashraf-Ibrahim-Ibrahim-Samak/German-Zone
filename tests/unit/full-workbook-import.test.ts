import { vi, describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'

// Mock Electron so connection.ts can be imported in the test runner.
vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  app: { getPath: () => 'mock-user-data', isPackaged: false }
}))

import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { importFromWorkbook } from '../../electron/services/importService.js'

const WORKBOOK = path.join(process.cwd(), 'Nursery_V4_Final_5.xlsx')

let db: any
let summary: any

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  db = initDb()
  runMigrations(db)
  summary = await importFromWorkbook(WORKBOOK)
})

describe('full-workbook import of Nursery_V4_Final_5.xlsx (US3)', () => {
  it('the reference workbook exists', () => {
    expect(fs.existsSync(WORKBOOK)).toBe(true)
  })

  it('imports with zero row errors (SC-009)', () => {
    if (summary.rowErrors > 0) {
      // Surface the actual reasons if this ever regresses.
      console.error('rowErrorDetails:', JSON.stringify(summary.rowErrorDetails, null, 2))
    }
    expect(summary.rowErrors).toBe(0)
  })

  it('processes all four formerly-ignored sheets (none left ignored)', () => {
    const four = ['📊 داشبورد', '⚙️ الإعدادات', '📄 كشف حساب', '🎯 تخطيط التارجت']
    for (const name of four) {
      expect(summary.sheetsProcessed).toContain(name)
      expect(summary.sheetsIgnored).not.toContain(name)
    }
  })

  it('upserts the targets/pricing settings keys from ⚙️ الإعدادات and 🎯 تخطيط التارجت', () => {
    const get = (k: string) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value
    expect(Number(get('nursery_monthly'))).toBe(3500)
    expect(Number(get('hosting_monthly'))).toBe(2500)
    expect(Number(get('session_hourly'))).toBe(200)
    expect(Number(get('target_profit_pct'))).toBeCloseTo(0.2, 5)
    expect(summary.settings.imported).toBeGreaterThan(0)
  })

  it('persists dashboard and statement rows as snapshots', () => {
    const dash = db.prepare("SELECT COUNT(*) c FROM imported_snapshots WHERE sheet = '📊 داشبورد'").get().c
    const stmt = db.prepare("SELECT COUNT(*) c FROM imported_snapshots WHERE sheet = '📄 كشف حساب'").get().c
    expect(dash).toBeGreaterThan(0)
    expect(stmt).toBeGreaterThan(0)
    expect(summary.snapshots.imported).toBe(dash + stmt)
  })
})
