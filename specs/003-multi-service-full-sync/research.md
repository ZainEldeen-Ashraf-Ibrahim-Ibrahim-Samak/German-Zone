# Phase 0 Research: Multi-Service Enrollment & Full-Database Sync

This feature is a brownfield extension. Research focused on *how the existing code already works* and the smallest changes that satisfy the spec, rather than greenfield technology selection. The relevant existing files were read: `electron/db/connection.ts`, `electron/db/migrations/index.ts`, `electron/ipc/childrenIPC.ts`, `electron/ipc/paymentsIPC.ts`, `electron/ipc/syncIPC.ts`, `electron/services/mongoSync.ts`.

## Decision 1 — Model multiple services as a child_services (enrollment) table

- **Decision**: Add a `child_services` table (one row per child per service) holding `service`, `unit`, `price`, `is_active`, timestamps, and `synced`. The `children` table keeps its existing `service/unit/price` columns for backward compatibility during migration but they are no longer the source of truth for billing; new code reads enrollments.
- **Rationale**: A child→services relationship is one-to-many; a junction/child table is the normalized fit and lets each service carry its own unit/price (FR-002). It also maps cleanly onto the existing sync engine (each enrollment is an independent record with its own `id`/`synced`, so per-record merge and tombstones work without special cases).
- **Alternatives considered**:
  - *JSON array of services on the `children` row* — rejected: breaks per-service payment uniqueness, per-service conflict resolution, and dashboard revenue-by-service queries; not queryable in SQL.
  - *Keep single `service` column and allow duplicate child rows* — rejected: corrupts identity, search, and statements.

## Decision 2 — Re-key payments on (child_id, service_id, month, year)

- **Decision**: Add `service_id` (FK → `child_services.id`) to `payments` and change the uniqueness constraint from `UNIQUE(child_id, month, year)` to `UNIQUE(child_id, service_id, month, year)`. `payments:generate` iterates each active enrollment and inserts one row per enrollment. The denormalized `service/unit/price` already on the payment row are retained as the historical snapshot.
- **Rationale**: The current `UNIQUE(child_id, month, year)` constraint is the single hard blocker to multi-service billing (FR-004). Re-keying is the minimal schema change that allows one line per service while keeping every existing column. Snapshotting service/unit/price on the payment row keeps historical months unchanged when an enrollment is later edited or removed (FR-007).
- **Implementation note**: `node:sqlite` (like SQLite generally) cannot alter a UNIQUE constraint in place, so migration `005` follows the table-rebuild pattern already used by migration `002` (create `payments_new`, copy, drop, rename). During copy, each legacy payment is matched to its child's single backfilled enrollment to populate `service_id`.
- **Alternatives considered**: *Composite payments keyed only by child+month with a services blob* — rejected for the same reasons as Decision 1.

## Decision 3 — Backfill existing single-service children into one enrollment each

- **Decision**: Migration `004` inserts, for every existing child, one `child_services` row from that child's current `service/unit/price`, reusing a deterministic mapping so legacy payments can be linked in migration `005`.
- **Rationale**: Preserves all historical data with zero manual rework (spec Assumption: "existing single-service children are treated as children with exactly one service enrollment"). Guarantees acceptance scenario US1.4 (a one-service child gaining a second service) starts from a valid state.
- **Alternatives considered**: *Lazy backfill on first edit* — rejected: leaves the DB in a mixed state, complicating payment generation and sync.

## Decision 4 — Per-child status is a derived roll-up, not a stored column

- **Decision**: Each payment line keeps its own `status` (unchanged `calculatePayment`). The child-level status ("paid" all paid / "partial" some / "unpaid" none) is computed on read in `payments:get` by grouping that month's lines per child. Nothing new is stored.
- **Rationale**: Matches the clarified requirement (FR-006a) and avoids a denormalized field that could drift out of sync with the line statuses. Cheap to compute for ~100–150 children.
- **Alternatives considered**: *Store a child_status column* — rejected (YAGNI, drift risk, extra write path).

## Decision 5 — Service removal = hard delete + tombstone

- **Decision**: Removing a service deletes the `child_services` row and writes a `tombstones` row `(entity='child_services', record_id=<id>)`. Previously recorded payment lines for that service are retained (they reference a now-deleted enrollment but keep their snapshot columns). Child deactivation remains a soft delete (`is_active = 0`), unchanged.
- **Rationale**: Clarified answer (FR-007). The payment FK currently uses `ON DELETE CASCADE` to `children`; the new `payments.service_id` FK to `child_services` MUST be defined **without** cascade (or be nullable) so deleting an enrollment does not erase historical payments.
- **Alternatives considered**: *Soft-deactivate enrollment* — rejected by the user's clarification; *block removal when payments exist* — rejected by the user's clarification.

## Decision 6 — Propagate deletions with a uniform tombstones table

- **Decision**: Add a single `tombstones` table `(id, entity, record_id, deleted_at, synced)` and a matching `sync_tombstones` Mongo collection. Any hard delete (currently: service-enrollment removal; extensible to others) writes a tombstone. `sync:push` uploads unsynced tombstones; `sync:pull` reads cloud tombstones and deletes the corresponding local rows so a deletion does not reappear (FR-016).
- **Rationale**: The existing sync has **no deletion propagation** — `pull` only inserts/updates and `push` only sends `synced = 0` rows, so a locally deleted row silently resurrects on the next pull. A central tombstones table is uniform across all entity types and reuses the existing id==_id convention. Minimal and YAGNI-aligned versus a soft-delete column on every table.
- **Alternatives considered**:
  - *`is_deleted` flag per table* — rejected: touches every table and every read query; more invasive.
  - *Full-snapshot overwrite on each sync* — rejected by the user's clarification (per-record merge chosen) and risks wiping concurrent edits.

## Decision 7 — Expand SYNC_ENTITIES to cover the whole database

- **Decision**: Add `child_services`, `users`, and `settings` to `SYNC_ENTITIES` (with new Mongoose models) so a sync truly reconciles the entire database (FR-012). `child_services` and `users` follow the existing integer-`id` pattern. `settings` is keyed by its `key` column (string identity) and needs `updated_at` + `synced` columns added (migration `007`).
- **Rationale**: The spec explicitly enumerates settings and users as part of "everything". Syncing `users` keeps logins consistent across devices; passwords are already bcrypt-hashed so no plaintext is transmitted.
- **Open caution / flagged for tasks**: The `settings` table stores the `sync_mongo_uri` itself and device-local branding asset paths. **Decision**: exclude the `sync_mongo_uri` key (and any other device-local keys) from settings sync to avoid one device overwriting another's connection string; sync all other settings keys. This is implemented as a key denylist in the settings sync path.
- **Alternatives considered**: *Leave users/settings local-only* — rejected: contradicts FR-012's "complete data set" and the user's literal "take everything to all db".

## Decision 8 — Per-record merge already satisfies FR-015a/FR-017; only deletions + entity coverage are missing

- **Decision**: Reuse the existing `resolveConflict` (most-recent `updated_at` wins, higher `id` as tie-break) and the existing per-record pull loop unchanged for conflict handling. The only behavioral additions are tombstone handling (Decision 6) and entity coverage (Decision 7), plus making auto-sync run **push + pull** (today it only pushes when `children` are unsynced).
- **Rationale**: Concurrent edits to *different* records already survive because each record is reconciled independently (FR-015a). Same-record conflicts already resolve deterministically and identically on every device (FR-017). Confirming this avoids rebuilding a working engine.
- **Alternatives considered**: *Field-level merge* — rejected: not required by the spec; record-level most-recent-wins is the clarified default and is far simpler.

## Decision 9 — Auto-sync performs full reconciliation

- **Decision**: Change `startAutoSync` to invoke both push and pull (full reconciliation) on each interval tick when connected, instead of only pushing when `children` have unsynced rows (FR-019).
- **Rationale**: The spec requires auto-sync to perform "the same full reconciliation as a manual sync". The current implementation can miss cloud-originated changes and any non-children local changes.
- **Alternatives considered**: *Push-only auto-sync* — rejected: devices would not converge automatically.

## Decision 10 — Import all four formerly-ignored sheets instead of skipping them

- **Decision**: Remove the four sheets (📊 داشبورد، ⚙️ الإعدادات، 📄 كشف حساب، 🎯 تخطيط التارجت) from `isIgnoredSheet` in `importService.ts` and add a dedicated importer per sheet kind. Every sheet of `Nursery_V4_Final_5.xlsx` is now persisted (FR-023, SC-009).
- **Rationale**: The clarified scope requires the full workbook to import with zero row errors and for all data to survive sync and backup. The four sheets were previously dropped, so their data never reached the DB.
- **Alternatives considered**: *Keep ignoring dashboard/statement and import only settings/target* — rejected by the user's clarification ("All four as stored data").

## Decision 11 — Targets and dashboard/statement are DERIVED; reconcile "store as data" accordingly

- **Decision**: There is **no `targets`, `dashboard`, or `statement` table** — `target:get` (targetIPC), the dashboard, and child statements are all computed on read from `payments`/`expenses`/`salary_payments`/`settings`. Therefore:
  - **Target Planning (🎯 تخطيط التارجت)** import = upsert the planning/pricing **settings keys** the targets module already consumes (`target_profit_pct`, `nursery_monthly`, `hosting_monthly`, `session_hourly`, …). This honors the clarification "reuse the existing targets module" — its inputs live in `settings`.
  - **Dashboard (📊 داشبورد)** and **Account Statement (📄 كشف حساب)** rows are stored verbatim as snapshots (Decision 12); the live views keep recomputing and are **not** overridden (spec edge case).
- **Rationale**: Honoring the literal "store all four" while not corrupting the single source of truth. Writing target config to `settings` makes the imported targets immediately effective in the existing derived module with no new table.
- **Alternatives considered**: *Create real targets/dashboard/statement tables and have the app read them* — rejected: large, invasive rewrite of working derived modules for snapshot data that goes stale; violates YAGNI and the "snapshot, not source of truth" edge case.

## Decision 12 — One generic `imported_snapshots` table for non-relational sheets

- **Decision**: Add a single `imported_snapshots(id, sheet, row_index, data_json, imported_at, updated_at, synced)` table holding raw rows of the Dashboard and Account Statement sheets (and any future non-relational sheet), keyed `UNIQUE(sheet, row_index)`. One table, one Mongo model, one sync entity.
- **Rationale**: These sheets have no stable relational schema; capturing them as JSON rows preserves the data for backup/sync without forcing a brittle column mapping, and keeps the change minimal (one table vs three).
- **Alternatives considered**: *Three sheet-specific tables* — rejected (YAGNI); *store as settings blobs* — rejected (pollutes settings, breaks per-row identity needed for sync/tombstones).

## Decision 13 — Imported data joins the full sync (push/pull + tombstones)

- **Decision**: `settings` is already in `SYNC_ENTITIES` (so imported settings/target config syncs for free). Add `imported_snapshots` as a new sync entity (Mongo `sync_imported_snapshots`, integer-`id` identity) and support its deletions via the existing `tombstones` mechanism (FR-027).
- **Rationale**: The clarification requires the newly imported data to push/pull and propagate deletions like every other entity. Reuses the Decision 6/7/8 machinery with one more entity.
- **Alternatives considered**: *Local-only imported data* — rejected by the clarification.

## Decision 14 — Backup checkpoints WAL; restore stays a whole-file copy (round-trip guarantee)

- **Decision**: Keep `storage:backup`/`storage:restore` as whole-file SQLite copies (they already round-trip every table, including new ones), but run `PRAGMA wal_checkpoint(TRUNCATE)` **before** copying so all committed pages are folded into the `.db` file and nothing is stranded in `-wal`. A round-trip test asserts identical per-table counts (FR-028, SC-010).
- **Rationale**: The DB runs in WAL mode (`journal_mode = WAL`); copying only `nursery.db` while recent commits live in `nursery.db-wal` would silently drop data, breaking the round-trip guarantee. Checkpointing closes that gap with no format change.
- **Alternatives considered**: *Also copy the `-wal`/`-shm` sidecars* — rejected: fragile and version-sensitive; checkpointing is the canonical fix. *Logical (SQL dump) export* — rejected: larger change than needed; file copy already satisfies the requirement once checkpointed.

## Resolved unknowns

All Technical Context items are concrete (brownfield code inspected); **no NEEDS CLARIFICATION markers remain**. The spec ambiguities were resolved across two `/speckit-clarify` sessions: (1) sync model = per-record merge, service removal = hard delete + tombstone, combined status = derived roll-up; (2) import all four ignored sheets as stored data, target config into the existing (settings-driven) targets module, imported data joins full sync + tombstones, success = zero row errors + backup round-trip. All are reflected above.
