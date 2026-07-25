# Implementation Plan: Attendance-Based Teacher Payment System

**Branch**: `006-salary-attendance-reports` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-salary-attendance-reports/spec.md`

## Summary

Redesign teacher pay to be driven entirely by attendance rather than child-assignment counts, on top of
the existing session/attendance infrastructure shipped in feature 005:

1. **No balance drain on assignment**: confirmed structurally already true (see research.md #1) — no
   fix needed there, but the *missing* pieces that make attendance-based pay actually work are added:
   per-child teacher attendance, a per-teacher session rate, and a dedicated payment ledger.
2. **Per-teacher session rate**: new `employees.teacher_session_rate` column, editable in Teacher Settings.
3. **Remaining-sessions / expected-cost preview**: new read-only `childServices:previewTeacherCost` IPC,
   reusing the existing weekday-matching date logic.
4. **Multi-teacher services**: new `service_teachers` join table; child enrollment continues to use the
   existing `child_services.teacher_id` for the single active assignment, now scoped to that service's
   teacher list.
5. **Attendance-based payment rules**: `attendance_records` gains `teacher_status` +
   `attended_teacher_id`; `attendance:record` evaluates the five payment cases server-side inside its
   existing transaction.
6. **Duplicate protection**: new `teacher_payments` table with `UNIQUE(teacher_id, child_id,
   attendance_date)` — enforced at the database level.
7. **Attendance/child-profile views**: extend `attendance:getSheet`; add `attendance:getChildHistory`.
8. **Payroll report**: new `payroll:report` IPC aggregating `teacher_payments` per teacher/month.
9. **Future-proof design**: the existing `salary_types` table already implements a
   strategy-shaped engine (`fixed_monthly` / `per_session_fixed` / `per_session_pct` / `hybrid`) for an
   employee's own payroll; this feature's `teacher_payments` ledger is deliberately kept as a separate,
   narrowly-scoped concept (money owed per child session taught) so future strategies can be added to
   either system independently without cross-contamination.

## Technical Context

**Language/Version**: TypeScript ~6.0, Node 20+ (Electron 42 runtime), React 19

**Primary Dependencies**: Electron 42, React 19 + react-router 7, Zustand 5, Tailwind 4, i18next;
main-process: `node:sqlite` via the `Db` wrapper, mongoose 9 (sync). No new runtime dependencies required.

**Storage**: Local SQLite at `userData/nursery.db` (system of record); MongoDB Atlas mirror via admin sync.
Two new tables (`service_teachers`, `teacher_payments`) + two extended tables (`employees`,
`attendance_records`) across migrations 026–029.

**Testing**: Vitest — unit tests for the five payment-eligibility cases, duplicate-protection upsert
behavior, void/requalify transitions, remaining-sessions date math, and payroll aggregation; contract
tests for all new/changed IPC channels.

**Target Platform**: Electron desktop app (Windows/macOS), bilingual Arabic (RTL) / English (LTR),
currency EGP.

**Project Type**: Single-repo Electron desktop app — `electron/` main process, `src/` React renderer,
`window.api` typed IPC bridge (contextIsolation on, nodeIntegration off).

**Performance Goals**: Attendance save (including payment evaluation) remains a single DB transaction and
completes synchronously for a session of up to ~30 children. Payroll report for a full roster
(≤100 employees) computes sub-second from indexed `teacher_payments` queries.

**Constraints**: Offline-capable — attendance recording and payment generation must work without
connectivity (local SQLite is authoritative; sync is best-effort). Role re-validation in every IPC handler.
All migrations are additive and idempotent. A `paid` `teacher_payments` row is never silently mutated by
automatic attendance re-evaluation (research.md #7).

**Scale/Scope**: Hundreds of children, dozens of teachers, multiple sessions per week. Scope is the 9 items
in Summary. Out of scope (per spec Assumptions): fixed-monthly/per-child/hourly/percentage-based/bonus
strategies themselves (only the modularity to add them later), cross-month payroll reports, and
retroactive recalculation of pre-existing assignment-based payments/balances.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unratified template — no concrete
enforceable gates. **Status: PASS (no applicable gates).** The plan follows all established project
conventions: main-process-only data access, typed `window.api` bridge, server-side role re-validation in
every handler (`requireAdmin`/`checkAuth` from `electron/ipc/_guard.ts`), additive/idempotent migrations,
last-write-wins sync via `SYNC_ENTITIES`, no new heavy runtime dependencies. **Re-checked post-Phase 1**:
data-model.md and contracts/ipc-contracts.md introduce nothing that deviates from these conventions —
PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-salary-attendance-reports/
├── plan.md                   # This file
├── spec.md                   # Feature specification (with Clarifications section)
├── research.md                # Phase 0 — all decisions resolved
├── data-model.md              # Phase 1 — migrations 026–029, Mongoose schema deltas
├── quickstart.md              # Phase 1 — manual verification guide
├── contracts/
│   └── ipc-contracts.md       # Phase 1 — full IPC surface delta
├── checklists/
│   └── requirements.md        # Spec quality checklist
└── tasks.md                   # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
electron/
├── preload.ts                          # + serviceTeachers, teacherPayments, payroll namespaces;
│                                        #   + childServices.previewTeacherCost, attendance.getChildHistory
├── db/
│   └── migrations/index.ts             # + migrations 026–029
├── ipc/
│   ├── serviceTeachersIPC.ts           # NEW: serviceTeachers:list/set
│   ├── teacherPaymentsIPC.ts           # NEW: teacherPayments:list/markPaid
│   ├── payrollIPC.ts                   # NEW: payroll:report
│   ├── attendanceIPC.ts                # MODIFIED: teacher_status handling, payment-rule
│   │                                    #   evaluation in attendance:record, getSheet payment
│   │                                    #   join, new attendance:getChildHistory
│   ├── childServicesIPC.ts             # MODIFIED: previewTeacherCost handler
│   └── salariesIPC.ts                  # MODIFIED: employees:add/update accept
│                                        #   teacher_session_rate
├── services/
│   └── mongoSync.ts                    # + serviceTeacherSchema, teacherPaymentSchema;
│                                        #   employeeSchema + attendanceRecordSchema extended;
│                                        #   SYNC_ENTITIES + service_teachers, teacher_payments
└── main.ts                             # + import serviceTeachersIPC, teacherPaymentsIPC, payrollIPC

src/
├── types/index.ts                      # + ServiceTeacher, TeacherPayment, PayrollReportRow,
│                                        #   AttendanceHistoryRow; Employee + AttendanceRecord extended
├── pages/
│   ├── Sessions/
│   │   └── SessionsList.tsx            # MODIFIED: attendance UI gains teacher-status control,
│   │                                    #   payment-generated/amount column
│   ├── Settings/
│   │   └── ServiceDefinitions.tsx      # MODIFIED: teacher-list assignment per service
│   ├── Employees/
│   │   └── EmployeesList.tsx           # MODIFIED: "Per Session Cost" field
│   ├── Children/
│   │   ├── ChildForm.tsx               # MODIFIED: teacher dropdown scoped to service's
│   │   │                                #   teacher list; live remaining-sessions/cost preview
│   │   └── ChildStatement.tsx          # MODIFIED: existing per-child detail page gains an
│   │                                    #   Attendance History section (FR-019)
│   └── Salaries/
│       ├── SalariesList.tsx            # MODIFIED: link to Payroll Report
│       └── PayrollReport.tsx           # NEW: monthly per-teacher payroll report
└── i18n/
    ├── en.json                         # + translation keys for all new UI text
    └── ar.json                         # + Arabic translations
```

**Structure Decision**: Single-repo Electron desktop app layout — unchanged from prior features. All
main-process code in `electron/`, all renderer code in `src/`. No new top-level directories introduced.
The per-child detail page already exists as `ChildStatement.tsx` (currently payments/billing focused); this
feature adds an Attendance History section to it rather than creating a new page.
