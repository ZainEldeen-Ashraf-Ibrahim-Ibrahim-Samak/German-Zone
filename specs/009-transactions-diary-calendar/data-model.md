# Data Model: Transactions Timeline, Child Diary & Staff Calendar

## Removed Entities

### `daily_payments` (table) / `sync_daily_payments` (Mongo collection)
### `daily_payment_transactions` (table) / `sync_daily_payment_transactions` (Mongo collection)

Dropped entirely via migration `037_drop_daily_payments`. Their `SYNC_ENTITIES` rows are removed from `electron/services/mongoSync.ts`. Historical rows are discarded (per Clarifications — not migrated, not exported).

---

## New Entities

### `child_illness_cases`

Represents an open or resolved health/illness case for a child. Presence of an `open` row suppresses the "Add Activity" action on the child details page.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `child_id` | INTEGER NOT NULL | FK → `children(id)` ON DELETE CASCADE |
| `status` | TEXT NOT NULL | `open` \| `resolved`; CHECK constraint |
| `description` | TEXT | free-text illness/case notes |
| `opened_at` | TEXT NOT NULL | ISO date |
| `resolved_at` | TEXT | ISO date, null while open |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |
| `synced` | INTEGER DEFAULT 0 | |

Index: `idx_illness_cases_child_status ON child_illness_cases(child_id, status)` — used to answer "does this child have an open case."

### `child_activities`

A dated diary/activity entry for a child, optionally with one attached photo or video. Only offered for creation when the child has no `open` `child_illness_cases` row.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `child_id` | INTEGER NOT NULL | FK → `children(id)` ON DELETE CASCADE |
| `activity_date` | TEXT NOT NULL | ISO date |
| `note` | TEXT | free-text description of the activity |
| `media_url` | TEXT | Cloudinary secure URL, nullable |
| `media_type` | TEXT | `photo` \| `video` \| NULL; CHECK constraint |
| `media_status` | TEXT | `uploaded` \| `failed` \| NULL — supports the "upload failed, note still saved" edge case |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |
| `synced` | INTEGER DEFAULT 0 | |

Index: `idx_child_activities_child_date ON child_activities(child_id, activity_date)`.

**Validation rules**:
- `note` and `media_url` cannot both be empty (an activity must have at least a note or media).
- Creation blocked at the IPC layer when an `open` `child_illness_cases` row exists for `child_id` (server-side enforcement of FR-007, not just a UI affordance).

---

## Modified / Reused Entities (no schema change unless noted)

### `child_services` (existing)

Already has `teacher_id`, `lesson_days`, `service` — reused as-is to build the Child Details timetable section and the Calendar aggregation. No new columns needed.

### `service_teachers` (existing)

Reused as-is for services with multiple assigned teachers.

### `payments` (existing)

Reused as-is as the source for the Transactions tab (`payment_date`/`created_at`, `amount`, `child_id`, `service_id`) and for the "Total Paid" half of the paid/remaining summary.

### `scheduled_sessions` / `session_teachers` (existing)

Reused as-is as an additional input to the Calendar aggregation (session-based scheduling, distinct from `child_services.lesson_days`).

---

## Derived / Read-Model Concepts (no new tables)

### Transaction (view-level concept)

Not a table — a query result shape returned by `transactionsIPC.ts`, derived from `payments` joined to `children` and `child_services`.

| Field | Source |
|---|---|
| `child_id`, `child_name` | `payments.child_id` → `children` |
| `service_id`, `service_name` | `payments.service_id` → `child_services.service` |
| `amount` | `payments.amount` |
| `type` | derived: `charge` \| `payment` \| `refund` based on existing payment record semantics |
| `date` | `payments.payment_date` (fallback `created_at`) |

### Calendar Entry (view-level concept)

Not a table — an aggregation combining `child_services` (lesson_days/teacher) and `scheduled_sessions`/`session_teachers` for a requested month, grouped by day, returned by `calendarIPC.ts`.

| Field | Source |
|---|---|
| `date` | computed from `lesson_days` pattern or `scheduled_sessions.session_date` |
| `user_id`, `user_name` | teacher (`teachers`) or child (`children`) depending on entry type |
| `service_id`, `service_name` | `child_services.service` / `scheduled_sessions` service reference |
| `teacher_id`, `teacher_name` | `child_services.teacher_id` / `session_teachers.employee_id` |

### Remaining Due (view-level concept)

Not a table — `remaining_due = total_due - total_paid`, added as an extra field on the existing child payments-summary IPC response. `total_due` and `total_paid` are already computed by existing summary logic.
