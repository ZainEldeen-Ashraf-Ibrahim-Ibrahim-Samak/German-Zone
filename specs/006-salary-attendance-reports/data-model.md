# Phase 1 Data Model: Attendance-Based Teacher Payment System

Four new additive, idempotent migrations continuing `electron/db/migrations/index.ts` (last existing:
`025_child_services_drop_unique`). All follow the file's established guarded-`ALTER TABLE` /
`CREATE TABLE IF NOT EXISTS` pattern so re-runs on existing databases are safe.

## Migration `026_service_teachers`

```sql
CREATE TABLE IF NOT EXISTS service_teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  created_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  UNIQUE(service_id, employee_id)
);
```

- **Purpose**: enumerates which teachers may deliver a given service (FR-006). Empty for a service = no
  restriction (any active employee may be picked as that service's teacher, preserving current behavior for
  existing data).

## Migration `027_teacher_session_rate`

```sql
-- Guarded ALTER (try/catch), consistent with 003/007/008/011/014/019/024
ALTER TABLE employees ADD COLUMN teacher_session_rate REAL;
```

- **Purpose**: FR-004 — each teacher's own "per session cost," independent of `salary_types.session_rate`
  (see research.md #3). `NULL` means "not configured"; the assignment-preview and payment engine treat a
  `NULL` rate as 0 and surface a validation warning in the UI rather than silently charging nothing.

## Migration `028_attendance_teacher_status`

```sql
ALTER TABLE attendance_records ADD COLUMN attended_teacher_id INTEGER REFERENCES employees(id);
ALTER TABLE attendance_records ADD COLUMN teacher_status TEXT CHECK(teacher_status IN ('present','absent'));
```

- **Purpose**: snapshots, per attendance row, which teacher was on record for that child at save time and
  whether that teacher was present (FR-012). Backfill: existing rows get `teacher_status = 'present'` and
  `attended_teacher_id = children.teacher_id` (best-effort, via `child_services`/`children.teacher_id`) so
  historical data doesn't retroactively read as "no teacher payment" after upgrade — implemented as part of
  the migration's `up()` using an `UPDATE ... FROM`-style correlated subquery, matching the backfill style
  already used in `009_backfill_missing_child_services` and `014_employee_roles_salary_types`.

## Migration `029_teacher_payments`

```sql
CREATE TABLE IF NOT EXISTS teacher_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL REFERENCES employees(id),
  child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  session_cost REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','paid','void')) DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  UNIQUE(teacher_id, child_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_teacher_payments_teacher ON teacher_payments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_payments_month ON teacher_payments(attendance_date);
```

- **Purpose**: the payment ledger described in FR-013/FR-014. `UNIQUE(teacher_id, child_id,
  attendance_date)` is the database-level duplicate-protection guarantee (FR-015, research.md #6).
  `attendance_record_id` links back for audit/drill-down from a child's attendance history.

## Entity Reference

### `service_teachers` (new)
| Column | Type | Notes |
|---|---|---|
| service_id | INTEGER | FK → `service_definitions.id`, cascade delete |
| employee_id | INTEGER | FK → `employees.id` |

### `employees` (extended)
| Column | Type | Notes |
|---|---|---|
| teacher_session_rate | REAL, nullable | Per-teacher rate used by the payment engine (FR-004/FR-005) |

### `attendance_records` (extended)
| Column | Type | Notes |
|---|---|---|
| attended_teacher_id | INTEGER, nullable | FK → `employees.id`; snapshot of the teacher for this child at save time |
| teacher_status | TEXT (`present`\|`absent`), nullable | Drives the five payment-eligibility cases (FR-008…FR-011) |

Existing `status` column (`attended`\|`absent_excused`\|`absent_unexcused`) already carries the "child
status + absence type" dimension required by FR-012 — no change needed there.

### `teacher_payments` (new)
| Column | Type | Notes |
|---|---|---|
| teacher_id | INTEGER | FK → `employees.id` |
| child_id | INTEGER | FK → `children.id`, cascade delete |
| attendance_record_id | INTEGER | FK → `attendance_records.id`, cascade delete |
| attendance_date | TEXT | Denormalized from the session date, for fast month-range queries and the UNIQUE constraint |
| session_cost | REAL | Rate captured at generation time (research.md #8) |
| status | TEXT (`pending`\|`paid`\|`void`) | Lifecycle per clarification session (research.md #7) |

## State Transitions (Teacher Payment)

```text
(none) --[attendance saved, payable]--> pending
pending --[admin marks paid]--> paid
pending --[attendance edited, no longer payable]--> void
void --[attendance edited, payable again]--> pending   (new session_cost snapshot at current rate)
paid --[attendance edited]--> paid (unchanged; admin must manually reverse)
```

## Mongo Sync (`electron/services/mongoSync.ts`)

Add three Mongoose schemas mirroring the additive tables, following the existing pattern (flat schema,
`synced` not mirrored, `_id` mapped from local `id`):

- `serviceTeacherSchema`: `{ service_id, employee_id, created_at }`
- extend existing `employeeSchema` with `teacher_session_rate: Number`
- extend existing `attendanceRecordSchema` (or equivalent) with `attended_teacher_id: Number,
  teacher_status: String`
- `teacherPaymentSchema`: `{ teacher_id, child_id, attendance_record_id, attendance_date, session_cost,
  status, created_at, updated_at }`

Add `service_teachers` and `teacher_payments` to `SYNC_ENTITIES` (push/pull both directions, last-write-wins
on `updated_at`, matching every other entity in that list).
