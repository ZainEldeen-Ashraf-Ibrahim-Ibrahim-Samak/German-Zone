import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn()
  }
}))

import { initDb } from '../../electron/db/connection.js'
import { applyCloudTombstones } from '../../electron/services/tombstones.js'

describe('Tombstone Reconciliation', () => {
  let db: any

  beforeEach(() => {
    db = initDb()
    // Setup tables needed for test
    db.exec(`
      CREATE TABLE IF NOT EXISTS children (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS tombstones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        UNIQUE(entity, record_id)
      );
    `)
  })

  it('deletes the local row when a cloud tombstone is applied', () => {
    // Insert a local child
    const insert = db.prepare('INSERT INTO children (name) VALUES (?)').run('Test Child')
    const childId = insert.lastInsertRowid

    // Apply cloud tombstone for this child
    const cloudTombstones = [
      { entity: 'children', record_id: childId }
    ]
    
    applyCloudTombstones(db, cloudTombstones)

    // Verify row is deleted
    const child = db.prepare('SELECT * FROM children WHERE id = ?').get(childId)
    expect(child).toBeUndefined()

    // Verify a local tombstone is recorded so it is not re-applied endlessly (or marked synced)
    // Actually, if we apply a cloud tombstone, we should record it locally with synced = 1
    // so we know we already processed it.
    const localTombstone = db.prepare('SELECT * FROM tombstones WHERE entity = ? AND record_id = ?').get('children', childId)
    expect(localTombstone).toBeDefined()
    expect(localTombstone.synced).toBe(1)
  })

  it('does nothing if the local row is already deleted (idempotent)', () => {
    const cloudTombstones = [
      { entity: 'children', record_id: 999 }
    ]
    
    // Should not throw
    applyCloudTombstones(db, cloudTombstones)

    const localTombstone = db.prepare('SELECT * FROM tombstones WHERE entity = ? AND record_id = ?').get('children', 999)
    expect(localTombstone).toBeDefined()
    expect(localTombstone.synced).toBe(1)
  })
})
