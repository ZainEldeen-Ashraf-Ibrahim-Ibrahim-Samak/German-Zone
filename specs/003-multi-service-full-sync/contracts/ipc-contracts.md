# Phase 1 Contracts: IPC Surface Delta

Only the **changes** to the feature-001 IPC surface are listed (full surface lives in `specs/001-nursery-management-system/contracts/ipc-contracts.md`). Every admin-only handler re-validates role server-side. Notation: `channel` → `args` ⇒ `result`. Types reference `data-model.md`.

## Children (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `children:get` | `{ search?, service?, activeOnly? }` | `Child[]` — each now includes `services: ServiceEnrollment[]` | all (read) |
| `children:add` | `ChildInput` **with `services: ServiceEnrollmentInput[]`** (1..N) | `Child` (with `services`) | admin |
| `children:update` | `{ id, patch }` — `patch.services?` may add/edit enrollments | `Child` (with `services`) | admin |
| `children:deactivate` | `{ id }` | `{ ok }` | admin |

- `children:get` filtering by `service` matches a child if **any** enrollment has that service (FR-011).
- `children:add` requires at least one service enrollment; duplicate services within the payload are rejected (FR-003).

## Child Services (new)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `childServices:list` | `{ childId }` | `ServiceEnrollment[]` | all (read) |
| `childServices:add` | `{ childId, service, unit, price }` | `ServiceEnrollment` | admin |
| `childServices:update` | `{ id, patch }` (`unit`, `price`, `is_active`) | `ServiceEnrollment` | admin |
| `childServices:remove` | `{ id }` | `{ ok }` — **hard delete** + writes a tombstone | admin |

- `add` rejects a duplicate `(childId, service)` (FR-003). `remove` deletes the enrollment and writes `tombstones(entity='child_services', record_id=id)`; existing payment lines are retained (FR-007).

## Payments (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `payments:get` | `{ month, year }` | `{ payments: Payment[], byChild: ChildPaymentRollup[], summary }` | all |
| `payments:generate` | `{ month, year }` | `{ created: number }` | all |
| `payments:update` | `{ id, quantity?, paid?, notes? }` | `Payment` | all |
| `payments:bulkPay` | `{ ids: number[] }` | `{ updated: number }` | all |

- `payments:generate` now creates **one row per active service enrollment** of each active child for `(month, year)`, idempotently (skips existing `(child_id, service_id, month, year)`), populating `service_id` and snapshotting `service/unit/price` from the enrollment (FR-004).
- `payments:get` adds `byChild`: each entry `{ child_id, child_name, combined_total, combined_paid, combined_balance, status }` where `status` is the derived roll-up (FR-006a); the flat `payments[]` still carries each line's own `service`, `service_id`, and `status`.
- `payments:update` and `bulkPay` operate on a single payment **line** (one service), unchanged semantics otherwise.

## Sync (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `sync:status` | — | adds `child_services`, `users`, `settings`, `tombstones` to `pending` map | admin |
| `sync:push` | — | `{ results }` — now also pushes unsynced **tombstones** and the new entities | admin |
| `sync:pull` | — | `{ results }` — applies cloud **tombstones** (deletes local rows) and pulls new entities | admin |
| `sync:auto-sync` | `{ enabled, intervalMinutes? }` | `{ autoSync, intervalMinutes? }` — interval now runs **push + pull** full reconciliation | admin |

- `push` order is parent-before-child where it matters, and tombstones are pushed so deletions reach the cloud (FR-013, FR-016).
- `pull` applies cloud records via the existing per-record merge (`resolveConflict`: most-recent `updated_at`, higher `id` tie-break — FR-015a, FR-017), then applies tombstones so deleted rows do not reappear (FR-016). Referential consistency preserved by applying `children` before `child_services` before `payments` (FR-018).
- `settings` sync excludes device-local keys (at minimum `sync_mongo_uri`) per `data-model.md` (Decision 7).
- All sync handlers fail gracefully when the cloud is unreachable, leaving local data intact (FR-021), and remain admin-only (FR-022).

## Storage / Import (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `storage:import` | `{ path? }` | `{ imported: ImportSummary }` | admin |
| `storage:backup` | — | `{ path }` | admin |
| `storage:restore` | `{ path? }` | `{ ok, restoredFrom }` | admin |

- `storage:import` now imports **every** sheet of the workbook, including the four formerly-ignored sheets (FR-023): ⚙️ الإعدادات → `settings`; 🎯 تخطيط التارجت → the settings keys the derived targets module reads; 📊 داشبورد and 📄 كشف حساب → `imported_snapshots` (snapshot rows). `ImportSummary` keeps its existing per-entity `{ imported, skipped }` counts and `rowErrors` + `rowErrorDetails`; the reference workbook MUST import with `rowErrors === 0` (FR-026, SC-009). Any unmappable row surfaces a specific reason in `rowErrorDetails` rather than being silently dropped.
- `storage:backup` runs `PRAGMA wal_checkpoint(TRUNCATE)` before copying `nursery.db` so the copied file is complete under WAL (FR-028). Restore remains a whole-file replace; a backup→restore round-trip yields identical per-table counts (SC-010).

## Sync (imported data)

- `imported_snapshots` is added to `SYNC_ENTITIES` (Mongo `sync_imported_snapshots`, integer-`id` identity), so it pushes/pulls and resolves conflicts like the other entities (FR-027). Its deletions propagate via the shared `tombstones` mechanism (`entity='imported_snapshots'`).
- Imported `settings` (including target config) sync through the existing `settings` entity, minus the device-local denylist.
- `sync:status` `pending` map gains an `imported_snapshots` count.

## Preload (`window.api`) additions

- `childServices: { list, add, update, remove }` mapped 1:1 to the channels above.
- `Child` and `Payment` TypeScript types in `src/types/index.ts` gain `services` / `service_id`; a new `ServiceEnrollment` type is exported.
