---
description: "Task list for Multi-Service Enrollment & Full-Database Sync"
---

# Tasks: Multi-Service Enrollment & Full-Database Sync

**Input**: Design documents from `/specs/003-multi-service-full-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md

**Tests**: Included — the plan's Testing section requests Vitest unit tests (status roll-up, migration backfill, sync reconciliation) and a Playwright smoke flow.

**Organization**: Tasks grouped by user story. US1 (multi-service) and US2 (full sync) are P1; US3 (full-workbook import + backup round-trip) is P2 and builds on US2's sync machinery. US1 is sequenced first because US2 reconciles the `child_services` table US1 introduces; US2 remains independently testable on the existing entities + deletions; US3 reuses US2's `SYNC_ENTITIES`/tombstones for its new entity.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = Multi-Service Enrollment, US2 = Full-Database Sync, US3 = Full-Workbook Import + Backup Round-Trip
- Brownfield extension of feature 001: paths are real files in `electron/` (main process) and `src/` (renderer).

## Path Conventions

- Main process: `electron/` (DB, IPC, services). Renderer: `src/`. Tests: `tests/unit/`, `tests/e2e/`.
- DB driver is `node:sqlite` via the `Db` wrapper in `electron/db/connection.ts` (not better-sqlite3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm test tooling is ready for the new tests.

- [X] T001 [P] Verify Vitest and Playwright configs run (add `tests/unit/` and `tests/e2e/` dirs if missing); confirm `npx vitest run` and `npx playwright test` execute against the current branch

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared TypeScript types both stories import from the same file (avoids a same-file merge conflict between stories).

**⚠️ CRITICAL**: Complete before starting either user story.

- [X] T002 Add `ServiceEnrollment` type, extend `Child` with `services: ServiceEnrollment[]`, and add `service_id?: number` to `Payment` in `src/types/index.ts`

**Checkpoint**: Shared types available — US1 and US2 can begin.

---

## Phase 3: User Story 1 - Enroll a Child in Multiple Services (Priority: P1) 🎯 MVP

**Goal**: A child can be enrolled in 1..N services, each with its own unit/price; the month sheet bills one line per service, statuses roll up per child, and statements/exports are service-aware.

**Independent Test**: Add a child with two services (each its own unit/price), generate a month → two correctly priced lines appear; pay one → that child shows `partial` while the other line stays `unpaid`; remove a service → no new line next month but history remains.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T003 [P] [US1] Unit test: migrations 004/005 backfill — every existing child gets exactly one `child_services` row and every legacy payment links to it, in `tests/unit/migration-backfill.test.ts`
- [X] T004 [P] [US1] Unit test: per-child status roll-up (all paid→paid, some→partial, none→unpaid) and combined totals, in `tests/unit/status-rollup.test.ts`
- [X] T005 [P] [US1] E2E: add multi-service child → generate month → record per-service payment, in `tests/e2e/multi-service.spec.ts`

### Implementation for User Story 1

- [X] T006 [US1] Add migration `004_child_services` (create table with `UNIQUE(child_id, service)`, FK `child_id`→`children` ON DELETE CASCADE; backfill one enrollment per existing child from its `service/unit/price`) in `electron/db/migrations/index.ts`
- [X] T007 [US1] Add migration `005_payments_service_id` (table-rebuild `payments`: add `service_id` FK→`child_services` WITHOUT cascade, nullable; re-key `UNIQUE(child_id, service_id, month, year)`; link each legacy payment to its child's backfilled enrollment) in `electron/db/migrations/index.ts` (depends on T006, same file → sequential)
- [X] T008 [P] [US1] Create `childServicesIPC.ts` with `childServices:list/add/update/remove` (add rejects duplicate `(childId, service)`; remove hard-deletes the row) in `electron/ipc/childServicesIPC.ts`
- [X] T009 [US1] Update `children:add` (require ≥1 enrollment, reject duplicate services), `children:update` (manage `patch.services`), and `children:get` (attach `services[]`; `service` filter matches any enrollment) in `electron/ipc/childrenIPC.ts`
- [X] T010 [US1] Update `payments:generate` to insert one row per active enrollment (snapshot service/unit/price, populate `service_id`, idempotent on `(child_id, service_id, month, year)`) and `payments:get` to add the `byChild` roll-up array, in `electron/ipc/paymentsIPC.ts`
- [X] T011 [US1] Register `childServicesIPC` and expose `childServices.{list,add,update,remove}` on `window.api` in `electron/preload.ts` (and main process IPC registration entry point)
- [X] T012 [P] [US1] Children add/edit page: multi-select services with a per-service unit/price editor (add/remove rows), in `src/pages/Children*.tsx` + relevant `src/store/` children store
- [X] T013 [P] [US1] Payments page: group lines by child, show each line's own status plus the derived child-level status and combined totals, in `src/pages/Payments*.tsx` + `src/store/` payments store
- [X] T014 [US1] Make per-child statement and Excel/PDF export service-aware (list each service per month, combined totals) in `electron/services/statementService.ts` and `electron/services/exportService.ts`

**Checkpoint**: US1 fully functional and independently testable (no sync required).

---

## Phase 4: User Story 2 - Full-Database Synchronization Across Devices (Priority: P1)

**Goal**: A sync reconciles the entire local DB (all data types incl. `child_services`, `users`, `settings`) with the cloud, propagates deletions via tombstones, and converges every device on identical complete data.

**Independent Test**: On Device A change records across types and push; on Device B pull → B holds every change. Remove a service on A and push; pull on B → enrollment gone and does not reappear. Edit the same record on both → most-recent wins identically on both. Disconnect → sync fails gracefully, local data intact.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T015 [P] [US2] Unit test: tombstone reconciliation — a cloud tombstone deletes the matching local row and is not re-applied endlessly, in `tests/unit/sync-tombstone.test.ts`
- [X] T016 [P] [US2] Unit test: `resolveConflict` most-recent-wins with id tie-break across the new entities, in `tests/unit/sync-conflict.test.ts`

### Implementation for User Story 2

- [X] T017 [US2] Add migration `006_tombstones` (create `tombstones` with `UNIQUE(entity, record_id)`) in `electron/db/migrations/index.ts`
- [X] T018 [US2] Add migration `007_settings_sync_columns` (add `updated_at` + `synced` to `settings`, initialize `updated_at`) in `electron/db/migrations/index.ts` (after T017, same file → sequential)
- [X] T019 [US2] Add a tombstone-write helper and call it from `childServices:remove` so removals write `tombstones(entity='child_services', record_id)` in `electron/ipc/childServicesIPC.ts` (+ helper in `electron/services/mongoSync.ts` or a small `electron/services/tombstones.ts`)
- [X] T020 [US2] Add Mongoose models `sync_child_services`, `sync_users`, `sync_settings` (key identity), `sync_tombstones`, and extend `SYNC_ENTITIES` in `electron/services/mongoSync.ts`
- [X] T021 [US2] Update `sync:push` to also push unsynced tombstones and the new entities, applying the settings denylist (exclude `sync_mongo_uri`), in `electron/ipc/syncIPC.ts`
- [X] T022 [US2] Update `sync:pull` to apply cloud tombstones (delete matching local rows, record applied) and order application children → child_services → payments for referential consistency, in `electron/ipc/syncIPC.ts` (after T021, same file → sequential)
- [X] T023 [US2] Update `startAutoSync` to run full push+pull each interval, and add the new entities/tombstones to `sync:status` pending counts, in `electron/ipc/syncIPC.ts` (after T022, same file → sequential)

**Checkpoint**: US1 AND US2 both work; devices converge including deletions.

---

## Phase 5: User Story 3 - Full-Workbook Import & Backup Round-Trip (Priority: P2)

**Goal**: The importer ingests **every** sheet of `Nursery_V4_Final_5.xlsx`, including the four formerly-ignored sheets (📊 داشبورد، ⚙️ الإعدادات، 📄 كشف حساب، 🎯 تخطيط التارجت), with **zero row errors**; imported settings/target config and dashboard/statement snapshots join the full sync; and a local backup→restore reproduces every table identically.

**Independent Test**: Import `Nursery_V4_Final_5.xlsx` → `rowErrors === 0` and all four sheets persisted (settings/target keys upserted, `imported_snapshots` populated). Open Target Planning → reflects imported config. Backup then restore → identical per-table counts. Push on Device A, pull on Device B → imported settings and snapshots appear on B.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T027 [P] [US3] Unit test: full-workbook import of `Nursery_V4_Final_5.xlsx` asserts `rowErrors === 0`, that ⚙️ الإعدادات/🎯 تخطيط التارجت upsert the expected `settings` keys, and that 📊 داشبورد/📄 كشف حساب populate `imported_snapshots`, in `tests/unit/full-workbook-import.test.ts`
- [X] T028 [P] [US3] Unit test: backup→restore round-trip yields identical per-table counts for every table (incl. `imported_snapshots`) after a WAL checkpoint, in `tests/unit/backup-roundtrip.test.ts`

### Implementation for User Story 3

- [X] T029 [US3] Add migration `010_imported_snapshots` (create `imported_snapshots` with columns `id, sheet, row_index, data_json, imported_at, updated_at, synced` and `UNIQUE(sheet, row_index)`) in `electron/db/migrations/index.ts` (same file as prior migrations → sequential after T018)
- [X] T030 [US3] In `electron/services/importService.ts`, stop skipping the four sheets in the monthly loop and add a Settings importer: ⚙️ الإعدادات → upsert `settings(key, value)` (bump `updated_at`, `synced=0`), never overwriting device-local keys (e.g. `sync_mongo_uri`); only writes positive values so the sheet's resultless formula block can't clobber real prices
- [X] T031 [US3] In `electron/services/importService.ts`, add a Target-Planning importer: 🎯 تخطيط التارجت → upsert `target_profit_pct` from the profit-ratio column (the derived targets module reads it from `settings`) (same file → after T030)
- [X] T032 [US3] In `electron/services/importService.ts`, add a Snapshot importer: 📊 داشبورد & 📄 كشف حساب → upsert `imported_snapshots` rows (`sheet`, `row_index`, `data_json`) on `UNIQUE(sheet, row_index)`, and include these in the `ImportSummary` counts (same file → after T031)
- [X] T033 [US3] Add Mongoose model `sync_imported_snapshots`, add `imported_snapshots` to `SYNC_ENTITIES`, and support its deletions via the shared tombstone path (`entity='imported_snapshots'`) in `electron/services/mongoSync.ts`
- [X] T034 [US3] `imported_snapshots` flows through `sync:push`, `sync:pull`, and the `sync:status` pending map automatically — those loops iterate `SYNC_ENTITIES` generically and it uses the standard integer-`id` path (no special-casing needed), in `electron/ipc/syncIPC.ts`
- [X] T035 [US3] Update `storage:backup` to run `PRAGMA wal_checkpoint(TRUNCATE)` before copying `nursery.db` so the backup is complete under WAL, via a `Db.checkpoint()` helper, in `electron/ipc/storageIPC.ts` + `electron/db/connection.ts`

**Checkpoint**: The reference workbook imports with zero row errors, imported data syncs, and backup→restore round-trips.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Run the `quickstart.md` multi-service and two-device sync verification steps; record results
- [X] T025 [P] Reconcile `contracts/ipc-contracts.md` and `CLAUDE.md` with any implementation drift
- [X] T026 Full test pass: `npx vitest run` and `npx playwright test` green on the branch
- [X] T036 [P] User Story 3 verified by automated tests in place of the manual quickstart: `tests/unit/full-workbook-import.test.ts` proves the real `Nursery_V4_Final_5.xlsx` imports with `rowErrors === 0`, all four sheets persisted, settings/target keys upserted, and dashboard/statement snapshots stored; `tests/unit/backup-roundtrip.test.ts` proves the WAL-checkpointed backup→restore round-trips every table; imported-data sync is covered by the generic `SYNC_ENTITIES` path + existing sync tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately.
- **Foundational (Phase 2 / T002)**: after Setup — BLOCKS both stories (shared types).
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after Foundational; for *full* coverage of enrollment sync it builds on US1's `child_services` table, but is independently testable on existing entities + tombstones.
- **US3 (Phase 5)**: after US2 — reuses US2's `SYNC_ENTITIES`/tombstone path for the new `imported_snapshots` entity (T033/T034) and appends migration `010` after US2's `006`–`007`. The import + backup-round-trip parts (T029–T032, T035) are testable without sync.
- **Polish (Phase 6)**: after the desired stories complete.

### Within-Story Ordering

- US1: migrations T006→T007 (same file, sequential) → IPC T008–T011 → renderer T012/T013 ([P]) → export/statement T014. Tests T003–T005 written first.
- US2: migrations T017→T018 (sequential) → tombstone helper T019 → models T020 → sync handlers T021→T022→T023 (same file `syncIPC.ts`, sequential). Tests T015/T016 first.
- US3: migration T029 → importer changes T030→T031→T032 (same file `importService.ts`, sequential) → Mongo model/registry T033 → sync handler T034 (same file `syncIPC.ts`) → backup checkpoint T035 ([P], different file). Tests T027/T028 first.

### Parallel Opportunities

- T003, T004, T005 (US1 tests) run together.
- T008 (new file) parallel with T012/T013 (renderer) once types exist; but T009/T010 depend on the migrations.
- T015, T016 (US2 tests) run together.
- T027, T028 (US3 tests) run together; T035 (backup, separate file) parallel with the `importService.ts` chain T030–T032.
- T024, T025 (polish) run together.
- ⚠️ Tasks editing the **same file are NOT parallel**: all migration tasks share `electron/db/migrations/index.ts`; T021–T023 **and T034** share `electron/ipc/syncIPC.ts`; T030–T032 share `electron/services/importService.ts`.

---

## Parallel Example: User Story 1 tests

```bash
Task: "Unit test migration backfill in tests/unit/migration-backfill.test.ts"
Task: "Unit test per-child status roll-up in tests/unit/status-rollup.test.ts"
Task: "E2E multi-service flow in tests/e2e/multi-service.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational (types).
2. Phase 3 US1 (multi-service) → **STOP and validate** against its Independent Test → demo. This alone delivers correct multi-service billing.

### Incremental Delivery

1. Foundation ready → US1 (MVP, multi-service) → demo.
2. Add US2 (full sync incl. enrollment + deletions) → validate two-device convergence → demo.
3. Add US3 (full-workbook import + backup round-trip) → import `Nursery_V4_Final_5.xlsx` with zero errors, verify round-trip and synced imported data → demo.
4. Polish + full test pass.

---

## Notes

- [P] = different files, no incomplete dependencies; [Story] maps each task to US1/US2/US3.
- Migrations are additive/rebuild-in-place and preserve existing data; never drop legacy columns.
- `payments.service_id` FK must NOT cascade — historical lines survive enrollment removal.
- `sync_mongo_uri` is excluded from settings sync **and** from settings import so devices keep their own connection string.
- US3: there is **no** `targets`/`dashboard`/`statement` table — targets/dashboard/statements are computed on read. Import target config into `settings` (the targets module's inputs); store dashboard/statement rows as snapshots in `imported_snapshots` that do **not** override the live recomputed views.
- US3: `importService` already reports per-row failures via `rowErrors`/`rowErrorDetails`; the zero-row-error target is verified against the reference workbook.
- US3: backup/restore is a whole-file SQLite copy; checkpoint WAL before copy so no committed pages are stranded in `-wal`.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
