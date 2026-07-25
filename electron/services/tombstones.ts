// We use any for sqlite db in this project typically, but let's just use `any`

export function recordLocalTombstone(db: any, entity: string, recordId: number) {
  db.prepare(`
    INSERT OR IGNORE INTO tombstones (entity, record_id, created_at, synced)
    VALUES (?, ?, ?, 0)
  `).run(entity, recordId, new Date().toISOString())
}

export function applyCloudTombstones(db: any, cloudTombstones: { entity: string, record_id: number }[]) {
  const insertTombstone = db.prepare(`
    INSERT OR IGNORE INTO tombstones (entity, record_id, created_at, synced)
    VALUES (?, ?, ?, 1)
  `)

  for (const tombstone of cloudTombstones) {
    // Delete the local row
    // In SQLite, we can't parameterize table names, so we have to construct the query
    // Make sure entity is a valid table name to prevent SQL injection
    const allowedEntities = ['children', 'child_services', 'payments', 'expenses', 'employees', 'salary_payments']
    if (allowedEntities.includes(tombstone.entity)) {
      db.prepare(`DELETE FROM ${tombstone.entity} WHERE id = ?`).run(tombstone.record_id)
    }

    // Record it locally as synced so we don't push it back
    insertTombstone.run(tombstone.entity, tombstone.record_id, new Date().toISOString())
  }
}
