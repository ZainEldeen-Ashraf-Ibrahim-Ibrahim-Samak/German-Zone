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
      CREATE TABLE IF NOT EXISTS students (
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
    // Insert a local student
    const insert = db.prepare('INSERT INTO students (name) VALUES (?)').run('Test Student')
    const studentId = insert.lastInsertRowid

    // Apply cloud tombstone for this student
    const cloudTombstones = [
      { entity: 'students', record_id: studentId }
    ]
    
    applyCloudTombstones(db, cloudTombstones)

    // Verify row is deleted
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId)
    expect(student).toBeUndefined()

    // Verify a local tombstone is recorded so it is not re-applied endlessly (or marked synced)
    // Actually, if we apply a cloud tombstone, we should record it locally with synced = 1
    // so we know we already processed it.
    const localTombstone = db.prepare('SELECT * FROM tombstones WHERE entity = ? AND record_id = ?').get('students', studentId)
    expect(localTombstone).toBeDefined()
    expect(localTombstone.synced).toBe(1)
  })

  it('does nothing if the local row is already deleted (idempotent)', () => {
    const cloudTombstones = [
      { entity: 'students', record_id: 999 }
    ]
    
    // Should not throw
    applyCloudTombstones(db, cloudTombstones)

    const localTombstone = db.prepare('SELECT * FROM tombstones WHERE entity = ? AND record_id = ?').get('students', 999)
    expect(localTombstone).toBeDefined()
    expect(localTombstone.synced).toBe(1)
  })
})
