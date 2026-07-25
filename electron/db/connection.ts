import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { app } from 'electron'

/**
 * Database layer backed by Node's built-in `node:sqlite` (DatabaseSync).
 *
 * `Db` is a thin wrapper that exposes the small subset of the better-sqlite3
 * surface the app relies on (`prepare`, `exec`, `pragma`, `transaction`, `close`),
 * so IPC handlers and migrations keep their existing call sites unchanged.
 */

export interface RunResult {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export interface Statement {
  run(...params: any[]): RunResult
  get(...params: any[]): any
  all(...params: any[]): any[]
}

export class Db {
  private raw: DatabaseSync

  constructor(location: string) {
    this.raw = new DatabaseSync(location)
  }

  prepare(sql: string): Statement {
    // node:sqlite StatementSync already provides run/get/all with correct `this` binding.
    return this.raw.prepare(sql) as unknown as Statement
  }

  exec(sql: string): void {
    this.raw.exec(sql)
  }

  /**
   * Fold all committed WAL pages back into the main `.db` file so a plain
   * file copy (backup) is complete. Safe to call any time; ignored on error.
   */
  checkpoint(): void {
    try {
      this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // Best-effort; a failed checkpoint must not block a backup.
    }
  }

  /** Mirror better-sqlite3's `pragma('key = value')` via an exec'd PRAGMA statement. */
  pragma(statement: string): void {
    this.raw.exec(`PRAGMA ${statement}`)
  }

  /**
   * Mirror better-sqlite3's `transaction(fn)`: returns a function that runs `fn`
   * inside BEGIN/COMMIT, rolling back (and rethrowing) on error.
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const raw = this.raw
    const wrapped = (...args: any[]): any => {
      raw.exec('BEGIN')
      try {
        const result = fn(...args)
        raw.exec('COMMIT')
        return result
      } catch (err) {
        try {
          raw.exec('ROLLBACK')
        } catch {
          // ignore rollback failure; surface the original error
        }
        throw err
      }
    }
    return wrapped as T
  }

  close(): void {
    this.raw.close()
  }
}

let db: Db | null = null

export function getDbPath(): string {
  if (process.env.NODE_ENV === 'test') {
    return ':memory:'
  }
  // Safe check if app is not initialized or in some scripts
  try {
    return path.join(app.getPath('userData'), 'nursery.db')
  } catch {
    return path.join(process.cwd(), 'nursery.db')
  }
}

export function initDb(dbPath = getDbPath()): Db {
  if (db) return db

  db = new Db(dbPath)

  // Apply performance and integrity pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // NORMAL is safe under WAL and avoids an fsync on every COMMIT, which makes
  // bulk writes (e.g. the Excel import) dramatically faster. temp_store=MEMORY
  // keeps transient indexes/sorts off disk.
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')

  return db
}

export function getDb(): Db {
  if (!db) {
    return initDb()
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
