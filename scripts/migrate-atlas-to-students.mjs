/**
 * One-off cloud migration for the German Zone rebrand.
 *
 * Renames the child-named sync collections and the `child_id` field inside every
 * collection that carries one, so the Atlas database matches the local SQLite schema
 * after migration 043. Run this ONCE, after upgrading at least one device, and before
 * other devices sync — otherwise they will re-push documents under the old names.
 *
 * Usage:
 *   node scripts/migrate-atlas-to-students.mjs --dry-run   # report only, no writes
 *   node scripts/migrate-atlas-to-students.mjs             # apply
 *
 * Requires MONGO_URI in .env (or the environment).
 *
 * Safe to re-run: every step is skipped when it has already been applied.
 */

import mongoose from 'mongoose'
import { config } from 'dotenv'

config()

const DRY_RUN = process.argv.includes('--dry-run')
const URI = process.env.MONGO_URI

if (!URI) {
  console.error('MONGO_URI is not set (checked .env and the environment).')
  process.exit(1)
}

/** old collection -> new collection */
const COLLECTION_RENAMES = [
  ['sync_children', 'sync_students'],
  ['sync_child_services', 'sync_student_services'],
  ['sync_child_illness_cases', 'sync_student_illness_cases'],
  ['sync_child_activities', 'sync_student_activities'],
]

/** Collections holding a `child_id` that must become `student_id`. Listed under
 *  their POST-rename names, since the rename runs first. */
const FIELD_RENAMES = [
  ['sync_payments', 'child_id', 'student_id'],
  ['sync_student_services', 'child_id', 'student_id'],
  ['sync_attendance_records', 'child_id', 'student_id'],
  ['sync_teacher_payments', 'child_id', 'student_id'],
  ['sync_attendance_edit_requests', 'child_id', 'student_id'],
  ['sync_student_illness_cases', 'child_id', 'student_id'],
  ['sync_student_activities', 'child_id', 'student_id'],
  ['sync_students', 'child_phone', 'student_phone'],
]

/** Tombstones address rows by table name; rewrite the stored entity values. */
const TOMBSTONE_ENTITY_RENAMES = [
  ['children', 'students'],
  ['child_services', 'student_services'],
  ['child_illness_cases', 'student_illness_cases'],
  ['child_activities', 'student_activities'],
]

/** The salary mode enum value renamed by migration 044. */
const SALARY_MODE_RENAME = ['per_child_session', 'per_student_session']

/** Service names renamed by migration 045, applied to every stored copy. */
const SERVICE_RENAMES = [
  ['حضانة', 'A1'],
  ['استضافة', 'A2'],
  ['جلسة', 'جلسات محادثة'],
]
const SERVICE_FIELD_COLLECTIONS = [
  ['sync_students', 'service'],
  ['sync_student_services', 'service'],
  ['sync_payments', 'service'],
  ['sync_service_definitions', 'name'],
]

const log = (...args) => console.log(DRY_RUN ? '[dry-run]' : '[apply]  ', ...args)

async function main() {
  await mongoose.connect(URI)
  const db = mongoose.connection.db
  console.log(`Connected to database: ${db.databaseName}\n`)

  const names = new Set((await db.listCollections().toArray()).map((c) => c.name))

  // ── 1. Rename collections ──────────────────────────────────────────────────
  console.log('— Collections —')
  for (const [from, to] of COLLECTION_RENAMES) {
    if (!names.has(from)) {
      log(`skip   ${from} (not present)`)
      continue
    }
    if (names.has(to)) {
      const fromCount = await db.collection(from).countDocuments()
      console.error(
        `CONFLICT ${from} -> ${to}: both exist. Leaving untouched; ` +
        `merge the ${fromCount} document(s) in ${from} manually.`
      )
      continue
    }
    log(`rename ${from} -> ${to}`)
    if (!DRY_RUN) await db.renameCollection(from, to)
    names.delete(from)
    names.add(to)
  }

  // ── 2. Rename fields ───────────────────────────────────────────────────────
  console.log('\n— Fields —')
  for (const [collection, from, to] of FIELD_RENAMES) {
    if (!names.has(collection)) {
      log(`skip   ${collection}.${from} (collection not present)`)
      continue
    }
    const pending = await db.collection(collection).countDocuments({ [from]: { $exists: true } })
    if (pending === 0) {
      log(`skip   ${collection}.${from} (already migrated)`)
      continue
    }
    log(`rename ${collection}.${from} -> ${to}  (${pending} doc(s))`)
    if (!DRY_RUN) {
      await db.collection(collection).updateMany(
        { [from]: { $exists: true } },
        { $rename: { [from]: to } }
      )
    }
  }

  // ── 3. Rewrite stored values ───────────────────────────────────────────────
  console.log('\n— Values —')

  if (names.has('sync_tombstones')) {
    for (const [from, to] of TOMBSTONE_ENTITY_RENAMES) {
      const n = await db.collection('sync_tombstones').countDocuments({ entity: from })
      if (n === 0) continue
      log(`tombstones entity ${from} -> ${to}  (${n} doc(s))`)
      if (!DRY_RUN) {
        await db.collection('sync_tombstones').updateMany({ entity: from }, { $set: { entity: to } })
      }
    }
  }

  if (names.has('sync_salary_types')) {
    const [from, to] = SALARY_MODE_RENAME
    const n = await db.collection('sync_salary_types').countDocuments({ mode: from })
    if (n > 0) {
      log(`salary_types mode ${from} -> ${to}  (${n} doc(s))`)
      if (!DRY_RUN) {
        await db.collection('sync_salary_types').updateMany({ mode: from }, { $set: { mode: to } })
      }
    }
  }

  for (const [collection, field] of SERVICE_FIELD_COLLECTIONS) {
    if (!names.has(collection)) continue
    for (const [from, to] of SERVICE_RENAMES) {
      const n = await db.collection(collection).countDocuments({ [field]: from })
      if (n === 0) continue
      log(`${collection}.${field} "${from}" -> "${to}"  (${n} doc(s))`)
      if (!DRY_RUN) {
        await db.collection(collection).updateMany({ [field]: from }, { $set: { [field]: to } })
      }
    }
  }

  // ── 4. Report leftovers ────────────────────────────────────────────────────
  console.log('\n— Verification —')
  let leftovers = 0
  for (const name of names) {
    if (/child/i.test(name)) {
      console.warn(`  collection still child-named: ${name}`)
      leftovers++
    }
    const doc = await db.collection(name).findOne({})
    for (const key of Object.keys(doc ?? {})) {
      if (/child/i.test(key)) {
        console.warn(`  ${name} still has field: ${key}`)
        leftovers++
      }
    }
  }
  console.log(leftovers === 0 ? '  clean — no child-named collections or fields remain' : `  ${leftovers} item(s) need attention`)

  await mongoose.disconnect()
  console.log(DRY_RUN ? '\nDry run complete — nothing was written.' : '\nMigration complete.')
}

main().catch(async (error) => {
  console.error('Migration failed:', error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
