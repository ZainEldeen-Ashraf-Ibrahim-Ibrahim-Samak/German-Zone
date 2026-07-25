# Phase 1 Data Model: Dynamic Roles, Salary Configuration & Service Enhancements

Brownfield delta to the existing SQLite schema. Migrations are numbered **014–018** (last applied: `013_session_monthly_setting`). All identity/sync conventions are preserved: integer `id` is the MongoDB identity, `updated_at` (ISO string) drives last-write-wins, `synced` (0 = pending / 1 = reconciled).

---

## Migration 014 — Employee Roles & Salary Types

### New table: `salary_types`

Must be created **before** `employee_roles` (FK dependency).

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL UNIQUE | Display label (e.g. "Fixed 5000/month") |
| `mode` | TEXT NOT NULL | CHECK IN ('fixed_monthly','per_session_fixed','per_session_pct','hybrid') |
| `monthly_rate` | REAL | Required for modes: `fixed_monthly`, `hybrid`; NULL otherwise |
| `session_rate` | REAL | Required for modes: `per_session_fixed`, `hybrid`; NULL otherwise |
| `session_pct` | REAL | Required for mode: `per_session_pct`; NULL otherwise (0–1 fraction, e.g. 0.15 = 15%) |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |
| `synced` | INTEGER DEFAULT 0 | |

**Salary calculation rules by mode:**
- `fixed_monthly`: `actual_salary = monthly_rate`
- `per_session_fixed`: `actual_salary = payable_sessions × session_rate`
- `per_session_pct`: `actual_salary = payable_sessions × session_revenue × session_pct`
- `hybrid`: `actual_salary = monthly_rate + (payable_sessions × session_rate)`

Where `payable_sessions` = sessions where child attended OR was absent without excuse (attendance status ≠ `absent_excused`).

---

### New table: `employee_roles`

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL UNIQUE | Role display name |
| `salary_type_id` | INTEGER | FK → `salary_types.id`; NULL = not yet configured (flagged in UI per FR-037) |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |
| `synced` | INTEGER DEFAULT 0 | |

---

### Modified table: `employees` (additive columns)

| New Column | Type | Rules |
|------------|------|-------|
| `role_id` | INTEGER | FK → `employee_roles.id`; populated by migration from existing `role` TEXT |
| `salary_type_override_id` | INTEGER | FK → `salary_types.id`; NULL = use `employee_roles.salary_type_id` |

**Resolution rule** (evaluated at salary calculation time):
```
effective_salary_type = employee.salary_type_override_id ?? employee_role.salary_type_id
```

**Migration data step** (idempotent — inside migration `014`):
1. For each unique `employees.role` string → `INSERT OR IGNORE INTO employee_roles (name, …)`.
2. `UPDATE employees SET role_id = (SELECT id FROM employee_roles WHERE name = employees.role)`.
3. Migrated roles with `salary_type_id IS NULL` trigger the FR-037 admin warning.

The original `employees.role` TEXT column is **kept** as a read-cached value. It is updated alongside `role_id` writes so existing queries requiring a role label continue to work without a JOIN until a future cleanup migration.

---

## Migration 015 — Service Definitions

### New table: `service_definitions`

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL UNIQUE | Display name (e.g. "Nursery", "OT Program") |
| `is_custom` | INTEGER DEFAULT 1 | 0 = built-in (seeded), 1 = admin-created |
| `price_monthly` | REAL | NULL if not applicable |
| `price_daily` | REAL | NULL if not applicable |
| `price_hourly` | REAL | NULL if not applicable |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |
| `synced` | INTEGER DEFAULT 0 | |

**Migration seed step**: reads current `settings` values for built-in services and inserts:

| `name` | `is_custom` | Sources |
|--------|-------------|---------|
| `Nursery` | 0 | `nursery_monthly`, `nursery_daily`, `nursery_hourly` |
| `Hosting` | 0 | `hosting_monthly`, `hosting_daily`, `hosting_hourly` |
| `Session` | 0 | `session_monthly`, `session_daily`, `session_hourly` |

Uses `INSERT OR IGNORE` — safe to re-run.

---

## Migration 016 — Scheduled Sessions & Teacher Assignments

### New table: `scheduled_sessions`

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_date` | TEXT NOT NULL | ISO date string `YYYY-MM-DD` |
| `service_id` | INTEGER | FK → `service_definitions.id`; nullable (general session) |
| `group_name` | TEXT | Optional label (e.g. "Group A") |
| `notes` | TEXT | Optional |
| `created_at` | TEXT NOT NULL | ISO timestamp |
| `updated_at` | TEXT NOT NULL | ISO timestamp |
| `synced` | INTEGER DEFAULT 0 | |

---

### New table: `session_teachers`

Many-to-many bridge between sessions and assigned teachers (employees).

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL | FK → `scheduled_sessions.id` ON DELETE CASCADE |
| `employee_id` | INTEGER NOT NULL | FK → `employees.id` |
| `synced` | INTEGER DEFAULT 0 | |
| | | UNIQUE(session_id, employee_id) |

---

## Migration 017 — Attendance Records & Conflict Log

### New table: `attendance_records`

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL | FK → `scheduled_sessions.id` ON DELETE CASCADE |
| `child_id` | INTEGER NOT NULL | FK → `children.id` ON DELETE CASCADE |
| `status` | TEXT NOT NULL | CHECK IN ('attended','absent_excused','absent_unexcused') |
| `excuse_notes` | TEXT | Required when status = `absent_excused` (nullable for other statuses) |
| `recorded_by` | INTEGER | FK → `users.id`; nullable (offline recording) |
| `recorded_at` | TEXT NOT NULL | ISO timestamp of original entry |
| `updated_at` | TEXT NOT NULL | ISO timestamp — drives last-write-wins sync |
| `synced` | INTEGER DEFAULT 0 | |
| | | UNIQUE(session_id, child_id) |

---

### New table: `attendance_conflicts`

Audit log created by sync when a previously-synced attendance record is overwritten.

| Column | Type | Rules |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `attendance_record_id` | INTEGER NOT NULL | FK → `attendance_records.id` |
| `overwritten_status` | TEXT NOT NULL | The value that was overwritten |
| `overwritten_by` | TEXT | Username that set the overwritten value |
| `overwritten_at` | TEXT NOT NULL | Timestamp of the overwritten record |
| `winning_status` | TEXT NOT NULL | The value that won (last-write) |
| `winning_by` | TEXT | Username that set the winning value |
| `winning_at` | TEXT NOT NULL | Timestamp of the winning record |
| `reviewed` | INTEGER DEFAULT 0 | Admin dismissed this conflict from the review list |
| `created_at` | TEXT NOT NULL | ISO timestamp when this conflict entry was created |

---

## Migration 018 — Pro-Rated Payment Audit Column

### Modified table: `payments` (additive column)

| New Column | Type | Rules |
|------------|------|-------|
| `prorated_calculated` | REAL | System-calculated pro-rated amount before any admin edit; NULL for full-period payments |

The admin-confirmed amount is stored in the existing `price` column. Both values are preserved for audit per FR-023.

---

## Sync Impact (`mongoSync.ts`)

Seven new Mongoose schemas are added to `SYNC_ENTITIES`. All follow the same integer `id` identity + `updated_at` last-write-wins convention as existing entities.

| Collection | Table | Notes |
|------------|-------|-------|
| `sync_salary_types` | `salary_types` | New |
| `sync_employee_roles` | `employee_roles` | New |
| `sync_service_definitions` | `service_definitions` | New |
| `sync_scheduled_sessions` | `scheduled_sessions` | New |
| `sync_session_teachers` | `session_teachers` | New (`updated_at` not needed; add for consistency) |
| `sync_attendance_records` | `attendance_records` | New — last-write-wins key entity |
| `sync_attendance_conflicts` | `attendance_conflicts` | New — append-only log; `reviewed` flag synced |

`employeeSchema` gains `role_id` and `salary_type_override_id` fields.
`paymentSchema` gains `prorated_calculated` field.

---

## Key Validation Rules

| Entity | Rule |
|--------|------|
| `salary_types.mode` | Must be one of the four defined modes |
| `salary_types.session_pct` | 0 < value ≤ 1 when mode = `per_session_pct` |
| `employee_roles.name` | UNIQUE; cannot be blank |
| `service_definitions.name` | UNIQUE; at least one price field must be non-null |
| `scheduled_sessions.session_date` | Valid ISO date; cannot be blank |
| `attendance_records.status` | Must be one of three allowed values |
| `attendance_records` | UNIQUE(session_id, child_id) — one record per child per session |
| `session_teachers` | UNIQUE(session_id, employee_id) |
