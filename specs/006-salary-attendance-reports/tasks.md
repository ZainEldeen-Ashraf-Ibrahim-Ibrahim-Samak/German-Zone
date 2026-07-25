# Tasks: Attendance-Based Teacher Payment System

**Input**: Design documents from `specs/006-salary-attendance-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md

**Tests**: Not explicitly requested in the spec. Vitest unit/contract tests are included as part of each
story's implementation tasks (matching this repo's existing convention of colocated `*.test.ts` files),
not as a separate always-first TDD gate.

**Organization**: Tasks are grouped by user story (US1–US8, from spec.md) to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US8)
- File paths are exact and relative to the repo root

## Path Conventions

Single-repo Electron app: `electron/` (main process), `src/` (React renderer). See plan.md
"Project Structure" for the full file list.

---

## Phase 1: Setup

**Purpose**: Translation scaffolding shared by every story's UI work, so no story phase has to touch the
same i18n files as another.

- [X] T001 [P] Add empty key groups `teacherPayments`, `serviceTeachers`, `payrollReport`,
  `attendanceHistory` to `src/i18n/en.json`
- [X] T002 [P] Add matching Arabic key groups `teacherPayments`, `serviceTeachers`, `payrollReport`,
  `attendanceHistory` to `src/i18n/ar.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and sync changes every user story depends on. All migrations live in the single
`electron/db/migrations/index.ts` file, so they are sequenced here (not split across story phases) to
avoid every story editing the same file.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Add migration `026_service_teachers` (new `service_teachers` table) in
  `electron/db/migrations/index.ts` per data-model.md
- [X] T004 Add migration `027_teacher_session_rate` (guarded `ALTER TABLE employees ADD COLUMN
  teacher_session_rate REAL`) in `electron/db/migrations/index.ts` per data-model.md
- [X] T005 Add migration `028_attendance_teacher_status` (guarded `ALTER TABLE attendance_records ADD
  COLUMN attended_teacher_id`, `ADD COLUMN teacher_status`, plus best-effort backfill of existing rows) in
  `electron/db/migrations/index.ts` per data-model.md
- [X] T006 Add migration `029_teacher_payments` (new `teacher_payments` table with
  `UNIQUE(teacher_id, child_id, attendance_date)` and its two indexes) in
  `electron/db/migrations/index.ts` per data-model.md
- [X] T007 Add `ServiceTeacher`, `TeacherPayment`, `PayrollReportRow`, `AttendanceHistoryRow` interfaces
  and extend `Employee` (`teacher_session_rate`) and `AttendanceRecord` (`attended_teacher_id`,
  `teacher_status`) in `src/types/index.ts` per contracts/ipc-contracts.md
- [X] T008 Add `serviceTeacherSchema` and `teacherPaymentSchema`, extend `employeeSchema` and
  `attendanceRecordSchema`, and register `service_teachers` + `teacher_payments` in `SYNC_ENTITIES` in
  `electron/services/mongoSync.ts` per data-model.md
- [X] T009 Create `electron/ipc/serviceTeachersIPC.ts` and `electron/ipc/teacherPaymentsIPC.ts` and
  `electron/ipc/payrollIPC.ts` as empty handler-registration files (imported next), so subsequent story
  tasks only add handlers to existing files
- [X] T010 Import `serviceTeachersIPC`, `teacherPaymentsIPC`, and `payrollIPC` in `electron/main.ts`
  alongside the other IPC module imports

**Checkpoint**: Schema, types, and sync are ready — user story implementation can now begin.

---

## Phase 3: User Story 3 - Configure a per-teacher session rate (Priority: P1)

**Goal**: Admin can set/update each teacher's own per-session rate, and every downstream calculation
(preview, payment generation) reads it.

**Independent Test**: Set two different rates on two teachers via the UI, confirm both persist after
reload and are returned by `employees:get`.

> Sequenced before US1/US2/US5 because they all read `teacher_session_rate`.

### Implementation for User Story 3

- [X] T011 [US3] Accept and persist `teacher_session_rate` in `employees:add` and `employees:update` in
  `electron/ipc/salariesIPC.ts`
- [X] T012 [US3] Add "Per Session Cost" numeric field to the teacher edit form in
  `src/pages/Employees/EmployeesList.tsx`, wired to `teacher_session_rate`
- [X] T013 [US3] Add unit test for `employees:add`/`employees:update` persisting
  `teacher_session_rate` (including `null`) in `electron/ipc/salariesIPC.test.ts`

**Checkpoint**: Teachers have independently configurable per-session rates, visible everywhere `Employee`
is fetched.

---

## Phase 4: User Story 4 - Assign any of several teachers offering the same service (Priority: P2)

**Goal**: A service can list multiple qualified teachers; enrollment picks one from that list.

**Independent Test**: Attach 3 teachers to a service, assign a child to each of two different teachers
(via reassignment), confirm each reflects the correct teacher/rate and past records are untouched.

### Implementation for User Story 4

- [X] T014 [P] [US4] Implement `serviceTeachers:list` and `serviceTeachers:set` handlers in
  `electron/ipc/serviceTeachersIPC.ts` per contracts/ipc-contracts.md
- [X] T015 [US4] Add `serviceTeachers` bridge entries (`list`, `set`) in `electron/preload.ts`
- [X] T016 [US4] Add a teacher multi-select control to the service editor in
  `src/pages/Settings/ServiceDefinitions.tsx`, backed by `serviceTeachers:list`/`set`
- [X] T017 [US4] Scope the teacher dropdown in the enrollment section of
  `src/pages/Children/ChildForm.tsx` to `serviceTeachers:list` results for the selected service (falling
  back to the existing full `teachers:list` when a service has no configured teacher list)
- [X] T018 [P] [US4] Add unit test for `serviceTeachers:set` replacing the full list for a service in
  `electron/ipc/serviceTeachersIPC.test.ts`

**Checkpoint**: Services support multiple teachers; enrollment UI reflects the correct roster per service.

---

## Phase 5: User Story 2 - Preview expected cost when assigning a child (Priority: P1)

**Goal**: While assigning a child to a teacher, show remaining scheduled sessions this month and expected
cost, live, without persisting anything.

**Independent Test**: Assign a child to a teacher with a known schedule and rate mid-month; confirm the
displayed remaining-session count and expected cost match a manual calculation, and that cancelling the
form leaves no payment/balance trace.

### Implementation for User Story 2

- [X] T019 [US2] Implement `childServices:previewTeacherCost` handler in
  `electron/ipc/childServicesIPC.ts` (weekday-matching remaining-session count × `teacher_session_rate`)
  per research.md #5 and contracts/ipc-contracts.md
- [X] T020 [US2] Add `childServices.previewTeacherCost` bridge entry in `electron/preload.ts`
- [X] T021 [US2] Show a live "Remaining sessions this month: N · Expected cost: X EGP" preview in the
  enrollment section of `src/pages/Children/ChildForm.tsx`, recomputed on teacher/lesson-day change
- [X] T022 [P] [US2] Add unit test for `childServices:previewTeacherCost` covering: mid-month assignment,
  zero-remaining-sessions edge case, and a teacher with `teacher_session_rate = null` in
  `electron/ipc/childServicesIPC.test.ts`

**Checkpoint**: Admins see an accurate, non-persisted cost preview at assignment time.

---

## Phase 6: User Story 1 - Assign a child to a teacher without draining session balance (Priority: P1)

**Goal**: Guarantee assignment remains balance-neutral, now that per-teacher rates and previews
(US2/US3/US4) exist and could tempt a regression.

**Independent Test**: Assign several children to a teacher; confirm `employees:get` /
`attendance:getSummary` figures for that teacher are unchanged immediately after assignment, before any
attendance is recorded.

### Implementation for User Story 1

- [X] T023 [US1] Audit `childServicesIPC.ts` and `childrenIPC.ts` enrollment/assignment code paths to
  confirm no write touches `employees`, `salary_payments`, or session-count fields as a side effect of
  saving a `child_services`/`children.teacher_id` assignment; remove any such write if found
- [X] T024 [US1] Add a regression test asserting a teacher's `attendance:getSummary` and `employees:get`
  net salary are identical before and after assigning N children to them (no attendance recorded) in
  `electron/ipc/childServicesIPC.test.ts`

**Checkpoint**: Assignment is verified balance-neutral by an automated regression test, not just by
inspection.

---

## Phase 7: User Story 5 - Record attendance and generate teacher payments automatically (Priority: P1)

**Goal**: Saving attendance (teacher status + child status) automatically evaluates the five payment cases
and creates/updates a `teacher_payments` row with no separate manual step.

**Independent Test**: Record each of the five attendance combinations and confirm a payment is generated
only for teacher-present + child-present, and teacher-present + child-absent-unexcused.

### Implementation for User Story 5

- [X] T025 [US5] Accept `teacher_status` per record and snapshot `attended_teacher_id` (from the child's
  current `child_services.teacher_id`/`children.teacher_id` for that service) when upserting
  `attendance_records` in `electron/ipc/attendanceIPC.ts` (`attendance:record`)
- [X] T026 [US5] Implement the payment-eligibility evaluation (FR-008…FR-011) inside the same
  `attendance:record` transaction: upsert a `pending` `teacher_payments` row (snapshotting
  `teacher_session_rate` as `session_cost`) when payable, in `electron/ipc/attendanceIPC.ts` (depends on
  T025)
- [X] T027 [US5] Implement `teacherPayments:list` handler in `electron/ipc/teacherPaymentsIPC.ts` per
  contracts/ipc-contracts.md
- [X] T028 [US5] Add `teacherPayments.list` and `teacherPayments.markPaid` bridge entries in
  `electron/preload.ts` (markPaid handler itself is implemented in US6, T032)
- [X] T029 [US5] Add a teacher-status control (Present/Absent) alongside the existing child-status control
  in the attendance UI in `src/pages/Sessions/SessionsList.tsx`
- [X] T030 [US5] Add unit tests covering all five payment-eligibility cases (payable and non-payable) for
  `attendance:record` in `electron/ipc/attendanceIPC.test.ts`

**Checkpoint**: Attendance saves automatically and correctly generate teacher payments per the five rules.

---

## Phase 8: User Story 6 - Prevent duplicate payments on attendance edits (Priority: P1)

**Goal**: Editing an already-saved attendance record never produces more than one payment for the same
teacher/child/date; disqualifying edits void (not delete) the payment; a `paid` payment is never
auto-mutated.

**Independent Test**: Save a qualifying attendance record, edit it repeatedly (including toggling
qualify/disqualify), and confirm at most one `teacher_payments` row ever exists for that
teacher/child/date, with correct status transitions.

### Implementation for User Story 6

- [X] T031 [US6] Extend the T026 payment evaluation in `electron/ipc/attendanceIPC.ts` so a disqualifying
  edit sets an existing `pending` `teacher_payments` row to `void` (never deletes it, never touches a
  `paid` row), and a requalifying edit on a `void` row moves it back to `pending` with a fresh
  `session_cost` snapshot at the current rate (depends on T026)
- [X] T032 [US6] Implement `teacherPayments:markPaid` handler (`pending` → `paid` only) in
  `electron/ipc/teacherPaymentsIPC.ts`
- [X] T033 [US6] Wire attendance deletion (`attendance:delete` in `electron/ipc/attendanceIPC.ts`) to void
  (not leave orphaned) any associated `pending` `teacher_payments` row, consistent with T031
- [X] T034 [P] [US6] Add unit tests for: repeated identical saves produce one row; disqualify → void;
  requalify → pending with new snapshot; `paid` rows are never auto-voided; deleting attendance voids the
  pending payment, in `electron/ipc/attendanceIPC.test.ts`

**Checkpoint**: Duplicate protection and status-transition rules hold under repeated edits, verified by
tests, not just the DB constraint.

---

## Phase 9: User Story 7 - Review attendance history per child and per session (Priority: P2)

**Goal**: Attendance screen and child profile both show the full teacher/child/payment picture per record.

**Independent Test**: After a mix of qualifying/non-qualifying attendance for a child, both the attendance
screen and the child's profile show matching teacher/child status, absence type, payment-generated flag,
and amount for every record.

### Implementation for User Story 7

- [X] T035 [US7] Extend `attendance:getSheet` in `electron/ipc/attendanceIPC.ts` to join
  `teacher_payments` and return `teacher_status`, `attended_teacher_id`, and a `payment` object per row
- [X] T036 [US7] Implement `attendance:getChildHistory` handler in `electron/ipc/attendanceIPC.ts` per
  contracts/ipc-contracts.md (`AttendanceHistoryRow[]`)
- [X] T037 [US7] Add `attendance.getChildHistory` bridge entry in `electron/preload.ts`
- [X] T038 [US7] Add "Generated Payment" and "Payment Amount" columns to the attendance table in
  `src/pages/Sessions/SessionsList.tsx` (depends on T035)
- [X] T039 [US7] Add an "Attendance History" section to `src/pages/Children/ChildStatement.tsx` listing
  date, teacher, teacher status, child status, excused/not, payment-generated flag, and session cost
  (depends on T036, T037)
- [X] T040 [P] [US7] Add unit test for `attendance:getChildHistory` field completeness and ordering in
  `electron/ipc/attendanceIPC.test.ts`

**Checkpoint**: Both attendance and child-profile views give a transparent, matching picture of every
recorded session and its payment outcome.

---

## Phase 10: User Story 8 - Generate a monthly payroll report (Priority: P2)

**Goal**: Admins can generate a monthly per-teacher report of sessions paid, session cost, and total
salary from `teacher_payments`.

**Independent Test**: Generate a month of attendance producing a known number of paid sessions for a
teacher at a known rate; the report's sessions-paid and total-salary figures match a manual recount.

### Implementation for User Story 8

- [X] T041 [US8] Implement `payroll:report` handler in `electron/ipc/payrollIPC.ts` per
  contracts/ipc-contracts.md (group `teacher_payments` by teacher/month, excluding `void`)
- [X] T042 [US8] Add `payroll.report` bridge entry in `electron/preload.ts`
- [X] T043 [US8] Create `src/pages/Salaries/PayrollReport.tsx` (month/year picker + per-teacher table:
  name, sessions paid, session cost, total salary)
- [X] T044 [US8] Add a route for the payroll report page and a link to it from
  `src/pages/Salaries/SalariesList.tsx`
- [X] T045 [P] [US8] Add unit test for `payroll:report` aggregation (mixed pending/paid/void rows across
  two teachers and two months) in `electron/ipc/payrollIPC.test.ts`

**Checkpoint**: All eight user stories are independently functional; payroll report reconciles with raw
attendance data.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Access-control hardening and end-to-end verification across all stories.

- [X] T046 [P] Enforce `requireAdmin()` on `teacherPayments:list`, `teacherPayments:markPaid`,
  `payroll:report`, and `serviceTeachers:set` in their respective IPC files (confirm none were left on
  `checkAuth` during earlier phases)
- [X] T047 [P] Fill in the `teacherPayments`, `serviceTeachers`, `payrollReport`, `attendanceHistory`
  translation keys added in T001/T002 with final English and Arabic copy across every touched component
- [X] T048 Run through `quickstart.md` end-to-end in the running dev app and fix any discrepancies found
- [X] T049 Add `service_teachers` and `teacher_payments` push/pull coverage to the sync integration test
  (if one exists) or a new lightweight test confirming both entities round-trip through `SYNC_ENTITIES`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (single shared migrations/types/
  sync files).
- **User Story 3 (Phase 3)**: Depends only on Foundational. Sequenced first because US1, US2, and US5 all
  read `teacher_session_rate`.
- **User Story 4 (Phase 4)**: Depends only on Foundational. Independent of US3 in code, but both touch
  `ChildForm.tsx`'s enrollment section — implement US3-relevant reads before US4 if working sequentially to
  avoid rebasing the same file twice.
- **User Story 2 (Phase 5)**: Depends on Foundational + US3 (needs `teacher_session_rate` to compute a
  cost).
- **User Story 1 (Phase 6)**: Depends on Foundational; logically follows US2/US3/US4 since it's a
  regression guard against the assignment code paths those stories touch.
- **User Story 5 (Phase 7)**: Depends on Foundational + US3 (needs the rate to snapshot `session_cost`).
- **User Story 6 (Phase 8)**: Depends on US5 (extends the same evaluation logic and table).
- **User Story 7 (Phase 9)**: Depends on US5/US6 (reads `teacher_payments` rows they create).
- **User Story 8 (Phase 10)**: Depends on US5/US6 (aggregates `teacher_payments`).
- **Polish (Phase 11)**: Depends on all desired stories being complete.

### Parallel Opportunities

- T001/T002 (Setup) in parallel.
- Within Foundational, T003–T006 touch the same file sequentially (one migration file); T007 and T008 can
  run in parallel with each other and with T003–T006 (different files); T009 can run in parallel with
  T003–T008; T010 depends on T009.
- US4's T014 and T018 in parallel; US2's T022 independent of T019–T021 once T019 lands (write test after).
- US6's T034 and US7's T040 and US8's T045 are each independent test-only tasks, parallelizable with the
  next story's early tasks once their own story's implementation tasks land.
- T046/T047 (Polish) in parallel with each other.

---

## Parallel Example: Foundational Phase

```bash
Task: "Add ServiceTeacher, TeacherPayment, PayrollReportRow, AttendanceHistoryRow interfaces in src/types/index.ts"
Task: "Add serviceTeacherSchema and teacherPaymentSchema, extend SYNC_ENTITIES in electron/services/mongoSync.ts"
Task: "Create empty electron/ipc/serviceTeachersIPC.ts, teacherPaymentsIPC.ts, payrollIPC.ts"
```

---

## Implementation Strategy

### MVP First

The smallest end-to-end slice that demonstrates the core value ("pay teachers from attendance, not
assignment") is: Foundational → US3 (rate) → US5 (payment generation) → US6 (duplicate protection). This
already delivers a correct, safe payment ledger before any preview/report UI exists.

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US3 — per-teacher rate).
3. Complete Phase 7 (US5 — automatic payment generation) and Phase 8 (US6 — duplicate protection).
4. **STOP and VALIDATE**: run the attendance-case matrix from quickstart.md step 4–5 manually.
5. Add Phase 5 (US2 — preview), Phase 4 (US4 — multi-teacher services), Phase 6 (US1 — regression guard),
   Phase 9 (US7 — history views), Phase 10 (US8 — payroll report) incrementally in priority order.
6. Finish with Phase 11 (Polish).

### Incremental Delivery

Each phase checkpoint above is independently demoable: US3 → "teachers have rates"; US5+US6 →
"attendance pays teachers correctly and safely"; US2 → "admins see cost before committing"; US4 →
"multiple teachers per service"; US1 → "assignment provably doesn't drain anything"; US7 → "full
transparency"; US8 → "payroll report."

---

## Notes

- [P] tasks touch different files with no unfinished dependency between them.
- [Story] labels map every implementation task to its spec.md user story for traceability.
- Migrations 026–029 are sequenced together in Phase 2 specifically because SQLite migrations in this
  codebase live in one array in one file (`electron/db/migrations/index.ts`) — splitting them across story
  phases would just create merge churn on the same file, not real parallelism.
- Commit after each task or logical group per the repository's existing convention (see recent commit
  history for granularity).
- Run `quickstart.md` fully (T048) before considering the feature done.
