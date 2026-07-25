# Implementation Plan: Printing & Export System + Attendance Edit Approval Workflow

**Branch**: `007-printing-export-attendance-approval` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-printing-export-attendance-approval/spec.md`

## Summary

Two independent slices, both building on existing infrastructure rather than new subsystems:

1. **Printing & Export**: The app already has a full main-process export engine (`exportService.ts` /
   ExcelJS, `pdfService.ts` / pdfmake, `exportHeader.ts` for branding/logo/timestamp, `exportIPC.ts`) —
   but **no UI page currently calls it**, and it only supports Excel/PDF for month/year-scoped legacy
   reports (`salaries`, `expenses`, `child` statement), not the newer attendance-driven Payroll Report
   (`PayrollReport.tsx`, feature 006) or a dedicated Financial Transactions view. This feature (a) adds
   Print/Export PDF/Export Excel/Export CSV actions to the four report screens named in the spec, each
   respecting the report's live on-screen filters/sort/date-range, and (b) extends the export engine with
   new build paths for the Payroll Report and Financial Transactions Report shapes, reusing the existing
   branding header, styling constants, and file-save-dialog pattern. "Print" is implemented as an
   in-app print-preview (branded HTML rendered from the same data used for PDF export) using the browser
   print dialog — no new native dependency.

2. **Attendance Edit Approval Workflow**: `attendance:record` (the existing upsert handler in
   `attendanceIPC.ts`) is currently open to any authenticated user and freely overwrites prior rows. This
   feature adds a lock: once an `attendance_records` row exists, `attendance:record` rejects further
   direct writes to it from non-admin users (admins keep direct-write access per spec Assumptions) and
   routes employees to a new `attendance_edit_requests` table/IPC surface instead. Admin approval reuses
   the existing payment-eligibility/void/regenerate logic already inside `attendance:record`'s transaction
   (from feature 006) rather than duplicating it. A new `attendance_audit_log` table captures every
   accepted change (direct admin edit or approved request). A minimal in-app `notifications` table/IPC
   covers submit/decision notifications for both roles.

## Technical Context

**Language/Version**: TypeScript ~6.0, Node 20+ (Electron 42 runtime), React 19

**Primary Dependencies**: Electron 42, React 19 + react-router 7, Zustand 5, Tailwind 4, i18next;
main-process: `node:sqlite` via the `Db` wrapper, ExcelJS 4 (`exportService.ts`), pdfmake 0.3
(`pdfService.ts`), mongoose 9 (sync). No new runtime dependencies required — CSV export is generated with
plain string-building (no new library needed for flat tabular data), and Print reuses the existing pdfmake
HTML-ish document definitions rendered into a preview window/dialog.

**Storage**: Local SQLite at `userData/nursery.db` (system of record); MongoDB Atlas mirror via admin
sync. New tables: `attendance_edit_requests`, `attendance_audit_log`, `notifications`. No schema change to
`attendance_records` itself beyond what feature 006 already added — "locked" is a derived state (row
exists) enforced in the IPC handler, not a new column, so existing rows are locked automatically with no
migration/backfill needed.

**Testing**: Vitest — unit tests for: the attendance lock/allow matrix (employee vs admin, existing vs new
row), edit-request lifecycle (submit → pending → approve/reject), duplicate-pending-request prevention,
payment void/regenerate on approval reusing feature 006's eligibility rules, audit log entry shape for
both admin-direct and approved-request paths, and export/report data-shaping functions (row totals, empty
report handling) in isolation from ExcelJS/pdfmake output. Contract tests for all new/changed IPC channels
following the existing `tests/unit/*IPC*` / `*.test.ts` pattern in this repo.

**Target Platform**: Electron desktop app (Windows/macOS), bilingual Arabic (RTL) / English (LTR),
currency EGP.

**Project Type**: Single-repo Electron desktop app — `electron/` main process, `src/` React renderer,
`window.api` typed IPC bridge (contextIsolation on, nodeIntegration off).

**Performance Goals**: Export/print generation for a single month/date-range report (≤ few hundred rows)
completes in well under the time it takes a user to notice — no streaming/pagination needed at this scale.
Attendance lock check adds a single indexed lookup (`session_id`+`child_id`+`teacher_id`, already indexed
per migration 030) to the existing `attendance:record` transaction — no measurable regression.

**Constraints**: Offline-capable — export/print and the attendance lock/edit-request flow must work
without connectivity (local SQLite is authoritative; sync is best-effort, matching every other entity in
this app). Role re-validation in every IPC handler (`requireAdmin`/`checkAuth` from `_guard.ts`). All
migrations are additive and idempotent. Approval reuses feature 006's existing void/regenerate payment
logic rather than re-deriving it, to avoid the two payment code paths silently diverging.

**Scale/Scope**: Hundreds of children, dozens of teachers, multi-year attendance/payment history. Scope is
the two Summary items above, sized to the spec's 6 user stories. Out of scope (per spec Assumptions):
new refund/discount/adjustment entry features (Financial Transactions Report only surfaces transaction
types that already exist), print/export on any page beyond the four named reports, and any
notification channel beyond in-app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unratified template — no concrete
enforceable gates. **Status: PASS (no applicable gates).** The plan follows all established project
conventions: main-process-only data access, typed `window.api` bridge, server-side role re-validation in
every handler, additive/idempotent migrations, reuse of existing export/payment engines instead of
parallel implementations (directly continuing the consolidation work already done in this codebase — see
prior session's removal of the duplicate settings-table pricing system), no new heavy runtime
dependencies. **Re-checked post-Phase 1**: data-model.md and contracts/ipc-contracts.md introduce nothing
that deviates from these conventions — PASS.

## Project Structure

### Documentation (this feature)

```text
specs/007-printing-export-attendance-approval/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── ipc-contracts.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
electron/
├── db/
│   └── migrations/index.ts        # new migrations: attendance_edit_requests, attendance_audit_log,
│                                   # notifications tables
├── ipc/
│   ├── attendanceIPC.ts           # lock enforcement in attendance:record; new handlers:
│   │                               # attendance:requestEdit, attendance:listEditRequests,
│   │                               # attendance:decideEditRequest, attendance:getAuditLog
│   ├── exportIPC.ts                # new export:payrollReport, export:financialTransactions handlers;
│   │                               # existing export:salaries/expenses/child gain filter/date-range
│   │                               # passthrough params
│   └── notificationsIPC.ts         # NEW — notifications:list, notifications:markRead
├── services/
│   ├── exportService.ts            # new generate*Sheet() functions for Payroll Report and Financial
│   │                               # Transactions Report shapes; existing sheets gain filter params
│   ├── pdfService.ts               # new document-definition builders for the same two report shapes
│   ├── printService.ts             # NEW — shared "build a printable HTML/PDF preview" used by the
│   │                               # in-app Print action across all four reports (thin wrapper reusing
│   │                               # pdfService's document definitions)
│   └── csvService.ts               # NEW — flat CSV writer shared by all four reports
└── preload.ts                      # new window.api.export.*, window.api.attendance.*,
                                    # window.api.notifications.* entries

src/
├── pages/
│   ├── Salaries/PayrollReport.tsx        # + Print/Export PDF/Excel/CSV toolbar
│   ├── Expenses/ExpensesList.tsx         # + Print/Export PDF/Excel/CSV toolbar
│   ├── Children/ChildStatement.tsx       # + "Child Report" full print/export (personal info +
│   │                                     #   attendance + teachers + services + payments + notes)
│   │                                     # + Financial Transactions Report toolbar (subset view)
│   └── Sessions/SessionsList.tsx         # attendance sheet: locked-record UI, "Request Edit" action,
│                                         # admin Edit-Request inbox + audit log viewer
├── components/
│   └── reports/ReportActions.tsx         # NEW — shared Print/Export PDF/Export Excel/Export CSV
│                                         # button group used by all four report screens
├── store/
│   ├── useAttendanceEditRequestsStore.ts # NEW
│   └── useNotificationsStore.ts          # NEW
└── types/index.ts                        # + AttendanceEditRequest, AttendanceAuditLogEntry,
                                          # Notification types

tests/unit/
├── attendanceLock.test.ts                 # NEW
├── attendanceEditRequests.test.ts         # NEW
├── attendanceAuditLog.test.ts             # NEW
├── notifications.test.ts                  # NEW
└── exportReportShapes.test.ts             # NEW — pure data-shaping (no ExcelJS/pdfmake I/O)
```

**Structure Decision**: Single-repo Electron desktop app (existing structure, no new top-level
directories). All new backend logic lives beside its existing siblings in `electron/ipc/` and
`electron/services/`; all new frontend logic lives beside its existing siblings in `src/pages/`,
`src/components/`, and `src/store/`. This directly extends feature 006's attendance/payment work and the
already-present-but-unwired export engine, rather than introducing a parallel system.

## Complexity Tracking

*No constitution violations — table intentionally omitted.*
