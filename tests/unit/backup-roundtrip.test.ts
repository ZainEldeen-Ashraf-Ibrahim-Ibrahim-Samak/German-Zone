import { vi, describe, it, expect, afterAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  app: { getPath: () => 'mock-user-data', isPackaged: false }
}))

import { Db } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'

const TABLES = [
  'children', 'child_services', 'payments', 'employees',
  'salary_payments', 'expenses', 'settings', 'imported_snapshots', 'tombstones'
]

function countAll(db: Db): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of TABLES) out[t] = (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c
  return out
}

const src = path.join(os.tmpdir(), `nursery-rt-${Date.now()}.db`)
const copy = `${src}.bak`

afterAll(() => {
  for (const f of [src, copy, `${src}-wal`, `${src}-shm`]) {
    try { fs.unlinkSync(f) } catch { /* ignore */ }
  }
})

describe('backup → restore round-trip (US3, SC-010)', () => {
  it('a WAL-checkpointed file copy reproduces every table identically', () => {
    const db = new Db(src)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db)

    const now = new Date().toISOString()
    // Write across tables, including the new imported_snapshots, with uncommitted
    // WAL pages that would be lost by a naive copy without a checkpoint.
    db.prepare("INSERT INTO settings (key, value, updated_at, synced) VALUES ('nursery_monthly', '3500', ?, 0)").run(now)
    db.prepare(`INSERT INTO children (name, guardian, guardian_phone, service, unit, price, reg_date, is_active, created_at, updated_at, synced)
                VALUES ('طفل', '—', '—', 'حضانة', 'شهر', 3500, ?, 1, ?, ?, 0)`).run(now.slice(0, 10), now, now)
    db.prepare(`INSERT INTO imported_snapshots (sheet, row_index, data_json, imported_at, updated_at, synced)
                VALUES ('📊 داشبورد', 1, '[1,2,3]', ?, ?, 0)`).run(now, now)

    const before = countAll(db)
    expect(before.children).toBe(1)
    expect(before.imported_snapshots).toBe(1)

    // Backup: checkpoint folds WAL into the main file, then copy.
    db.checkpoint()
    fs.copyFileSync(src, copy)
    db.close()

    // Restore: open the copied file and compare.
    const restored = new Db(copy)
    const after = countAll(restored)
    restored.close()

    expect(after).toEqual(before)
  })
})
