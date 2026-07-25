# Implementation Plan: Dynamic Roles, Salary Configuration & Service Enhancements

**Branch**: `005-roles-salary-services` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-roles-salary-services/spec.md`

## Summary

Nine brownfield additions and bug fixes across the employee, salary, service, child enrollment, and attendance domains:

1. **Dynamic employee roles**: replace hard-coded `employees.role` TEXT with a managed `employee_roles` table; inline "Add new role" in the employee form; auto-migrate existing values on first launch.
2. **Salary type engine**: new `salary_types` table with four modes (fixed-monthly, per-session-fixed, per-session-pct, hybrid); roles carry a default salary type, employees may override; salary calculation uses attendance-derived payable session counts.
3. **Attendance system**: new `scheduled_sessions`, `session_teachers`, `attendance_records`, and `attendance_conflicts` tables; teachers record per-child status (attended / absent-excused / absent-unexcused); last-write-wins sync with admin conflict review log.
4. **Custom service definitions**: new `service_definitions` table (seeded from existing settings); admin CRUD for custom services with day/month/hour pricing; enrollment form reads from this table.
5. **Enrollment form — price display fix**: auto-populate price field from `service_definitions` on service/billing-type change (fixes 0-EGP bug).
6. **Enrollment form — additional classes display fix**: show base service amount + additional classes line separately instead of ambiguous total.
7. **Pro-rated first payment**: count remaining scheduled sessions from enrollment date; confirm/edit step for admin before saving; store both calculated and confirmed amounts.
8. **Child photo upload fix**: ensure `storage:uploadPhoto` is awaited and result is passed to `children:add`/`children:update` before saving.
9. **Sync**: all seven new tables added to `SYNC_ENTITIES` with Mongoose schemas; `employeeSchema` and `paymentSchema` extended.

## Technical Context

**Language/Version**: TypeScript ~6.0, Node 20+ (Electron 42 runtime), React 19

**Primary Dependencies**: Electron 42, React 19 + react-router 7, Zustand 5, Tailwind 4, i18next; main-process: `node:sqlite` via `Db` wrapper, mongoose 9 (sync). No new runtime dependencies required.

**Storage**: Local SQLite at `userData/nursery.db` (system of record); MongoDB Atlas mirror via admin sync. Five new tables + two extended tables across migrations 014–018.

**Testing**: Vitest (unit: salary formula per mode, pro-rate calculation, migration idempotency, role resolution fallback); contract tests for all new IPC channels.

**Target Platform**: Electron desktop app (Windows/macOS), bilingual Arabic (RTL) / English (LTR), currency EGP.

**Project Type**: Single-repo Electron desktop app — `electron/` main process, `src/` React renderer, `window.api` typed IPC bridge (contextIsolation on, nodeIntegration off).

**Performance Goals**: UI interactions remain instant; attendance bulk-record (up to 30 children per session) completes in a single DB transaction; salary calculation for a full roster (≤100 employees) is synchronous and sub-second.

**Constraints**: Offline-capable — attendance recording and session management must work without connectivity. Secrets never reach the renderer. Role re-validation in every IPC handler. All migrations are additive and idempotent.

**Scale/Scope**: Hundreds of children, dozens of employees, multiple sessions per week. Scope is the nine items listed above. Payroll approval workflow, automated payment generation from sessions, and session recurring templates are explicitly out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unratified template — no concrete enforceable gates. **Status: PASS (no applicable gates).** The plan follows all established project conventions: main-process-only data/secret access, typed `window.api` bridge, server-side role re-validation in every handler, additive migrations, last-write-wins sync, no new heavy runtime dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/005-roles-salary-services/
├── plan.md                   # This file
├── spec.md                   # Feature specification
├── research.md               # Phase 0 — all decisions resolved
├── data-model.md             # Phase 1 — migrations 014–018, Mongoose schemas
├── quickstart.md             # Phase 1 — developer guide
├── contracts/
│   └── ipc-contracts.md      # Phase 1 — full IPC surface delta
├── checklists/
│   └── requirements.md       # Spec quality checklist
└── tasks.md                  # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
electron/
├── preload.ts                          # + 5 new api namespaces (roles, salaryTypes,
│                                       #   serviceDefinitions, sessions, attendance)
├── db/
│   └── migrations/index.ts            # + migrations 014–018
├── ipc/
│   ├── rolesIPC.ts                    # NEW: roles:list/add/update/delete
│   ├── salaryTypesIPC.ts              # NEW: salaryTypes:list/add/update/delete
│   ├── serviceDefinitionsIPC.ts       # NEW: serviceDefinitions:list/add/update/delete
│   ├── sessionsIPC.ts                 # NEW: sessions:list/add/update/delete/
│   │                                  #       assignTeachers/proRateCalc
│   ├── attendanceIPC.ts               # NEW: attendance:getSheet/record/
│   │                                  #       getConflicts/resolveConflict/getSummary
│   ├── salariesIPC.ts                 # MODIFIED: employees:add/update accept role_id;
│   │                                  #   salary:get uses attendance-based calc
│   └── childrenIPC.ts                 # MODIFIED: photo upload fix; pro-rating
├── services/
│   └── mongoSync.ts                   # + 7 new Mongoose models + schemas;
│                                       #   employeeSchema + paymentSchema extended
└── main.ts                            # + import new IPC files

src/
├── types/index.ts                     # + EmployeeRole, SalaryType, ServiceDefinition,
│                                       #   ScheduledSession, AttendanceRecord,
│                                       #   AttendanceConflict, AttendanceSummary;
│                                       #   Employee + Payment extended
├── pages/
│   ├── Sessions/
│   │   ├── SessionCalendar.tsx        # NEW: month-view session list + add/edit
│   │   ├── AttendanceSheet.tsx        # NEW: per-session attendance recording
│   │   └── AttendanceConflicts.tsx    # NEW: admin conflict review list
│   ├── Settings/
│   │   ├── Settings.tsx               # MODIFIED: add tabs/nav for new sub-pages
│   │   ├── ServiceDefinitions.tsx     # NEW: custom service CRUD
│   │   ├── SalaryTypes.tsx            # NEW: salary type CRUD
│   │   └── PricingSettings.tsx        # MODIFIED: built-in service prices via
│   │                                  #   serviceDefinitions:update
│   ├── Employees/
│   │   └── EmployeesList.tsx          # MODIFIED: role → dynamic dropdown +
│   │                                  #   inline "Add new role"
│   ├── Salaries/
│   │   └── SalariesList.tsx           # MODIFIED: show salary type + payable
│   │                                  #   session count breakdown
│   └── Children/
│       └── ChildForm.tsx              # MODIFIED: photo upload fix; price
│                                       #   auto-populate; additional classes
│                                       #   breakdown; pro-rating confirmation step
├── store/
│   ├── useRolesStore.ts               # NEW: Zustand store for employee roles
│   ├── useSalaryTypesStore.ts         # NEW: Zustand store for salary types
│   └── useServiceDefinitionsStore.ts  # NEW: Zustand store for service definitions
└── i18n/
    ├── en.json                        # + translation keys for all new UI text
    └── ar.json                        # + Arabic translations
```

**Structure Decision**: Single-repo Electron desktop app layout — unchanged from prior features. All main-process code in `electron/`, all renderer code in `src/`. No new top-level directories introduced.
