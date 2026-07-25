# Implementation Plan: Multi-Service Enrollment & Full-Database Sync

**Branch**: `003-multi-service-full-sync` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-multi-service-full-sync/spec.md`

## Summary

Three enhancements to the existing Nursery & Autism Center Management System:

1. **Multi-service enrollment** — a child may be enrolled in more than one service at once, each service carrying its own unit/quantity/price. The monthly payment sheet bills one line per enrolled service, statuses roll up per child, and statements/dashboard/exports become service-aware.
2. **Full-database synchronization** — a sync reconciles the *entire* local SQLite database (all data types, now including service enrollments, users, and settings) with the MongoDB cloud target, propagates deletions via tombstones, and converges every device on the same complete data set.
3. **Full-workbook import + backup round-trip** — the importer ingests **every** sheet of `Nursery_V4_Final_5.xlsx`, including the four previously *ignored* sheets (📊 داشبورد، ⚙️ الإعدادات، 📄 كشف حساب، 🎯 تخطيط التارجت), with **zero row errors**; the imported data joins the full sync; and a local backup→restore reproduces every table identically.

**Technical approach**: Extend the established Electron main-process data layer rather than introduce new architecture. Add a `child_services` (service enrollment) table and re-key `payments` on `(child_id, service_id, month, year)`; backfill existing single-service children into one enrollment each via a versioned migration. Make `payments:generate` iterate a child's active enrollments. Add a derived per-child status roll-up in `payments:get` (each line keeps its own status). For sync, add a uniform `tombstones` table and a `sync_tombstones` Mongo collection so hard deletes propagate; extend `SYNC_ENTITIES` to include `child_services`, `users`, and `settings`; and make auto-sync run a full push+pull reconciliation. Per-record merge with most-recent-change-wins already exists and is reused.

For the **full-workbook import**, stop treating the four sheets as ignored and route each to the right store: **Settings (⚙️ الإعدادات)** upserts into the existing `settings` table; **Target Planning (🎯 تخطيط التارجت)** writes the planning/pricing **settings keys** the existing *derived* targets module already reads (`target_profit_pct`, `nursery_monthly`, …) — there is no `targets` table, targets are computed on read, so "reuse the targets module" means feeding its settings inputs. **Dashboard (📊 داشبورد)** and **Account Statement (📄 كشف حساب)** are non-relational aggregate sheets, so their rows are captured verbatim in one generic `imported_snapshots` table (`sheet`, `row_index`, `data_json`) as snapshots that do **not** override the live recomputed views (spec edge case). `imported_snapshots` joins `SYNC_ENTITIES` (+ tombstones) so it propagates like every other entity. Backup stays a whole-file SQLite copy (which already round-trips any new table) but gains a **WAL checkpoint** before copy so no committed pages are stranded in the `-wal` file. The per-row error reporting already added to `importService` makes the zero-row-error target verifiable.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 20.x (Electron 28 main process); React 18 renderer.

**Primary Dependencies**: Electron 28, React 18 + react-router-dom 6, Vite 5 + vite-plugin-electron, Tailwind CSS 3, Zustand 4, **`node:sqlite` (built-in `DatabaseSync`) via the `Db` wrapper in `electron/db/connection.ts`** (local DB, main process — *not* better-sqlite3), ExcelJS 4, pdfmake, mongoose 8 (MongoDB sync), bcryptjs, recharts 2, react-i18next/i18next 23, date-fns 2.

**Storage**: Local SQLite file (`node:sqlite`) as system of record; MongoDB Atlas as the cloud reconciliation target. Integer SQLite `id` is reused as the Mongo `_id`/identity for deterministic conflict resolution (existing convention in `mongoSync.ts`).

**Testing**: Vitest for main-process business logic — payment calc (unchanged), new per-child status roll-up, migration backfill correctness, sync reconciliation (conflict + tombstone application), **full-workbook import of `Nursery_V4_Final_5.xlsx` asserting zero `rowErrors` and that all four formerly-ignored sheets are persisted (SC-009)**, and a **backup→restore round-trip asserting identical per-table counts (SC-010)**. Playwright smoke flow for: add multi-service child → generate month → record per-service payments. Contract check that the new/changed IPC surface matches the documented contract.

**Target Platform**: Windows 11 primary; cross-platform packaging via electron-builder (Windows/.exe, macOS/.dmg, Linux).

**Project Type**: Desktop application (Electron) — main process + renderer, single repository. Brownfield extension of feature 001.

**Performance Goals**: A first-time full sync of ~100 children with multiple services each completes and converges the receiving device without freezing the UI (SC-007). Generating/refreshing a month sheet for that volume stays responsive (carried from SC-001 of feature 001).

**Constraints**: Offline-capable for all non-sync features. Data/IO libraries (`node:sqlite`, ExcelJS, mongoose) stay main-process only; renderer access is via `window.api` IPC only (`contextIsolation: true`, `nodeIntegration: false`). Sync is admin-only and re-validated in IPC handlers. Migrations must be backward-compatible and preserve existing single-service data and recorded payment history.

**Scale/Scope**: ~100–150 children (now × 1–3 services each), ~11 employees, 12 months × multiple years of payment rows, single concurrent user per machine, 2–3 synced devices per center.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an **unpopulated template** — placeholder principles only, not ratified. There are therefore **no binding constitutional gates**.

Self-imposed guardrails (carried from feature 001, still honored here):
- **Process isolation**: `node:sqlite`, ExcelJS, mongoose remain main-process only; renderer talks to them solely via IPC.
- **No volatile storage**: all persistent data in SQLite, never `localStorage`.
- **Security defaults**: context isolation on, node integration off; passwords stay hashed (the `users` rows added to sync carry already-hashed passwords); sync/admin IPC handlers re-check role.
- **Backward-compatible migrations**: new tables/columns added via the existing versioned migration runner; existing data backfilled, never dropped.
- **Simplicity / YAGNI**: reuse the existing per-record merge engine; add the *minimum* (one enrollment table, one tombstones table, plus a single generic `imported_snapshots` table instead of three sheet-specific tables) rather than a new sync framework. Targets/dashboard/statement stay **derived** for display — imported rows are snapshots only, never a second source of truth.

**Gate result**: PASS (no violations; Complexity Tracking left empty).

## Project Structure

### Documentation (this feature)

```text
specs/003-multi-service-full-sync/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — decisions on enrollment modeling, tombstones, entity expansion
├── data-model.md        # Phase 1 output — child_services, re-keyed payments, tombstones, settings/users sync
├── quickstart.md        # Phase 1 output — how to exercise multi-service + multi-device sync locally
├── contracts/
│   └── ipc-contracts.md # Phase 1 output — delta to the IPC surface (child-services, payments, sync)
├── checklists/
│   └── requirements.md  # Created by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root) — files touched/added by this feature

```text
electron/
├── db/
│   └── migrations/
│       └── index.ts             # ADD migrations: 004_child_services (+ backfill),
│                                #   005_payments_service_id (rebuild + re-key uniqueness),
│                                #   006_tombstones, 007_settings_sync_columns,
│                                #   008_users_sync_columns, 009_backfill_missing_child_services,
│                                #   010_imported_snapshots (NEW: generic sheet-snapshot table)
├── ipc/
│   ├── childrenIPC.ts           # child add/update now manages 1..N service enrollments
│   ├── childServicesIPC.ts      # NEW: list/add/remove a child's service enrollments
│   ├── paymentsIPC.ts           # generate one row per active enrollment; get returns per-child status roll-up
│   ├── syncIPC.ts               # push/pull tombstones; full push+pull auto-sync; +imported_snapshots
│   └── storageIPC.ts            # backup checkpoints WAL before copy (round-trip guarantee)
├── services/
│   ├── importService.ts         # stop ignoring the 4 sheets: Settings→settings,
│   │                            #   Target→settings keys, Dashboard/Statement→imported_snapshots
│   └── mongoSync.ts             # ADD ChildServiceModel, UserModel, SettingModel, TombstoneModel,
│                                #   ImportedSnapshotModel; extend SYNC_ENTITIES
└── preload.ts                   # expose new childServices.* methods on window.api

src/
├── types/index.ts               # ADD ServiceEnrollment; Child gains services[]; Payment gains service_id
├── pages/Children*.tsx          # multi-select services with per-service unit/price editor
├── pages/Payments*.tsx          # group rows by child; show derived child status + per-line status
└── store/                       # children/payments stores updated for the new shapes

tests/
├── unit/                        # vitest: status roll-up, migration backfill, tombstone reconciliation,
│                                #   full-workbook import (zero rowErrors), backup→restore round-trip
└── e2e/                         # playwright: multi-service child → generate → per-service pay
```

**Structure Decision**: Brownfield extension of the feature-001 Electron layout (`electron/` main process + `src/` renderer). No new top-level structure is introduced; the change is concentrated in the DB migrations, the children/payments/sync IPC handlers, the Mongo model registry, and the corresponding renderer pages. The IPC contract delta is documented in `contracts/ipc-contracts.md`; entities in `data-model.md`.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
