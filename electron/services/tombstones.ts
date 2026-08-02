// We use any for sqlite db in this project typically, but let's just use `any`

/**
 * Deletes recorded by a build that predates the German Zone rename still arrive
 * from the cloud addressed to the old table names, so map them on the way in.
 */
const LEGACY_ENTITY_NAMES: Record<string, string> = {
  children: 'students',
  child_services: 'student_services',
  child_illness_cases: 'student_illness_cases',
  child_activities: 'student_activities',
}

function normalizeEntity(entity: string): string {
  return LEGACY_ENTITY_NAMES[entity] ?? entity
}

/**
 * Tables a cloud tombstone is allowed to delete from. Doubles as the SQL-injection guard, since
 * SQLite cannot parameterise a table name.
 *
 * A table belongs here as soon as deleting from it is a normal operation — otherwise the next
 * pull re-inserts the row that was just deleted on another machine. That matters most for rows
 * that get torn down and rebuilt: re-planning instalments, rewriting a hall's timetable and
 * reassigning a user's branches all delete rows and insert fresh ones with new ids.
 */
export const DELETABLE_ENTITIES = [
  'students', 'student_services', 'payments', 'expenses', 'employees', 'salary_payments',
  'student_installments', 'branches', 'user_branches', 'halls', 'hall_time_slots',
]

export function recordLocalTombstone(db: any, entity: string, recordId: number) {
  db.prepare(`
    INSERT OR IGNORE INTO tombstones (entity, record_id, created_at, synced)
    VALUES (?, ?, ?, 0)
  `).run(normalizeEntity(entity), recordId, new Date().toISOString())
}

export function applyCloudTombstones(db: any, cloudTombstones: { entity: string, record_id: number }[]) {
  const insertTombstone = db.prepare(`
    INSERT OR IGNORE INTO tombstones (entity, record_id, created_at, synced)
    VALUES (?, ?, ?, 1)
  `)

  for (const tombstone of cloudTombstones) {
    const entity = normalizeEntity(tombstone.entity)

    // Delete the local row
    // In SQLite, we can't parameterize table names, so we have to construct the query
    // Make sure entity is a valid table name to prevent SQL injection
    if (DELETABLE_ENTITIES.includes(entity)) {
      db.prepare(`DELETE FROM ${entity} WHERE id = ?`).run(tombstone.record_id)
    }

    // Record it locally as synced so we don't push it back
    insertTombstone.run(entity, tombstone.record_id, new Date().toISOString())
  }
}
