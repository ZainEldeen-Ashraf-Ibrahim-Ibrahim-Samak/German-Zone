import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db/connection.js'
import { applyCloudTombstones } from '../services/tombstones.js'
import { requireAdmin, checkAuth } from './_guard.js'
import { progressReporter } from './progress.js'
import {
  connectMongo,
  disconnectMongo,
  getConnectionStatus,
  SYNC_ENTITIES
} from '../services/mongoSync.js'

// ── Conflict resolution helpers ───────────────────────────────────────────────

interface SyncRecord {
  id: number
  updated_at?: string
  synced: number
  [key: string]: any
}

export function resolveConflict(local: SyncRecord, cloud: SyncRecord): 'local' | 'cloud' {
  const localTs = local.updated_at ? new Date(local.updated_at).getTime() : 0
  const cloudTs = cloud.updated_at ? new Date(cloud.updated_at).getTime() : 0

  if (cloudTs > localTs) return 'cloud'
  if (localTs > cloudTs) return 'local'
  // Tie-break: higher id wins
  return local.id >= cloud.id ? 'local' : 'cloud'
}

/**
 * When local "wins" a conflict, the cloud row must still be reconciled into local instead of
 * discarded — this computes which columns to fill in: any column that's NULL/undefined/empty
 * string locally gets the cloud value; local's own non-empty values always take precedence.
 * Pure/exported so the merge semantics are unit-testable without a database.
 */
export function computeMergeColumns(local: SyncRecord, cloud: SyncRecord): { columns: string[]; values: any[] } {
  const columns: string[] = []
  const values: any[] = []
  for (const c of Object.keys(cloud)) {
    if (c === '_id' || c === 'id' || c === '__v') continue
    const localVal = (local as any)[c]
    const cloudVal = (cloud as any)[c]
    const localEmpty = localVal === null || localVal === undefined || localVal === ''
    const cloudEmpty = cloudVal === null || cloudVal === undefined || cloudVal === ''
    if (localEmpty && !cloudEmpty) {
      columns.push(c)
      values.push(cloudVal)
    }
  }
  return { columns, values }
}

// ── Helper: log sync action ───────────────────────────────────────────────────

function logSync(action: string, entityType: string, recordId: string | number, status: string, error: string | null = null) {
  try {
    const db = getDb()
    db.prepare(`
      INSERT INTO sync_log (action, table_name, record_id, status, error, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(action, entityType, String(recordId), status, error, new Date().toISOString())
  } catch {
    // Non-critical logging failure
  }
}

// Guaranteed fallback so the app is never left with "no URI configured" — an admin-set value in
// the settings table always wins, then MONGO_URI from .env, and only if neither exists does this
// hardcoded default get used, so sync always has somewhere to connect to.
const DEFAULT_MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://nursery:nursery@cluster0.ile4s29.mongodb.net/?appName=Cluster0'

export function getMongoUri(): string {
  try {
    const db = getDb()
    const uriRow = db.prepare("SELECT value FROM settings WHERE key = 'sync_mongo_uri'").get() as any
    return uriRow?.value || process.env.MONGO_URI || DEFAULT_MONGO_URI
  } catch {
    return process.env.MONGO_URI || DEFAULT_MONGO_URI
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────


/**
 * sync:connect — Connect to MongoDB with given URI.
 * Saves URI to settings. Admin only.
 */
ipcMain.handle('sync:connect', async (_event, { uri }) => {
  try {
    requireAdmin()

    if (!uri || !uri.startsWith('mongodb')) {
      throw new Error('Invalid MongoDB URI. Must start with mongodb:// or mongodb+srv://')
    }

    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `).run('sync_mongo_uri', uri)

    await connectMongo(uri)
    logSync('connect', 'connection', 'mongodb', 'success')

    return { connected: true }
  } catch (error: any) {
    logSync('connect', 'connection', 'mongodb', 'error', error.message)
    console.error('sync:connect error:', error)
    throw new Error(error.message || 'Failed to connect to MongoDB')
  }
})

/**
 * sync:reconnect — Reconnect using the URI already saved in settings / env.
 * Admin only.
 */
ipcMain.handle('sync:reconnect', async () => {
  try {
    requireAdmin()
    const mongoUri = getMongoUri()
    if (!mongoUri) throw new Error('No MongoDB URI configured. Enter a URI first.')
    await connectMongo(mongoUri)
    logSync('reconnect', 'connection', 'mongodb', 'success')
    return { connected: true }
  } catch (error: any) {
    logSync('reconnect', 'connection', 'mongodb', 'error', error.message)
    throw new Error(error.message || 'Failed to reconnect to MongoDB')
  }
})

/**
 * sync:disconnect — Disconnect from MongoDB.
 * Admin only.
 */
ipcMain.handle('sync:disconnect', async () => {
  try {
    requireAdmin()
    await disconnectMongo()
    return { connected: false }
  } catch (error: any) {
    console.error('sync:disconnect error:', error)
    throw new Error(error.message || 'Failed to disconnect')
  }
})

/**
 * sync:status — Returns sync status: connection, pending counts per entity.
 * Any logged-in user (auto-sync runs for every role, so every role may see its status).
 */
ipcMain.handle('sync:status', async () => {
  try {
    checkAuth()
    const db = getDb()
    const { connected, error } = getConnectionStatus()

    const pending: Record<string, number> = {}
    for (const entity of SYNC_ENTITIES) {
      let cq = `SELECT COUNT(*) as c FROM ${entity.table} WHERE synced = 0`
      if (entity.name === 'settings') cq += " AND key != 'sync_mongo_uri'"
      const row = db.prepare(cq).get() as any
      pending[entity.name] = row?.c ?? 0
    }

    const mongoUri = getMongoUri()
    const lastLogRow = db.prepare('SELECT synced_at AS created_at, status, action FROM sync_log ORDER BY id DESC LIMIT 1').get() as any

    // Saved auto-sync state so the UI reflects it after a restart instead of
    // defaulting to "Off" (the timer itself is resumed in main.ts on startup).
    const autoIntervalRow = db.prepare("SELECT value FROM settings WHERE key = 'sync_auto_interval'").get() as any
    const savedInterval = autoIntervalRow ? Number(autoIntervalRow.value) : 1

    return {
      connected,
      error,
      uri: mongoUri ? '***configured***' : null,
      pending,
      lastSync: lastLogRow || null,
      autoSyncEnabled: savedInterval > 0,
      autoSyncIntervalMinutes: savedInterval > 0 ? savedInterval : 1
    }
  } catch (error: any) {
    console.error('sync:status error:', error)
    throw new Error(error.message || 'Failed to get sync status')
  }
})

// ── Core push/pull (callable directly by auto-sync, not only via IPC) ─────────

type Reporter = (current: number, total: number, phase?: string) => void
const noopReport: Reporter = () => {}

/** Connect (or reconnect) using the saved URI if the connection is down. */
async function ensureConnected(): Promise<void> {
  const { connected } = getConnectionStatus()
  if (!connected) {
    const mongoUri = getMongoUri()
    if (!mongoUri) throw new Error('No MongoDB URI configured. Please connect first.')
    await connectMongo(mongoUri)
  }
}

/**
 * Push records to MongoDB for every entity in SYNC_ENTITIES.
 * Default mode pushes rows with synced = 0; force pushes every row (overwriting cloud).
 */
export async function runPush(force: boolean, report: Reporter = noopReport) {
  try {
    const db = getDb()
    await ensureConnected()

    const results: Record<string, { pushed: number; failed: number }> = {}
    const now = new Date().toISOString()

    // Total work = all unsynced rows across every entity, so the bar is determinate.
    let totalWork = 0
    for (const entity of SYNC_ENTITIES) {
      let cq = force ? `SELECT COUNT(*) AS c FROM ${entity.table}` : `SELECT COUNT(*) AS c FROM ${entity.table} WHERE synced = 0`
      if (entity.name === 'settings') {
        cq += force ? " WHERE key != 'sync_mongo_uri'" : " AND key != 'sync_mongo_uri'"
      }
      totalWork += (db.prepare(cq).get() as any)?.c ?? 0
    }
    let done = 0
    report(0, totalWork, 'starting')

    for (const entity of SYNC_ENTITIES) {
      let query = force ? `SELECT * FROM ${entity.table}` : `SELECT * FROM ${entity.table} WHERE synced = 0`
      if (entity.name === 'settings') {
        query += force ? ` WHERE key != 'sync_mongo_uri'` : ` AND key != 'sync_mongo_uri'`
      }
      
      const unsynced = db.prepare(query).all() as SyncRecord[]
      let pushed = 0
      let failed = 0

      for (const record of unsynced) {
        try {
          if (entity.name === 'settings') {
            await entity.model.findOneAndUpdate(
              { id: record.key }, // use key as id for mongo
              { ...record, id: record.key, updated_at: record.updated_at || now },
              { upsert: true, returnDocument: 'after' }
            )
            db.prepare(`UPDATE ${entity.table} SET synced = 1 WHERE key = ?`).run(record.key)
            logSync('push', entity.name, record.key, 'success')
          } else {
            await entity.model.findOneAndUpdate(
              { id: record.id },
              { ...record, updated_at: record.updated_at || now },
              { upsert: true, returnDocument: 'after' }
            )
            db.prepare(`UPDATE ${entity.table} SET synced = 1 WHERE id = ?`).run(record.id)
            logSync('push', entity.name, record.id, 'success')
          }
          pushed++
        } catch (err: any) {
          logSync('push', entity.name, record.id, 'error', err.message)
          failed++
        }
        report(++done, totalWork, entity.name)
      }

      results[entity.name] = { pushed, failed }
    }
    report(totalWork, totalWork, 'done')

    return { results }
  } catch (error: any) {
    logSync('push', 'all', 'batch', 'error', error.message)
    console.error('sync:push error:', error)
    throw new Error(error.message || 'Push failed')
  }
}

/**
 * Pull records from MongoDB for every entity in SYNC_ENTITIES.
 * Default mode applies conflict resolution (most-recent updated_at wins, id tie-break);
 * `force` makes every cloud record overwrite local unconditionally — for restoring/importing
 * known-good cloud data onto a machine whose local rows have stale-but-technically-"newer"
 * timestamps that would otherwise make the pull report everything as "skipped".
 */
export async function runPull(force: boolean, report: Reporter = noopReport) {
  try {
    const db = getDb()
    await ensureConnected()

    // Pre-count cloud documents so the progress bar is determinate.
    let totalWork = 0
    for (const entity of SYNC_ENTITIES) {
      try { totalWork += await entity.model.estimatedDocumentCount() } catch { /* ignore */ }
    }
    let done = 0
    report(0, totalWork, 'starting')

    const results: Record<
      string,
      {
        pulled: number; merged: number; skipped: number; failed: number
        errors: { recordId: string; message: string }[]
        skipReasons: { recordId: string; message: string }[]
      }
    > = {}

    for (const entity of SYNC_ENTITIES) {
      let pulled = 0
      let merged = 0
      let skipped = 0
      let failed = 0
      let orphanSkipped = 0
      const errors: { recordId: string; message: string }[] = []
      const skipReasons: { recordId: string; message: string }[] = []

      /** Record a pull failure with its reason (logged + returned to the UI). */
      const noteError = (recordId: string | number, err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        if (errors.length < 25) errors.push({ recordId: String(recordId), message })
        console.error(`[sync:pull] ${entity.name} record=${recordId}: ${message}`)
      }

      /**
       * Record *why* a record was skipped (not just that it was), so the UI can show the actual
       * cause — e.g. "local looked newer" — instead of a bare skip count admins have no way to
       * act on.
       */
      const noteSkip = (recordId: string | number, message: string) => {
        if (skipReasons.length < 25) skipReasons.push({ recordId: String(recordId), message })
      }

      try {
        const cloudRecords = await entity.model.find({}).lean()

        for (const cloud of cloudRecords) {
          const cloudRecord = cloud as SyncRecord
          try {
            if (entity.name === 'tombstones') {
              // Apply tombstone logic
              const local = db.prepare(`SELECT * FROM tombstones WHERE entity = ? AND record_id = ?`).get(cloudRecord.entity, cloudRecord.record_id)
              if (!local) {
                applyCloudTombstones(db, [cloudRecord as any])
                logSync('pull-tombstone', entity.name, `${cloudRecord.entity}:${cloudRecord.record_id}`, 'success')
                pulled++
              } else {
                logSync('pull-skip', entity.name, `${cloudRecord.entity}:${cloudRecord.record_id}`, 'skipped')
                noteSkip(`${cloudRecord.entity}:${cloudRecord.record_id}`, 'already exists locally (tombstone already applied)')
                skipped++
              }
              continue
            }

            let local: SyncRecord | undefined
            if (entity.name === 'settings') {
              local = db.prepare(`SELECT * FROM settings WHERE key = ?`).get(cloudRecord.id) as SyncRecord | undefined
            } else {
              local = db.prepare(`SELECT * FROM ${entity.table} WHERE id = ?`).get(cloudRecord.id) as SyncRecord | undefined
            }

            if (!local) {
              // New record from cloud — insert it
              const columns = Object.keys(cloudRecord).filter((k) => k !== '_id' && k !== '__v')
              const placeholders = columns.map(() => '?').join(', ')
              const values = columns.map((c) => cloudRecord[c])

              // Ensure `id` is mapped to `key` for settings
              if (entity.name === 'settings') {
                 const keyIndex = columns.indexOf('id')
                 if (keyIndex !== -1) columns[keyIndex] = 'key'
              }

              db.prepare(`INSERT OR IGNORE INTO ${entity.table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values)
              logSync('pull-insert', entity.name, cloudRecord.id, 'success')
              pulled++
            } else {
              // Conflict check
              // for settings, local uses `key`, let's map it to `id` for resolveConflict
              if (entity.name === 'settings') {
                 local.id = local.key as any
              }
              
              const winner = force ? 'cloud' : resolveConflict(local, cloudRecord)
              if (winner === 'cloud') {
                // Update local with cloud data
                const columns = Object.keys(cloudRecord).filter((k) => k !== '_id' && k !== 'id' && k !== '__v')
                const setClause = columns.map((c) => `${c} = ?`).join(', ')
                const values = columns.map((c) => cloudRecord[c])
                values.push(cloudRecord.id)

                if (entity.name === 'settings') {
                   db.prepare(`UPDATE ${entity.table} SET ${setClause}, synced = 1 WHERE key = ?`).run(...values)
                } else {
                   db.prepare(`UPDATE ${entity.table} SET ${setClause}, synced = 1 WHERE id = ?`).run(...values)
                }
                logSync('pull-update', entity.name, cloudRecord.id, 'success')
                pulled++
              } else {
                // Local "wins" the conflict, but that must not mean the cloud row is thrown
                // away silently — merge it into local instead: any column that's NULL/empty
                // locally gets filled in from the cloud value (local's own non-empty values
                // always take precedence), then write the merged result back and mark it
                // synced. This reconciles every tie/local-wins case with the current local DB
                // rather than leaving it unresolved as a bare "skipped" count.
                const { columns: changedColumns, values: mergedValues } = computeMergeColumns(local, cloudRecord)

                if (changedColumns.length > 0) {
                  const setClause = changedColumns.map((c) => `${c} = ?`).join(', ')
                  const idField = entity.name === 'settings' ? 'key' : 'id'
                  db.prepare(`UPDATE ${entity.table} SET ${setClause}, synced = 1 WHERE ${idField} = ?`)
                    .run(...mergedValues, cloudRecord.id)
                  const reason = `merged — filled in ${changedColumns.join(', ')} from cloud (local values for everything else kept)`
                  logSync('pull-merge', entity.name, cloudRecord.id, 'merged', reason)
                  noteSkip(cloudRecord.id, reason)
                  merged++
                } else {
                  // Nothing to merge — local and cloud already fully agree; still mark
                  // synced so it doesn't keep getting re-evaluated as a "conflict" every pull.
                  const idField = entity.name === 'settings' ? 'key' : 'id'
                  db.prepare(`UPDATE ${entity.table} SET synced = 1 WHERE ${idField} = ?`).run(cloudRecord.id)
                  const reason = 'already identical to cloud — marked synced, nothing to merge'
                  logSync('pull-merge', entity.name, cloudRecord.id, 'merged', reason)
                  noteSkip(cloudRecord.id, reason)
                  merged++
                }
              }
            }
          } catch (err: any) {
            const message = err instanceof Error ? err.message : String(err)
            // A FOREIGN KEY failure means the cloud row references a parent
            // (e.g. a child) that doesn't exist — stale/orphaned cloud data.
            // It can never be applied, so skip it quietly instead of flooding
            // the log and the UI with one "failed" per orphan.
            if (/FOREIGN KEY/i.test(message)) {
              orphanSkipped++
              skipped++
              logSync('pull', entity.name, cloudRecord.id, 'skipped-orphan', message)
              noteSkip(cloudRecord.id, `orphaned — references a missing parent record (stale cloud data): ${message}`)
            } else {
              logSync('pull', entity.name, cloudRecord.id, 'error', message)
              noteError(cloudRecord.id, err)
              failed++
            }
          }
          report(++done, totalWork, entity.name)
        }
      } catch (err: any) {
        // Whole-entity failure (e.g. the cloud query itself failed). Count it so
        // the UI shows a non-zero "failed" and explains why instead of silently 0.
        logSync('pull', entity.name, 'batch', 'error', err.message)
        noteError('batch', err)
        failed++
      }

      if (orphanSkipped > 0) {
        console.warn(`[sync:pull] ${entity.name}: skipped ${orphanSkipped} orphaned cloud row(s) (missing parent record)`)
        if (errors.length < 25) {
          errors.push({ recordId: 'orphans', message: `${orphanSkipped} skipped — reference a missing parent record (stale cloud data)` })
        }
      }

      results[entity.name] = { pulled, merged, skipped, failed, errors, skipReasons }
    }

    report(totalWork, totalWork, 'done')
    return { results }
  } catch (error: any) {
    logSync('pull', 'all', 'batch', 'error', error.message)
    console.error('sync:pull error:', error)
    throw new Error(error.message || 'Pull failed')
  }
}

/**
 * sync:push — Push all unsynced records to MongoDB (all rows when force: true).
 * Any logged-in user — sync must work for every role, same as the automatic cycle.
 * Graceful: reports pushed/failed counts per entity.
 */
ipcMain.handle('sync:push', async (event, args) => {
  checkAuth()
  return runPush(args?.force === true, progressReporter(event, 'push'))
})

/**
 * sync:pull — Pull records from MongoDB (cloud always wins when force: true).
 * Any logged-in user — sync must work for every role, same as the automatic cycle.
 */
ipcMain.handle('sync:pull', async (event, args) => {
  checkAuth()
  return runPull(args?.force === true, progressReporter(event, 'pull'))
})

// ── Auto-sync interval (T090) ─────────────────────────────────────────────────

let autoSyncTimer: ReturnType<typeof setInterval> | null = null
let autoSyncRunning = false

/**
 * One auto-sync cycle: push first (force — overwrite cloud with local so auto-sync never
 * silently skips records the `synced` flag missed), then pull (force — cloud wins conflicts,
 * which after the push means only records this machine doesn't have yet get written locally).
 * Calls runPush/runPull directly — ipcMain.handle() handlers are NOT reachable through
 * ipcMain.listeners(), which is why the previous listener-based approach never ran.
 */
/** Broadcast the auto-sync cycle state so the renderer can show a loading banner. */
type AutoSyncState = 'connecting' | 'pushing' | 'pulling' | 'done' | 'error'
let lastAutoSyncState: AutoSyncState | 'idle' = 'idle'
function broadcastAutoSyncStatus(state: AutoSyncState): void {
  lastAutoSyncState = state
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:auto-status', { state })
  }
}

// The startup cycle can begin before the renderer finishes loading, so the banner
// asks for the current state on mount instead of relying only on the push events.
ipcMain.handle('sync:auto-status:get', () => ({ state: lastAutoSyncState, running: autoSyncRunning }))

async function runAutoSyncCycle(): Promise<void> {
  if (autoSyncRunning) return // previous cycle still in flight — skip this tick
  autoSyncRunning = true
  try {
    broadcastAutoSyncStatus('connecting')
    await ensureConnected()
    broadcastAutoSyncStatus('pushing')
    await runPush(true)
    broadcastAutoSyncStatus('pulling')
    await runPull(true)
    broadcastAutoSyncStatus('done')
  } catch (err) {
    console.error('Auto-sync error:', err)
    broadcastAutoSyncStatus('error')
  } finally {
    autoSyncRunning = false
  }
}

export function startAutoSync(intervalMs: number): void {
  if (autoSyncTimer) clearInterval(autoSyncTimer)
  autoSyncTimer = setInterval(() => { void runAutoSyncCycle() }, intervalMs)
  // Kick off a first cycle immediately instead of waiting a full interval.
  void runAutoSyncCycle()
}

export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}

/**
 * sync:auto-sync — Enable/disable auto-sync and set the interval.
 * Any logged-in user — employees can turn on the forced auto-sync cycle too.
 */
ipcMain.handle('sync:auto-sync', async (_event, { enabled, intervalMinutes = 1 }) => {
  try {
    checkAuth()
    const db = getDb()

    if (enabled) {
      const intervalMs = intervalMinutes * 60 * 1000
      startAutoSync(intervalMs)
      db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
      `).run('sync_auto_interval', String(intervalMinutes))
      return { autoSync: true, intervalMinutes }
    } else {
      stopAutoSync()
      db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
      `).run('sync_auto_interval', '0')
      return { autoSync: false }
    }
  } catch (error: any) {
    console.error('sync:auto-sync error:', error)
    throw new Error(error.message || 'Failed to configure auto-sync')
  }
})