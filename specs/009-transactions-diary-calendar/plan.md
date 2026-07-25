# Implementation Plan: Transactions Timeline, Child Diary & Staff Calendar

**Branch**: `010-transactions-diary-calendar` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-transactions-diary-calendar/spec.md`

---

## Summary

Remove the Daily Billing page, its `daily_payments`/`daily_payment_transactions` tables, and their `SYNC_ENTITIES` registration entirely (historical data discarded, no migration). Replace it with a new **Transactions** tab that lists financial transactions filterable by day/week/month/custom range, derived from the existing `payments` records tied to `child_services`. Add a **Child Details** page presenting the child's timetable (from `child_services.lesson_days` + `teacher_id`/`service_teachers`), an illness-case-or-activity-diary panel (new `child_activities` table, media hosted on the existing Cloudinary integration), and a paid-vs-remaining balance summary. Add a shared **Calendar** page (new aggregation IPC, no new table) visible identically to admin and employee roles, built from the same timetable data plus scheduled sessions, with click-to-drill-down per day.

---

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js 20 LTS

**Primary Dependencies**:
- Electron 28 (IPC / preload / main process)
- React 18 + React Router DOM + Zustand (renderer)
- `node:sqlite` via the project's `Db` wrapper (`electron/db/connection.ts`) — **not** better-sqlite3
- Mongoose / MongoDB Atlas (cloud sync, via `electron/services/mongoSync.ts`)
- Existing Cloudinary integration (`electron/services/cloudinaryService.ts`) — extend for video upload (currently image-only)
- react-i18next (bilingual AR/EN)
- ExcelJS / pdfmake (unaffected by this feature)

**Storage**: SQLite (`node:sqlite`) for local data; MongoDB Atlas via Mongoose for cloud sync; Cloudinary for diary media (photo/video) — referenced by URL, not part of the SQLite/Mongo sync loop

**Testing**: Vitest (unit), Playwright (e2e) — matching existing project conventions

**Target Platform**: macOS / Windows desktop (Electron app)

**Project Type**: Desktop application (Electron + Vite + React renderer)

**Performance Goals**: Transactions list for a custom range of up to 1 year returns in < 5s (per spec SC-001); Calendar month view renders in < 500ms for up to 300 combined schedule entries

**Constraints**: Offline-capable; every new table row carries a `synced` flag where relevant to Mongo sync; role re-validated in every new/changed IPC handler; no new npm runtime dependencies (Cloudinary video upload uses the same signed REST call pattern already in place for images)

**Scale/Scope**: Up to ~300 active children, ~30 staff/teachers; Transactions view spans full payment history; Calendar aggregates a full month of schedule slots per view

## Constitution Check

*Constitution file contains unfilled template placeholders — no project-specific gates defined.*

**Applied standards** (derived from codebase conventions, matching prior features' plans):
- No new npm runtime dependencies — reuses existing IPC, Mongoose, Zustand, `node:sqlite` `Db` wrapper, Cloudinary REST integration
- New `child_activities` entity follows the established `synced` flag + `SYNC_ENTITIES` registration pattern
- New IPC modules registered in `main.ts` the same way as all other modules
- Migrations appended to the existing migrations array (additive style; the one table-drop migration is scoped only to the two tables the spec explicitly asks to remove)
- Role-based access control (admin vs. employee) enforced at IPC handler level for all new handlers
- Deviation: this feature *removes* a previously-shipped table/collection rather than only adding one — justified below in Complexity Tracking

## Project Structure

### Documentation (this feature)

```text
specs/009-transactions-diary-calendar/
├── spec.md
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── ipc-contracts.md ← Phase 1 output
└── checklists/
    └── requirements.md
```

### Source Code Layout

```text
electron/
├── db/migrations/index.ts
│   ├── ADD migration 036_child_activities        (new table: child_activities)
│   └── ADD migration 037_drop_daily_payments      (drops daily_payments, daily_payment_transactions)
├── ipc/
│   ├── transactionsIPC.ts        ← NEW: list transactions by day/week/month/custom range
│   ├── childActivitiesIPC.ts     ← NEW: CRUD for child diary/activity entries
│   ├── calendarIPC.ts            ← NEW: aggregated schedule + per-day drill-down
│   ├── dailyPaymentsIPC.ts       ← REMOVE (module deleted, import removed from main.ts)
│   ├── childServicesIPC.ts       ← MODIFY: expose timetable read (lesson_days + teacher) for child details
│   └── storageIPC.ts             ← MODIFY: remove daily_payments DELETE-all wiring
├── services/
│   ├── cloudinaryService.ts      ← MODIFY: add `uploadVideo` (resource_type=video) alongside existing `uploadImage`
│   └── mongoSync.ts              ← MODIFY: remove DailyPaymentModel/DailyPaymentTransactionModel + their SYNC_ENTITIES rows; add ChildActivityModel + SYNC_ENTITIES row
└── main.ts                       ← MODIFY: remove dailyPaymentsIPC registration, add transactionsIPC/childActivitiesIPC/calendarIPC registration

src/
├── pages/
│   ├── Payments/DailyPayments.tsx                 ← REMOVE
│   ├── Payments/DailyPaymentInstallmentsModal.tsx ← REMOVE
│   ├── Transactions/Transactions.tsx              ← NEW: range-filterable transactions list
│   ├── Children/ChildDetails.tsx                  ← NEW: timetable + illness/activity diary + paid/remaining summary
│   └── Calendar/Calendar.tsx                      ← NEW: shared calendar page, day drill-down
├── store/
│   ├── useDailyPaymentsStore.ts     ← REMOVE
│   ├── useTransactionsStore.ts      ← NEW
│   ├── useChildActivitiesStore.ts   ← NEW
│   └── useCalendarStore.ts          ← NEW
└── App.tsx                          ← MODIFY: remove Daily Billing route/nav entry, add Transactions/Calendar routes + Children/:id/details route

preload bridge file (window.api)
└── additions for transactions.*, childActivities.*, calendar.*; removal of dailyPayments.*
```

**Structure Decision**: Existing single-project Electron+Vite+React layout is kept (`electron/` main process, `src/` renderer). No new top-level projects. New IPC modules mirror the existing one-file-per-domain pattern (e.g., `attendanceIPC.ts`, `serviceTeachersIPC.ts`); new renderer pages/stores mirror existing per-feature page + Zustand store pairs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Removing a previously-shipped table/collection (`daily_payments`, `daily_payment_transactions`) and its Mongo sync entry, rather than a purely additive change | Spec explicitly requires deleting the Daily Billing tab, its data, and its Mongo sync (FR-001, confirmed via clarification: discard entirely, no migration) | Keeping the old table read-only alongside the new Transactions view was considered, but it would leave a dead, confusing data source and contradicts the explicit "delete it from here and mongo sync" requirement |
