# Phase 1 Data Model: Printing & Export System + Attendance Edit Approval Workflow

Print/Export introduces no new persisted entities (see Key Entities in spec.md — the "Print/Export Job" is
generated on demand and not stored). The Attendance Edit Approval Workflow introduces three new tables.

## Existing entity referenced (no schema change)

### `attendance_records` (current shape, migration 030)

```
id                  INTEGER PK
session_id          INTEGER NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE
child_id            INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE
status              TEXT NOT NULL CHECK(status IN ('attended','absent_excused','absent_unexcused'))
excuse_notes        TEXT
recorded_by         INTEGER REFERENCES users(id)
recorded_at         TEXT NOT NULL
updated_at          TEXT NOT NULL
synced              INTEGER DEFAULT 0
attended_teacher_id INTEGER REFERENCES employees(id)
teacher_status      TEXT CHECK(teacher_status IN ('present','absent'))
UNIQUE(session_id, child_id, attended_teacher_id)
```

**Locked state (derived, no new column)**: A row is "locked" the moment it exists — see research.md #4.
`attendance:record` MUST check for an existing row matching `(session_id, child_id, attended_teacher_id)`
before writing; a non-admin caller hitting an existing row is rejected (FR-011). Admins bypass this check
(FR-012) but every resulting change still writes an `attendance_audit_log` row (FR-021).

## New entities

### `attendance_edit_requests`

Represents one employee-submitted proposal to change a locked `attendance_records` row (spec Key
Entities: Attendance Edit Request; FR-014, FR-015).

```
id                  INTEGER PK AUTOINCREMENT
attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE
child_id            INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE
teacher_id          INTEGER REFERENCES employees(id)
attendance_date     TEXT NOT NULL           -- denormalized from the session, for fast display/filtering
original_status     TEXT NOT NULL           -- snapshot at submission time
original_excuse_notes TEXT
original_teacher_status TEXT
requested_status    TEXT NOT NULL CHECK(requested_status IN ('attended','absent_excused','absent_unexcused'))
requested_excuse_notes TEXT
requested_teacher_status TEXT CHECK(requested_teacher_status IN ('present','absent'))
reason              TEXT NOT NULL
requested_by        INTEGER NOT NULL REFERENCES users(id)
requested_at        TEXT NOT NULL
status              TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected'))
decided_by          INTEGER REFERENCES users(id)
decided_at          TEXT
decision_notes      TEXT                    -- optional admin rationale, mainly for rejections
synced              INTEGER DEFAULT 0
```

**Validation rules**:
- `reason` is required and non-empty (FR-014).
- Exactly one `pending` request may exist per `(attendance_record_id)` at a time — enforced via a partial
  unique index / application-level check before insert (FR-015, Edge Cases).
- `requested_by` MUST NOT hold the admin role at submission time (admins edit directly per FR-012 and
  don't need this table — enforced in the IPC handler, not the schema, to keep the table role-agnostic for
  future flexibility).
- `decided_by` MUST hold the admin role at decision time (FR-016).

**State transitions**: `pending → approved` (terminal) or `pending → rejected` (terminal). No further
transitions once decided (Edge Cases: concurrent-decision race — the UPDATE that flips status away from
`pending` is guarded by `WHERE status = 'pending'` so only the first decision applies; a second concurrent
decision affects zero rows and is reported as "already decided").

### `attendance_audit_log`

Append-only history of every accepted attendance change, whether from an approved edit request or a
direct admin edit (spec Key Entities: Attendance Audit Log Entry; FR-021, FR-022).

```
id                  INTEGER PK AUTOINCREMENT
attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE
edit_request_id     INTEGER REFERENCES attendance_edit_requests(id)   -- NULL for direct admin edits
old_status          TEXT
old_excuse_notes    TEXT
old_teacher_status  TEXT
new_status          TEXT NOT NULL
new_excuse_notes    TEXT
new_teacher_status  TEXT
changed_by          INTEGER NOT NULL REFERENCES users(id)
approved_by         INTEGER REFERENCES users(id)    -- same as changed_by for direct admin edits
reason              TEXT
changed_at          TEXT NOT NULL
synced              INTEGER DEFAULT 0
```

**Validation rules**: Insert-only from the server — no UPDATE/DELETE IPC handler is ever exposed for this
table (FR-013, "no attendance record should ever disappear completely" extends to its history).

### `notifications`

Minimal in-app notification for edit-request submission/decision (spec Key Entities: Notification;
FR-019, FR-020).

```
id                  INTEGER PK AUTOINCREMENT
user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
type                TEXT NOT NULL CHECK(type IN ('edit_request_submitted','edit_request_approved','edit_request_rejected'))
related_id          INTEGER          -- attendance_edit_requests.id
message_ar          TEXT NOT NULL
message_en          TEXT NOT NULL
read_at             TEXT
created_at          TEXT NOT NULL
synced              INTEGER DEFAULT 0
```

**Validation rules**: `edit_request_submitted` notifications are created for every user holding the admin
role at submission time (FR-019); `edit_request_approved`/`edit_request_rejected` notifications are
created for the single `requested_by` user (FR-020).

## Relationships

```
attendance_records 1───* attendance_edit_requests   (one record can accumulate many requests over time,
                                                       but at most one pending at once)
attendance_records 1───* attendance_audit_log
attendance_edit_requests 0..1───* attendance_audit_log   (an approved request produces exactly one audit
                                                            log row; direct admin edits produce one with
                                                            edit_request_id = NULL)
users 1───* attendance_edit_requests   (as requested_by)
users 1───* attendance_edit_requests   (as decided_by)
users 1───* notifications
```
