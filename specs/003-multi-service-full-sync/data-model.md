# Phase 1 Data Model: Multi-Service Enrollment & Full-Database Sync

Brownfield delta to the feature-001 SQLite schema (`electron/db/migrations/index.ts`). Identity convention: integer `id` is reused as the MongoDB identity for sync (existing pattern in `mongoSync.ts`); `settings` uses its `key` as identity. All synced tables carry `updated_at` (ISO string) and `synced` (0 = pending, 1 = reconciled).

## New entity: ServiceEnrollment (`child_services` table)

A single service a child attends, with its own billing details. A child has 1..N of these.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | sync identity (== Mongo `id`) |
| `child_id` | INTEGER NOT NULL | FK → `children(id)` `ON DELETE CASCADE` (deleting a child removes its enrollments) |
| `service` | TEXT NOT NULL | nursery / hosting / session (same vocabulary as today) |
| `unit` | TEXT NOT NULL | month / day / hour / session |
| `price` | REAL NOT NULL | per-enrollment price (overridable, defaults from settings pricing) |
| `is_active` | INTEGER DEFAULT 1 | enrollment active flag |
| `created_at` | TEXT NOT NULL | ISO |
| `updated_at` | TEXT NOT NULL | ISO; bumped on edit, `synced` reset to 0 |
| `synced` | INTEGER DEFAULT 0 | sync state |

**Constraints**: `UNIQUE(child_id, service)` — a child may enroll in a given service at most once (FR-003). FK `child_id` cascades on child delete.

**Lifecycle**: created when a service is added to a child → may be edited (unit/price/is_active) → **hard-deleted** on removal, writing a `tombstones` row. Removal does not touch historical `payments`.

## Modified entity: Child (`children` table)

- No new columns required. Existing `service/unit/price` columns are **retained for backward compatibility** but are no longer the billing source of truth; they are populated for legacy rows and may mirror the child's first/primary enrollment. New billing logic reads `child_services`.
- Conceptually, `Child` now exposes a `services: ServiceEnrollment[]` association (assembled in IPC responses, not a stored column).

## Modified entity: Payment (`payments` table)

| Change | Detail |
|--------|--------|
| ADD `service_id` | INTEGER, FK → `child_services(id)` **without** `ON DELETE CASCADE` (historical lines survive enrollment deletion — Decision 5). Nullable to tolerate legacy/tombstoned enrollments. |
| CHANGE uniqueness | from `UNIQUE(child_id, month, year)` → `UNIQUE(child_id, service_id, month, year)` (one line per service per month — FR-004). |
| UNCHANGED | `service`, `unit`, `quantity`, `price`, `total`, `paid`, `balance`, `status`, `notes`, timestamps, `synced`. These remain the **historical snapshot** for the line. |

**Derived (not stored)**: a child's monthly **combined total** = Σ line totals; **combined balance** = Σ line balances; **combined status** roll-up = `paid` if every line paid, else `partial` if any line paid/owed, else `unpaid` (FR-006, FR-006a). Computed in `payments:get`.

**Status (per line)**: unchanged — `calculatePayment(quantity, price, paid)` → paid ≥ total ⇒ `paid` (overpay allowed, negative balance), 0 < paid < total ⇒ `partial`, paid = 0 ⇒ `unpaid`.

## New entity: Tombstone (`tombstones` table)

Records a hard deletion so it can propagate to other devices (FR-016).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | sync identity |
| `entity` | TEXT NOT NULL | source table name, e.g. `child_services` |
| `record_id` | INTEGER NOT NULL | deleted row's id in that table |
| `deleted_at` | TEXT NOT NULL | ISO timestamp of deletion |
| `synced` | INTEGER DEFAULT 0 | sync state |

**Constraints**: `UNIQUE(entity, record_id)`. **Mongo**: collection `sync_tombstones`. On `pull`, each cloud tombstone deletes the matching local row (if present) and is recorded locally so it is not re-applied endlessly.

## Modified entity: Setting (`settings` table)

| Change | Detail |
|--------|--------|
| ADD `updated_at` | TEXT — bumped on write, drives conflict resolution |
| ADD `synced` | INTEGER DEFAULT 0 |
| Identity | the existing `key` column (string) is the Mongo identity, not an integer id |
| Sync denylist | device-local keys are **excluded** from sync — at minimum `sync_mongo_uri` (Decision 7), so a device cannot overwrite another's connection string |

## New entity: ImportedSnapshot (`imported_snapshots` table)

Raw rows captured from non-relational workbook sheets (📊 داشبورد، 📄 كشف حساب) during full-workbook import (FR-023, FR-025). Stored as snapshots; the live dashboard/statement views continue to recompute from source data and are **not** driven by this table (spec edge case).

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK AUTOINCREMENT | sync identity (== Mongo `id`) |
| `sheet` | TEXT NOT NULL | source sheet name, e.g. `داشبورد`, `كشف حساب` |
| `row_index` | INTEGER NOT NULL | 1-based source row within the sheet |
| `data_json` | TEXT NOT NULL | the row's resolved cell values serialized as JSON |
| `imported_at` | TEXT NOT NULL | ISO timestamp of the import |
| `updated_at` | TEXT NOT NULL | ISO; drives conflict resolution |
| `synced` | INTEGER DEFAULT 0 | sync state |

**Constraints**: `UNIQUE(sheet, row_index)` — re-importing the same sheet upserts rather than duplicating. **Mongo**: collection `sync_imported_snapshots`. Deletions propagate via the shared `tombstones` table (`entity='imported_snapshots'`).

## Import targets for the formerly-ignored sheets

| Sheet | Import target | Notes |
|-------|---------------|-------|
| ⚙️ الإعدادات (Settings) | `settings` table (existing) | Upsert key/value; bump `updated_at`, `synced=0`. Device-local keys (e.g. `sync_mongo_uri`) are never overwritten. |
| 🎯 تخطيط التارجت (Target Planning) | `settings` keys consumed by the derived targets module | `target_profit_pct`, `nursery_monthly`, `hosting_monthly`, `session_hourly`, etc. No `targets` table exists — targets are computed on read. |
| 📊 داشبورد (Dashboard) | `imported_snapshots` (snapshot) | Stored verbatim; live dashboard keeps recomputing. |
| 📄 كشف حساب (Account Statement) | `imported_snapshots` (snapshot) | Stored verbatim; live statements keep recomputing. |

All four import paths surface a specific, actionable reason for any row that cannot be applied (FR-026); the reference workbook MUST import with **zero** row errors (SC-009).

## Synced entity coverage (`SYNC_ENTITIES` registry)

| Entity | Table | Mongo model | Identity | New? |
|--------|-------|-------------|----------|------|
| children | `children` | `sync_children` | `id` | existing |
| **child_services** | `child_services` | `sync_child_services` | `id` | **new** |
| payments | `payments` | `sync_payments` | `id` | existing (now carries `service_id`) |
| employees | `employees` | `sync_employees` | `id` | existing |
| salary_payments | `salary_payments` | `sync_salary_payments` | `id` | existing |
| expenses | `expenses` | `sync_expenses` | `id` | existing |
| **users** | `users` | `sync_users` | `id` | **new** (hashed passwords only) |
| **settings** | `settings` | `sync_settings` | `key` | **new** (with denylist) |
| **tombstones** | `tombstones` | `sync_tombstones` | `id` | **new** |
| **imported_snapshots** | `imported_snapshots` | `sync_imported_snapshots` | `id` | **new** (dashboard/statement snapshots) |

## Migrations (appended to the existing versioned runner)

| Name | Action |
|------|--------|
| `004_child_services` | Create `child_services` (+ `UNIQUE(child_id, service)`); backfill one row per existing child from its `service/unit/price`. |
| `005_payments_service_id` | Table-rebuild `payments` adding `service_id` and re-keying `UNIQUE(child_id, service_id, month, year)`; link each legacy payment to its child's backfilled enrollment. |
| `006_tombstones` | Create `tombstones` (+ `UNIQUE(entity, record_id)`). |
| `007_settings_sync_columns` | Add `updated_at` + `synced` to `settings`; initialize `updated_at`. |
| `008_users_sync_columns` | Add sync columns to `users` (already applied). |
| `009_backfill_missing_child_services` | Backfill enrollments for any children missing one (already applied). |
| `010_imported_snapshots` | Create `imported_snapshots` (+ `UNIQUE(sheet, row_index)`). |

All migrations are additive/rebuild-in-place and preserve existing data (Constitution guardrail). Migrations `004`–`009` already exist in the runner; `010` is the only new one for this scope.

## Relationships (after change)

```text
Child 1───N ServiceEnrollment 1───N Payment
  │                                   ▲
  └──────────────1───N────────────────┘  (payments.child_id retained; payments.service_id added)

Tombstone ──references──▶ any synced table (entity, record_id)
```
