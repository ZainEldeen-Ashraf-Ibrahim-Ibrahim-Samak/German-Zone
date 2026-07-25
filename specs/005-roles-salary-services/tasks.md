# Tasks: Dynamic Roles, Salary Configuration & Service Enhancements

**Input**: Design documents from `specs/005-roles-salary-services/`

**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ipc-contracts.md ✓ quickstart.md ✓

**Organization**: Tasks grouped by user story — each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependency)
- **[Story]**: Maps to user story in spec.md (US1–US8)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire new IPC files into the app; add TypeScript types; create store shells. No business logic — enables all subsequent phases.

- [X] T001 Register 5 new IPC import stubs in `electron/main.ts`: `rolesIPC.js`, `salaryTypesIPC.js`, `serviceDefinitionsIPC.js`, `sessionsIPC.js`, `attendanceIPC.js` (create empty files with a single comment for now)
- [X] T00X [P] Add all new TypeScript types to `src/types/index.ts`: `EmployeeRole`, `SalaryType`, `ServiceDefinition`, `ScheduledSession`, `SessionTeacher`, `AttendanceRecord`, `AttendanceConflict`, `AttendanceSummary`; extend `Employee` with `role_id`, `salary_type_override_id`, `role_name`; extend `Payment` with `prorated_calculated`
- [X] T00X [P] Create Zustand store shells (list state + load action only, no write actions yet): `src/store/useRolesStore.ts`, `src/store/useSalaryTypesStore.ts`, `src/store/useServiceDefinitionsStore.ts`
- [X] T00X [P] Add all new `window.api` bridge entries to `electron/preload.ts`: `roles.*`, `salaryTypes.*`, `serviceDefinitions.*`, `sessions.*`, `attendance.*` (invoke stubs — channels not yet handled)

**Checkpoint**: App compiles; new `window.api` entries are typed; no runtime logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All five SQLite migrations + all seven Mongoose schemas. MUST be complete before any user story implementation begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. Run the app after each migration to verify no startup errors.

- [X] T00X Add migration `014_employee_roles_salary_types` to `electron/db/migrations/index.ts`: create `salary_types` table, create `employee_roles` table (with `salary_type_id` FK), add `role_id` + `salary_type_override_id` columns to `employees`, auto-migrate existing `employees.role` strings into `employee_roles` (INSERT OR IGNORE + UPDATE role_id)
- [X] T00X Add migration `015_service_definitions` to `electron/db/migrations/index.ts`: create `service_definitions` table with `is_custom`, `price_monthly`, `price_daily`, `price_hourly`; seed Nursery/Hosting/Session rows from current `settings` key-value pairs (INSERT OR IGNORE)
- [X] T00X Add migration `016_scheduled_sessions` to `electron/db/migrations/index.ts`: create `scheduled_sessions` table (`session_date`, `service_id`, `group_name`, `notes`); create `session_teachers` bridge table (UNIQUE session_id + employee_id)
- [X] T00X Add migration `017_attendance` to `electron/db/migrations/index.ts`: create `attendance_records` table (`status` CHECK constraint, UNIQUE session_id + child_id); create `attendance_conflicts` audit log table
- [X] T00X Add migration `018_payment_prorated_column` to `electron/db/migrations/index.ts`: additive ALTER on `payments` to add `prorated_calculated REAL` (guard with try/catch for idempotency)
- [X] T010 Add 7 new Mongoose schemas + 2 schema extensions to `electron/services/mongoSync.ts`: `SalaryTypeModel`, `EmployeeRoleModel`, `ServiceDefinitionModel`, `ScheduledSessionModel`, `SessionTeacherModel`, `AttendanceRecordModel`, `AttendanceConflictModel`; extend `employeeSchema` with `role_id` + `salary_type_override_id`; extend `paymentSchema` with `prorated_calculated`; add all 7 new models to `SYNC_ENTITIES`

**Checkpoint**: Launch app — 5 new migrations apply without error; DB contains `salary_types`, `employee_roles`, `service_definitions`, `scheduled_sessions`, `session_teachers`, `attendance_records`, `attendance_conflicts` tables; all existing data is intact; `employees.role_id` populated from migrated role strings.

---

## Phase 3: User Story 1 — Dynamic Employee Role Management (Priority: P1) 🎯 MVP

**Goal**: Replace hard-coded employee role strings with a managed, syncable role list. Admin can add new roles inline during employee creation/editing.

**Independent Test**: Open Add Employee → role field shows a searchable dropdown → click "Add new role" → type "Speech Therapist" → confirm → it is immediately selectable → save employee → reopen employee → role shows "Speech Therapist".

- [X] T011 [US1] Implement `roles:list`, `roles:add`, `roles:update`, `roles:delete` handlers in `electron/ipc/rolesIPC.ts`; `roles:delete` must check active employee references and throw bilingual error if any exist
- [X] T012 [US1] Populate `src/store/useRolesStore.ts` with full CRUD actions wired to `window.api.roles.*`
- [X] T013 [P] [US1] Update `employees:add` in `electron/ipc/salariesIPC.ts` to accept `role_id` (required), validate FK exists in `employee_roles`, store it, and keep `employees.role` TEXT in sync with the role name; update `employees:update` with same logic
- [X] T014 [P] [US1] Update `employees:get` in `electron/ipc/salariesIPC.ts` to JOIN `employee_roles` and return `role_name` on each row
- [X] T015 [US1] Replace the role text input in `src/pages/Employees/EmployeesList.tsx` with a searchable `<Select>` component backed by `useRolesStore`; add an inline "Add new role" button that opens a small inline input and calls `roles:add` on confirm; pre-select on edit
- [X] T016 [US1] Add FR-037 warning banner in `src/pages/Employees/EmployeesList.tsx` (and a roles management modal/panel) that shows a yellow badge for any role with `salary_type_id = null`
- [X] T017 [P] [US1] Add i18n keys for role management UI to `src/i18n/en.json` and `src/i18n/ar.json`: role dropdown label, add new role prompt, delete role confirmation, "role has no salary type" warning

**Checkpoint**: Employee form shows dynamic role dropdown. Adding a new role from the form works. Migrated roles appear automatically. Roles without salary type show a warning. Roles sync to MongoDB on next push.

---

## Phase 4: User Story 2 — Salary Configuration per Employee Type (Priority: P1)

**Goal**: Admin defines named salary types in Settings; roles get a default type; employees may override; `salary:get` computes pay by type formula.

**Independent Test**: Settings → Salary Types → add "Per-Session 15%". Settings → Employee Roles → assign that type as default to "Speech Therapist". Go to Salaries for current month → "Speech Therapist" employee shows salary computed as `payable_sessions × session_revenue × 0.15` (payable sessions = 0 until US8 wires attendance; verify formula with zero returns 0, not a crash).

- [X] T018 [US2] Implement `salaryTypes:list`, `salaryTypes:add`, `salaryTypes:update`, `salaryTypes:delete` handlers in `electron/ipc/salaryTypesIPC.ts`; `salaryTypes:delete` must check references in both `employee_roles.salary_type_id` and `employees.salary_type_override_id`
- [X] T019 [US2] Populate `src/store/useSalaryTypesStore.ts` with full CRUD actions wired to `window.api.salaryTypes.*`
- [X] T020 [US2] Create `src/pages/Settings/SalaryTypes.tsx`: list salary types in a table; modal form for add/edit with `mode` selector showing/hiding relevant rate fields (monthly_rate for fixed/hybrid; session_rate for per-session-fixed/hybrid; session_pct for per-session-pct)
- [X] T021 [US2] Add a salary type default selector to the role management view (roles modal/panel) so admin can assign `salary_type_id` to a role; reuse `useSalaryTypesStore` for the dropdown options
- [X] T022 [US2] Add an optional salary type override selector to the employee add/edit form in `src/pages/Employees/EmployeesList.tsx`; show "Using role default: [type name]" when override is null
- [X] T023 [US2] Update `salary:get` in `electron/ipc/salariesIPC.ts` to resolve `effective_salary_type = employee.salary_type_override_id ?? role.salary_type_id`; apply formula by mode to compute `actual_paid`; for session-based modes use `payable_sessions = 0` as placeholder until T036 wires real attendance data
- [X] T024 [US2] Update `salary:update` in `electron/ipc/salariesIPC.ts` to accept optional `override_amount` that bypasses formula and sets `actual_paid` directly
- [X] T025 [US2] Update `src/pages/Salaries/SalariesList.tsx` to show salary type name and mode badge on each employee row; for session-based types show "(0 sessions)" placeholder badge until US8 completes
- [X] T026 [US2] Add Salary Types sub-page link to `src/pages/Settings/Settings.tsx` navigation tabs/sidebar
- [X] T027 [P] [US2] Add i18n keys for salary type UI to `src/i18n/en.json` and `src/i18n/ar.json`: mode names, rate field labels, "role default" label, formula descriptions

**Checkpoint**: Admin can define salary types and assign them to roles. Salary list shows type per employee. Fixed-monthly employees show correct salary. Session-based employees show 0 (expected — attendance not yet wired). Salary types sync to MongoDB.

---

## Phase 5: User Story 8 — Attendance Tracking with Excuse Management (Priority: P1)

**Goal**: Admin/teacher records per-child session attendance; salary calculation replaces the placeholder with real payable session counts from attendance.

**Independent Test**: Create a session for today → assign a teacher → open Attendance Sheet → mark 2 children as "attended" and 1 as "absent with excuse" → go to Salaries → the teacher's session-based salary shows 2 payable sessions, not 3.

- [X] T028 [US8] Implement `sessions:list`, `sessions:add`, `sessions:update`, `sessions:delete`, `sessions:assignTeachers`, `sessions:proRateCalc` in `electron/ipc/sessionsIPC.ts`; `sessions:delete` blocks if attendance exists; `sessions:proRateCalc` counts `scheduled_sessions` where `session_date >= child.reg_date` AND within billing month
- [X] T029 [US8] Implement `attendance:getSheet`, `attendance:record` (bulk upsert in transaction), `attendance:getConflicts`, `attendance:resolveConflict`, `attendance:getSummary` in `electron/ipc/attendanceIPC.ts`; `getSheet` access check: admin always allowed, teacher only if listed in `session_teachers` for that session
- [X] T030 [P] [US8] Create `src/pages/Sessions/SessionCalendar.tsx`: month-view list of sessions (date, service/group, assigned teachers, session count); add session modal (date picker, service selector, group name, teacher multi-pick from employees list); edit/delete actions
- [X] T031 [P] [US8] Create `src/pages/Sessions/AttendanceSheet.tsx`: given a session, list all enrolled children; per child: a three-way status toggle (attended / absent-excused / absent-unexcused); excuse notes input shown when absent-excused selected; bulk-save button calling `attendance:record`
- [X] T032 [P] [US8] Create `src/pages/Sessions/AttendanceConflicts.tsx`: list unreviewed conflicts from `attendance:getConflicts`; each row shows overwritten vs winning value, users, timestamps; "Resolve" button with status picker calling `attendance:resolveConflict`
- [X] T033 [US8] Add Sessions section to app routing in `src/App.tsx` (or router config file) and sidebar entry in `src/components/layout/Sidebar.tsx` (admin + teacher visible)
- [X] T034 [US8] Replace the `payable_sessions = 0` placeholder in `electron/ipc/salariesIPC.ts` (T023) with a real call to the attendance summary query for session-based salary modes: count `attendance_records WHERE session_id IN (sessions assigned to this employee this month) AND status != 'absent_excused'`
- [X] T035 [US8] Update `src/pages/Salaries/SalariesList.tsx` to replace the "(0 sessions)" placeholder badge with real payable / excused / total counts from the salary response
- [X] T036 [US8] Add attendance conflict detection to the sync push path in `electron/services/mongoSync.ts`: before upserting an `attendance_records` document, check if the cloud version has `synced=1` with a different `updated_at`; if so, write an `attendance_conflicts` row locally before overwriting
- [X] T037 [P] [US8] Add i18n keys for sessions and attendance UI to `src/i18n/en.json` and `src/i18n/ar.json`: attendance status labels, excuse notes placeholder, session calendar labels, conflict review labels

**Checkpoint**: Admin creates sessions, assigns teachers, records attendance. Salary page shows real payable session counts. Session-based salary formulas produce correct amounts. Conflict log captures overwrite scenarios on sync.

---

## Phase 6: User Story 3 — Custom Service Types with Flexible Pricing (Priority: P2)

**Goal**: Admin can add custom services (e.g., "OT Program") with independent day/month/hour pricing, visible in child enrollment.

**Independent Test**: Settings → Services → Add "OT Program" monthly 1500 EGP → go to Add Child → service dropdown includes "OT Program" → select it with Monthly billing → amount field shows 1500.

- [X] T038 [US3] Implement `serviceDefinitions:list`, `serviceDefinitions:add`, `serviceDefinitions:update`, `serviceDefinitions:delete` in `electron/ipc/serviceDefinitionsIPC.ts`; `delete` blocks on enrolled children and blocks on `is_custom = 0` (built-in)
- [X] T039 [US3] Populate `src/store/useServiceDefinitionsStore.ts` with full CRUD actions wired to `window.api.serviceDefinitions.*`
- [X] T040 [US3] Create `src/pages/Settings/ServiceDefinitions.tsx`: table of all services (built-in marked as non-deletable); add/edit modal with name + three optional price fields; delete with child-count warning
- [X] T041 [US3] Update `src/pages/Settings/PricingSettings.tsx` to save Nursery/Hosting/Session price edits via `serviceDefinitions:update` instead of `settings:update`; keep the existing key-value settings save as a secondary write for backward compat
- [X] T042 [US3] Add Service Definitions sub-page link to `src/pages/Settings/Settings.tsx` navigation
- [X] T043 [P] [US3] Add i18n keys for service definitions UI to `src/i18n/en.json` and `src/i18n/ar.json`: add service labels, price field labels, built-in service badge, delete warning message

**Checkpoint**: Admin can create custom services. Built-in services are still editable via PricingSettings (now writes to service_definitions). All services visible in service selector. Service definitions sync to MongoDB.

---

## Phase 7: User Story 4 — Fix Payment Display on Child Enrollment Form (Priority: P2)

**Goal**: Selecting a service + billing type on the child enrollment form immediately shows the correct price — never 0.

**Independent Test**: Open Add Child form → select "Nursery" + "Monthly" → the monthly nursery price appears in the amount field within 1 second without any extra interaction. Switch to "Daily" → daily price appears. Switch back to "Monthly" → monthly price restored.

- [X] T044 [US4] In `src/pages/Children/ChildForm.tsx`: on mount, load all service definitions into local state via `window.api.serviceDefinitions.list()` (single fetch, cache in component state)
- [X] T045 [US4] In `src/pages/Children/ChildForm.tsx`: add a `useEffect` (or `onChange` handler) that triggers on service name change or billing type change; derive the correct price from the cached service definitions and set it into the price/amount field immediately
- [X] T046 [US4] Verify price auto-update covers all three billing types (monthly/daily/hourly) and all service types (built-in + custom) in `src/pages/Children/ChildForm.tsx`

**Checkpoint**: Open Add Child → select any service + any billing type → correct price appears immediately. No more 0-EGP default when a valid price is configured.

---

## Phase 8: User Story 5 — Fix Additional Classes Display (Priority: P2)

**Goal**: Enrollment summary shows base service amount + additional classes as two labeled lines, not an ambiguous single number.

**Independent Test**: Enroll child in Nursery Monthly 2500 EGP + 3 extra classes × 100 EGP → summary shows "Service: 2500 EGP | Additional classes (3 × 100): 300 EGP | Total: 2800 EGP".

- [X] T047 [US5] In `src/pages/Children/ChildForm.tsx` enrollment summary section: replace the single `monthly_fee` display with a three-line breakdown — base service amount (from `child_services.price`), additional classes line (`extra_lessons × session_price`, shown only when `extra_lessons > 0`), and bold total line
- [X] T048 [P] [US5] Check and fix additional classes display in `src/pages/Children/ChildrenList.tsx` and `src/pages/Children/ChildStatement.tsx` if either renders `monthly_fee` — ensure they show the breakdown or at minimum the correct total
- [X] T049 [P] [US5] Add i18n keys for the breakdown labels to `src/i18n/en.json` and `src/i18n/ar.json`: "base service", "additional classes", "total monthly fee"

**Checkpoint**: Add Child with extra classes → summary shows two labeled lines. Total matches manual calculation. Existing children with no extra classes show single line only.

---

## Phase 9: User Story 6 — Pro-Rated Payment for Mid-Month Enrollments (Priority: P2)

**Goal**: First payment for a child enrolling mid-period is calculated from remaining scheduled sessions, with an admin-editable confirmation step.

**Independent Test**: Month has 8 sessions. Add child with reg_date on session 6's date → enrollment form shows a pro-rate confirmation with count=3 and amount=3 × per-session-price → admin can edit → saved payment has `prorated_calculated` = system amount, `price` = confirmed amount.

**⚠️ Dependency**: Requires Phase 5 (US8) to be complete — `scheduled_sessions` records must exist for the calculation to return meaningful data.

- [X] T050 [US6] In `src/pages/Children/ChildForm.tsx`: after enrollment date is entered and a service is selected, call `window.api.sessions.proRateCalc({ child_id, billing_month, billing_year })` and display the result in a confirmation panel showing session count, calculated amount, and an editable amount field pre-filled with the calculated value
- [X] T051 [US6] In `electron/ipc/childrenIPC.ts`: update `children:add` to accept `confirmed_first_amount` and `prorated_calculated`; on first payment generation pass `prorated_calculated` to the payments row and use `confirmed_first_amount` as `price` (fall back to calculated amount if admin did not override)
- [X] T052 [US6] Ensure `payments:generate` propagates `prorated_calculated` to the created payment row in `electron/ipc/paymentsIPC.ts` so it is visible in the payment record
- [X] T053 [P] [US6] Add i18n keys for pro-rating UI to `src/i18n/en.json` and `src/i18n/ar.json`: "sessions remaining", "calculated first payment", "you may adjust this amount", confirmation button labels

**Checkpoint**: Enroll a child on a non-first-session day → see pro-rate panel with correct session count → edit or accept amount → save → open payments for that child → first payment shows `prorated_calculated` column value.

---

## Phase 10: User Story 7 — Fix Child Photo Upload (Priority: P3)

**Goal**: A photo attached during child add/edit is actually uploaded to cloud storage and persisted. The photo is visible after save.

**Independent Test**: Add Child → attach a photo → save → close form → reopen child record → photo is displayed (not placeholder).

- [X] T054 [US7] Fix upload sequence in `src/pages/Children/ChildForm.tsx`: move `window.api.storage.uploadPhoto()` call to run **before** `children:add`/`children:update`; `await` its result; pass returned `url` as `photo_url` and `publicId` as `photo_public_id` in the child save payload
- [X] T055 [US7] Add upload progress state in `src/pages/Children/ChildForm.tsx`: show a loading spinner on the photo preview while upload is in progress; disable the save button until upload completes or is skipped
- [X] T056 [US7] Add non-blocking upload failure handling in `src/pages/Children/ChildForm.tsx`: if `storage:uploadPhoto` throws, show a dismissible warning banner but allow the child to be saved without a photo (per FR-026); clear `photo_url`/`photo_public_id` in the payload on failure
- [X] T057 [P] [US7] Add i18n keys for photo upload states to `src/i18n/en.json` and `src/i18n/ar.json`: "uploading photo", "photo upload failed — child saved without photo"

**Checkpoint**: Add child with photo → save → photo appears in record. Add child with no network for Cloudinary → photo upload fails → non-blocking warning shown → child saves without photo.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T058 [P] Add contract tests for the 5 new IPC channel groups in `tests/contract/`: `roles.test.ts`, `salaryTypes.test.ts`, `serviceDefinitions.test.ts`, `sessions.test.ts`, `attendance.test.ts`
- [X] T059 [P] Add unit tests for all 4 salary formula modes in `tests/unit/salaryFormula.test.ts`: fixed-monthly, per-session-fixed, per-session-pct, hybrid; include edge case of 0 sessions
- [X] T060 [P] Add unit test for pro-rate calculation in `tests/unit/proRate.test.ts`: enrolled on day of last session, enrolled on first session, enrolled on non-session day (zero sessions remaining)
- [X] T061 [P] Add unit test for migration 014 idempotency in `tests/unit/migration-role.test.ts`: run migration twice on the same DB; verify no duplicate `employee_roles` rows
- [X] T062 Bilingual review: search all new translation keys used in components → verify every key has a value in both `src/i18n/en.json` and `src/i18n/ar.json`; fix any missing entries
- [ ] T063 Sync smoke test: run `sync:push` then `sync:pull` with all 7 new entity types having at least one record each; verify no duplicates and `synced=1` after round-trip
- [ ] T064 Run full quickstart.md validation sequence: migrations, role migration, service seed, salary type creation, custom service, session creation, attendance recording, salary calculation with real payable session count

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user story phases
- **US1 (Phase 3)**: Depends on Phase 2 only
- **US2 (Phase 4)**: Depends on Phase 3 (US1) — salary types reference role defaults
- **US8 (Phase 5)**: Depends on Phase 3 (US1) for teacher-session links; completes salary calc started in US2
- **US3 (Phase 6)**: Depends on Phase 2 only — can run in parallel with US1/US2/US8
- **US4 (Phase 7)**: Depends on Phase 6 (US3) — needs `serviceDefinitions:list`
- **US5 (Phase 8)**: Depends on Phase 2 only — pure display fix
- **US6 (Phase 9)**: Depends on Phase 5 (US8) — needs `scheduled_sessions` data
- **US7 (Phase 10)**: Depends on Phase 2 only — isolated bug fix
- **Polish (Phase 11)**: Depends on all desired stories complete

### User Story Dependency Graph

```
Phase 1 (Setup)
    └─► Phase 2 (Foundational)
            ├─► Phase 3 US1 (Roles)
            │       └─► Phase 4 US2 (Salary Types)
            │                   └─► Phase 5 US8 (Attendance) ──► Phase 9 US6 (Pro-Rate)
            ├─► Phase 6 US3 (Services) ──► Phase 7 US4 (Price Fix)
            ├─► Phase 8 US5 (Classes Display)   [parallel]
            └─► Phase 10 US7 (Photo Fix)        [parallel]
```

### Parallel Opportunities Within Stories

```
# Phase 3 (US1) — run in parallel once T011 is done:
T013 Update employees:add/update with role_id
T014 Update employees:get JOIN
T017 Add i18n keys

# Phase 4 (US2) — run in parallel once T018 is done:
T020 Create SalaryTypes.tsx page
T027 Add i18n keys

# Phase 5 (US8) — run in parallel once T028 + T029 are done:
T030 SessionCalendar.tsx
T031 AttendanceSheet.tsx
T032 AttendanceConflicts.tsx
T037 Add i18n keys
```

---

## Implementation Strategy

### MVP (User Stories 1 + 2 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. Complete Phase 3: US1 — Dynamic Roles
3. Complete Phase 4: US2 — Salary Types
4. **STOP AND VALIDATE**: Employees have dynamic roles; salary types are configured; fixed-monthly salaries compute correctly
5. Demo to user before proceeding

### Incremental Delivery

1. Foundation → US1 → US2 → US8 → **Core payroll engine complete**
2. US3 → US4 → **Enrollment pricing correct**
3. US5 → US6 → **Billing breakdowns and pro-rating complete**
4. US7 → **Photo persistence fixed**
5. Polish → **Release**

---

## Notes

- [P] tasks = different files, no shared dependency — safe to implement simultaneously
- [Story] label maps each task to its user story for traceability
- Each story phase is a complete, independently testable increment
- Commit after each checkpoint validation
- US6 (pro-rating) requires at least a few scheduled sessions in the current month to test meaningfully — create test sessions first
- The `employees.role` TEXT column is NOT removed in this feature — kept for backward compat; a future cleanup migration can drop it after all code is confirmed to use `role_id`
