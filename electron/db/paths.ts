/**
 * Database filenames, kept in one place so the app, the backup/restore flow and
 * the legacy-data migration can never disagree about what the file is called.
 */

/** Current database filename (German Zone). */
export const DB_FILENAME = 'germanzone.db'

/** Pre-rebrand filename, still present in installations that predate German Zone. */
export const LEGACY_DB_FILENAME = 'nursery.db'
