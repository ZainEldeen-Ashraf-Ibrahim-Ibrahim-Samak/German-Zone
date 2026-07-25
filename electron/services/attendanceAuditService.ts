import type { Db } from '../db/connection.js'

export interface AuditLogEntryInput {
  attendance_record_id: number
  edit_request_id: number | null
  old_status: string | null
  old_excuse_notes: string | null
  old_teacher_status: string | null
  new_status: string
  new_excuse_notes: string | null
  new_teacher_status: string | null
  changed_by: number
  approved_by: number | null
  reason: string | null
  changed_at: string
}

/**
 * Appends one row to attendance_audit_log. Insert-only — no update/delete handler is ever
 * exposed for this table (FR-013/FR-021): "no attendance record should ever disappear
 * completely" extends to its history.
 */
export function writeAuditLog(db: Db, entry: AuditLogEntryInput): void {
  db.prepare(`
    INSERT INTO attendance_audit_log
      (attendance_record_id, edit_request_id, old_status, old_excuse_notes, old_teacher_status,
       new_status, new_excuse_notes, new_teacher_status, changed_by, approved_by, reason, changed_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    entry.attendance_record_id, entry.edit_request_id,
    entry.old_status, entry.old_excuse_notes, entry.old_teacher_status,
    entry.new_status, entry.new_excuse_notes, entry.new_teacher_status,
    entry.changed_by, entry.approved_by, entry.reason, entry.changed_at
  )
}
