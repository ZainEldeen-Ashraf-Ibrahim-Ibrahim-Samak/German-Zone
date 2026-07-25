import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { DB_FILENAME, LEGACY_DB_FILENAME } from './paths.js'

/**
 * Electron derives `userData` from the app name, so the German Zone rebrand moved
 * it out from under every existing installation — the database, branding logos and
 * fonts would all appear to have vanished. This runs once on startup, before the
 * database is opened, and copies the previous installation's userData across.
 *
 * Copies rather than moves: if anything goes wrong the original data is still
 * sitting in the old directory, and these files are small.
 */

/** userData directory names used before the rebrand (dev used the package name,
 *  packaged builds used electron-builder's productName). */
const LEGACY_USER_DATA_DIRS = [
  'nursery-management-system',
  'Nursery Autism Management System',
]

function copyFileIfExists(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false
  fs.copyFileSync(from, to)
  return true
}

/**
 * Copy a database and its write-ahead log siblings together. The -wal file holds
 * committed-but-not-yet-checkpointed transactions and is bound to the database's
 * filename, so renaming the database without it silently discards recent writes.
 */
function copyDatabase(fromDb: string, toDb: string): void {
  fs.copyFileSync(fromDb, toDb)
  for (const suffix of ['-wal', '-shm']) {
    copyFileIfExists(fromDb + suffix, toDb + suffix)
  }
}

/** Candidate previous locations, most likely first. */
function legacyCandidates(userData: string): { dir: string; db: string }[] {
  const parent = path.dirname(userData)
  const candidates: { dir: string; db: string }[] = []

  // Same directory, previous filename — covers a rebrand that kept the app name.
  candidates.push({ dir: userData, db: path.join(userData, LEGACY_DB_FILENAME) })

  for (const name of LEGACY_USER_DATA_DIRS) {
    const dir = path.join(parent, name)
    if (path.resolve(dir) === path.resolve(userData)) continue
    candidates.push({ dir, db: path.join(dir, LEGACY_DB_FILENAME) })
    // A previous run may already have renamed the file but not the directory.
    candidates.push({ dir, db: path.join(dir, DB_FILENAME) })
  }

  return candidates
}

/**
 * Returns the path migrated from, or null when there was nothing to do
 * (fresh install, or the migration already ran).
 */
export function migrateLegacyUserData(): string | null {
  let userData: string
  try {
    userData = app.getPath('userData')
  } catch {
    // Not running under Electron (scripts, tests) — nothing to migrate.
    return null
  }

  const targetDb = path.join(userData, DB_FILENAME)

  // Already migrated, or this install has its own database — never overwrite it.
  if (fs.existsSync(targetDb)) return null

  for (const { dir, db } of legacyCandidates(userData)) {
    if (!fs.existsSync(db)) continue
    if (path.resolve(db) === path.resolve(targetDb)) continue

    try {
      fs.mkdirSync(userData, { recursive: true })
      copyDatabase(db, targetDb)

      // Branding logos and the bundled Arabic PDF fonts live alongside the database.
      const legacyBranding = path.join(dir, 'branding')
      const targetBranding = path.join(userData, 'branding')
      if (fs.existsSync(legacyBranding) && !fs.existsSync(targetBranding)) {
        fs.cpSync(legacyBranding, targetBranding, { recursive: true })
      }

      console.log(`Migrated existing data from ${db} -> ${targetDb}`)
      return db
    } catch (error) {
      // A failed migration must not stop the app from starting; it will simply
      // begin with an empty database, and the original data remains untouched.
      console.error(`Failed to migrate legacy data from ${db}:`, error)
      // Clear a half-written copy so the next launch retries cleanly.
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.rmSync(targetDb + suffix, { force: true }) } catch { /* best effort */ }
      }
      return null
    }
  }

  return null
}
