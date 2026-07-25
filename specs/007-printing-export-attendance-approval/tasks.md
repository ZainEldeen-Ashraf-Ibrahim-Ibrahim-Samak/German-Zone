---

description: "Task list for Printing & Export System + Attendance Edit Approval Workflow"
---

# Tasks: Printing & Export System + Attendance Edit Approval Workflow

**Input**: Design documents from `specs/007-printing-export-attendance-approval/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md (all present)

**Tests**: Included — the spec's Success Criteria (SC-004, SC-005) and Edge Cases are explicitly
verification-worthy (payroll consistency, duplicate-request prevention, audit trail correctness), so unit
tests are generated per story rather than left optional.

**Organization**: Tasks are grouped by user story (US1–US6, matching spec.md's numbering) to enable
independent implementation and testing of each story. Phases are ordered by priority: the three P1
stories first (US1, US5, US6 — note US5 must precede US6 since the lock is what US6 provides a way
through), then P2 (US2, US3), then P3 (US4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Every task includes exact file path(s)

## Path Conventions

Single-repo Electron desktop app (per plan.md): `electron/` (main process), `src/` (React renderer),
`tests/unit/` (Vitest).

---

## Phase 1: Setup

**Purpose**: Shared scaffolding needed before foundational work — no new dependencies (ExcelJS/pdfmake
already present per research.md #1–#3).

- [X] T001 [P] Add `AttendanceEditRequest`, `AttendanceAuditLogEntry`, `Notification` types (per
      data-model.md) to `src/types/index.ts`
- [X] T002 [P] Create `electron/services/csvService.ts` with an RFC-4180 escaping helper and a
      `buildCsvFile(rows: string[][], header: { filters, generatedAt, totalsRow? }, savePath: string)`
      scaffold, no report-specific logic yet
- [X] T003 [P] Create `electron/services/printService.ts` scaffold exposing
      `buildPrintPreviewHtml(docDefinition): string`, reusing the styling already produced by
      `pdfService.ts` document definitions (per research.md #2)
- [X] T004 [P] Create `src/components/reports/ReportActions.tsx` scaffold — a shared button group
      (`Print`, `Export PDF`, `Export Excel`, `Export CSV`) accepting `{ onPrint, onExportPdf,
      onExportExcel, onExportCsv, isBusy }` props, not yet wired to any page

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add migration `031_attendance_edit_requests` (table per data-model.md, including the
      partial-unique/application check groundwork for "at most one pending per attendance_record_id") in
      `electron/db/migrations/index.ts`
- [X] T006 Add migration `032_attendance_audit_log` (append-only table per data-model.md) in
      `electron/db/migrations/index.ts`
- [X] T007 Add migration `033_notifications` (table per data-model.md) in
      `electron/db/migrations/index.ts`
- [X] T008 Extract the existing inline payment-eligibility/void/regenerate logic inside
      `attendance:record` (feature 006, uses `isPaymentEligible()`) into a reusable
      `recalculateAttendancePayment(db, { child_id, teacher_id, session_id, status, teacher_status })`
      function in `electron/ipc/attendanceIPC.ts`, and call it from the existing direct-write path so
      behavior is unchanged (per research.md #5 — this is what both the admin-direct-edit path and the
      edit-request approval path will call)
- [X] T009 Create `electron/ipc/notificationsIPC.ts` with `notifications:list`, `notifications:markRead`
      handlers, and an exported `insertNotification(db, { user_id, type, related_id, message_ar,
      message_en })` helper for other IPC modules to call
- [X] T010 Register `notificationsIPC.ts` for side-effect import in `electron/main.ts` alongside the
      existing IPC module registrations
- [X] T011 Add `window.api.notifications.*`
      (`list`, `markRead`), `window.api.attendance.requestEdit/listEditRequests/decideEditRequest/
      getAuditLog`, `window.api.export.payrollReport/childReport/financialTransactions`, and
      `window.api.print.preview` bridge entries in `electron/preload.ts`
- [X] T012 [P] Create `src/store/useNotificationsStore.ts` (list, markRead, unread count) in
      `src/store/useNotificationsStore.ts`
- [X] T013 [P] Create `src/store/useAttendanceEditRequestsStore.ts` (list, requestEdit, decide) in
      `src/store/useAttendanceEditRequestsStore.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Print and export the Salary Report (Priority: P1) 🎯 MVP

**Goal**: Admin can Print/Export PDF/Export Excel/Export CSV the Payroll Report with live filters, sort,
date range, totals, logo, and generation timestamp preserved.

**Independent Test**: Open Payroll Report, apply a date range/teacher filter, use Print/Export PDF/Export
Excel/Export CSV in turn, verify each output matches the filtered on-screen data — no other story needed.

### Tests for User Story 1

- [X] T014 [P] [US1] Unit test for payroll report row-shaping and totals computation (including the
      zero-rows/empty-report case, FR-009) in `tests/unit/exportReportShapes.test.ts`

### Implementation for User Story 1

- [X] T015 [P] [US1] Add `generatePayrollReportSheet(ws, workbook, brand, { dateFrom, dateTo, teacherId },
      lang)` to `electron/services/exportService.ts` — columns per FR-005 (teacher name, sessions paid,
      session rate, total salary, payment status, date range), sourced from `teacher_payments` (matching
      `PayrollReport.tsx`'s existing data shape)
- [X] T016 [P] [US1] Add a payroll report PDF document-definition builder (same filters/columns/totals) to
      `electron/services/pdfService.ts`
- [X] T017 [US1] Add a payroll report CSV builder to `electron/services/csvService.ts` (depends on T015
      for the row shape)
- [X] T018 [US1] Add `export:payrollReport` handler (dispatches to xlsx/pdf/csv builders, native save
      dialog, same pattern as existing `export:*` handlers) to `electron/ipc/exportIPC.ts` (depends on
      T015, T016, T017)
- [X] T019 [US1] Add `print:preview` support for `reportType: 'payroll'` (depends on T016) in
      `electron/ipc/exportIPC.ts` / `electron/services/printService.ts`
- [X] T020 [US1] Wire `ReportActions` (T004) into `src/pages/Salaries/PayrollReport.tsx`, passing the
      screen's current date range/teacher filter through to `window.api.export.payrollReport` /
      `window.api.print.preview`, and opening a print-preview window that calls `window.print()` (depends
      on T004, T018, T019)

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 5 - Attendance is locked after saving (Priority: P1)

**Goal**: Non-admin users can no longer directly overwrite a previously-saved attendance record; admins
still can, and every admin direct edit is audit-logged.

**Independent Test**: Save attendance as an employee, attempt a direct re-edit as employee (blocked) and
as admin (allowed + audit-logged) — independent of export/print and of the edit-request flow.

### Tests for User Story 5

- [X] T021 [P] [US5] Unit test for the lock allow/block matrix (employee vs admin, existing vs new row)
      in `tests/unit/attendanceLock.test.ts`

### Implementation for User Story 5

- [X] T022 [US5] Create `writeAuditLog(db, entry)` helper (inserts one `attendance_audit_log` row per
      data-model.md) in `electron/services/attendanceAuditService.ts` (depends on T006)
- [X] T023 [US5] Add the lock check to `attendance:record` in `electron/ipc/attendanceIPC.ts`: before
      upserting, look up an existing row for `(session_id, child_id, teacher_id)`; if found and the caller
      is not admin, skip the write and return a per-row `{ locked: true }` marker instead of overwriting
      (FR-011) (depends on T005/T006 tables existing is not required here, but T022 is)
- [X] T024 [US5] For admin callers writing to an existing row, call `recalculateAttendancePayment` (T008)
      as already wired, and additionally call `writeAuditLog` (T022) with `edit_request_id: null`,
      `changed_by = approved_by = <admin user>` (FR-012, FR-021) in `electron/ipc/attendanceIPC.ts`
      (depends on T008, T022, T023)
- [X] T025 [US5] Add a computed `locked: boolean` (row exists) to each row returned by
      `attendance:getSheet` in `electron/ipc/attendanceIPC.ts`
- [X] T026 [US5] Update the attendance sheet UI in `src/pages/Sessions/SessionsList.tsx`: for non-admin
      users, disable direct status controls on `locked` rows and show a lock indicator in place of them
      (depends on T025)

**Checkpoint**: User Stories 1 and 5 both work independently. The lock is now live and protects data even
before the request/approval UI (US6) exists — non-admins simply can't reach a locked row yet.

---

## Phase 5: User Story 6 - Submit and decide attendance Edit Requests (Priority: P1)

**Goal**: Employees route corrections through an auditable Edit Request; admins approve (attendance +
payment updated, audit-logged, requester notified) or reject (nothing changes, requester notified).

**Independent Test**: Submit a request as employee, approve one and reject another as admin, verify
outcomes and notifications — independent of export/print.

### Tests for User Story 6

- [X] T027 [P] [US6] Unit test edit-request lifecycle (submit → pending → approve/reject) and duplicate
      concurrent-pending rejection (FR-015) in `tests/unit/attendanceEditRequests.test.ts`
- [X] T028 [P] [US6] Unit test payment void/regenerate on approval, reusing feature 006's eligibility
      rules via `recalculateAttendancePayment` (T008), in `tests/unit/attendanceEditRequests.test.ts`
- [X] T029 [P] [US6] Unit test the concurrent-decision race guard (`UPDATE ... WHERE status = 'pending'` —
      second decision on an already-decided request is a no-op) in
      `tests/unit/attendanceEditRequests.test.ts`
- [X] T030 [P] [US6] Unit test audit log entry shape for both the admin-direct path (US5) and the
      approved-request path, in `tests/unit/attendanceAuditLog.test.ts`
- [X] T031 [P] [US6] Unit test notification creation: admin(s) notified on submit, requester notified on
      approve/reject, in `tests/unit/notifications.test.ts`

### Implementation for User Story 6

- [X] T032 [US6] Implement `attendance:requestEdit` in `electron/ipc/attendanceIPC.ts`: reject if caller
      is admin (admins use direct edit) or if a pending request already exists for that
      `attendance_record_id` (returning the existing request per Edge Cases), else insert a new `pending`
      row and call `insertNotification` (T009) for every admin user (depends on T005, T009)
- [X] T033 [US6] Implement `attendance:listEditRequests` in `electron/ipc/attendanceIPC.ts` — admin sees
      all matching rows, employee sees only rows where `requested_by` is themselves (depends on T005)
- [X] T034 [US6] Implement `attendance:decideEditRequest` in `electron/ipc/attendanceIPC.ts`: approve path
      runs in one transaction — apply requested values to `attendance_records`, call
      `recalculateAttendancePayment` (T008), call `writeAuditLog` (T022) with the request's id, flip the
      request to `approved` via `UPDATE ... WHERE status = 'pending'`, then `insertNotification` to the
      requester; reject path flips to `rejected` (same guard) and notifies the requester with no other
      writes (depends on T005, T008, T009, T022)
- [X] T035 [US6] Implement `attendance:getAuditLog` (admin-only, chronological by `attendance_record_id`)
      in `electron/ipc/attendanceIPC.ts` (depends on T006)
- [X] T036 [P] [US6] Create `src/pages/Attendance/EditRequestsInbox.tsx` (admin-only): list
      pending/approved/rejected requests with approve/reject actions and an optional decision note
      (depends on T013)
- [X] T037 [US6] Add a "Request Edit" action on locked rows in `src/pages/Sessions/SessionsList.tsx` for
      non-admin users — modal capturing requested values + reason, calling
      `useAttendanceEditRequestsStore.requestEdit` (depends on T013, T026, T032)
- [X] T038 [US6] Add an audit-log viewer (per attendance record, admin-only) reachable from both
      `SessionsList.tsx` and `EditRequestsInbox.tsx` (depends on T035, T036)
- [X] T039 [US6] Wire a notifications indicator (badge/panel using `useNotificationsStore`, T012) into the
      main app layout in `src/App.tsx` (or its nav component) (depends on T012)
- [X] T040 [US6] Add a route + nav entry for `EditRequestsInbox` (admin-only) in `src/App.tsx` (depends on
      T036)

**Checkpoint**: All three P1 stories (US1, US5, US6) are complete — this is the recommended MVP cut-line
(see Implementation Strategy).

---

## Phase 6: User Story 2 - Print and export the Expenses Report (Priority: P2)

**Goal**: Admin can Print/Export PDF/Export Excel/Export CSV the Expenses Report with category/date-range
filters preserved.

**Independent Test**: Filter Expenses Report by category/date range, export/print, verify output matches
filtered view — independent of every other story.

### Implementation for User Story 2

- [X] T041 [P] [US2] Add `category`/`dateFrom`/`dateTo` filter parameters to `generateExpensesSheet` in
      `electron/services/exportService.ts` (currently year-only)
- [X] T042 [P] [US2] Add the matching filter parameters to the Expenses PDF document-definition builder in
      `electron/services/pdfService.ts`
- [X] T043 [US2] Add an Expenses Report CSV builder to `electron/services/csvService.ts` (depends on T041
      for row shape)
- [X] T044 [US2] Extend `export:expenses` in `electron/ipc/exportIPC.ts` to accept
      `category`/`dateFrom`/`dateTo` and dispatch a `csv` format branch (depends on T041, T042, T043)
- [X] T045 [US2] Add `print:preview` support for `reportType: 'expenses'` (depends on T042)
- [X] T046 [US2] Wire `ReportActions` (T004) into `src/pages/Expenses/ExpensesList.tsx`, passing the
      screen's live category/date-range filters (depends on T004, T044, T045)

**Checkpoint**: US1, US5, US6, US2 all independently functional.

---

## Phase 7: User Story 3 - Print a complete Child Report (Priority: P2)

**Goal**: Staff can generate a full per-child report (personal info, attendance history, teachers,
services, attendance %, payments, notes) as Print/PDF/Excel/CSV.

**Independent Test**: Open one child's profile, generate the Child Report, verify all required sections
appear in each output format — independent of every other story.

### Tests for User Story 3

- [X] T047 [P] [US3] Unit test attendance-percentage computation and the no-attendance-yet edge case
      (renders empty/0%, not an error) in `tests/unit/exportReportShapes.test.ts`

### Implementation for User Story 3

- [X] T048 [US3] Add `generateChildReportSheet` (multi-section: personal info, attendance history,
      teacher(s), services, attendance %, payment history, notes — per FR-007) to
      `electron/services/exportService.ts`
- [X] T049 [US3] Add a multi-section Child Report PDF document-definition builder to
      `electron/services/pdfService.ts`
- [X] T050 [US3] Add a Child Report CSV builder (one labeled block per section) to
      `electron/services/csvService.ts` (depends on T048 for section shapes)
- [X] T051 [US3] Add `export:childReport` handler to `electron/ipc/exportIPC.ts` (depends on T048, T049,
      T050)
- [X] T052 [US3] Add `print:preview` support for `reportType: 'childReport'` (depends on T049)
- [X] T053 [US3] Add a "Print Child Report" / Export PDF/Excel/CSV toolbar to
      `src/pages/Children/ChildStatement.tsx` (depends on T004, T051, T052)

**Checkpoint**: US1, US5, US6, US2, US3 all independently functional.

---

## Phase 8: User Story 4 - Print and export the Financial Transactions Report (Priority: P3)

**Goal**: Admin can Print/Export PDF/Export Excel/Export CSV a per-child ledger of money movements plus
outstanding balance.

**Independent Test**: Export the Financial Transactions Report for one child, verify transaction rows and
outstanding balance appear — independent of every other story.

### Implementation for User Story 4

- [X] T054 [US4] Add `generateFinancialTransactionsSheet` (existing transaction types — currently
      payments — plus outstanding balance, per FR-008; structured so a future refund/discount/adjustment
      type slots in without a rewrite) to `electron/services/exportService.ts`
- [X] T055 [US4] Add a Financial Transactions PDF document-definition builder to
      `electron/services/pdfService.ts`
- [X] T056 [US4] Add a Financial Transactions CSV builder to `electron/services/csvService.ts` (depends on
      T054 for row shape)
- [X] T057 [US4] Add `export:financialTransactions` handler to `electron/ipc/exportIPC.ts` (depends on
      T054, T055, T056)
- [X] T058 [US4] Add `print:preview` support for `reportType: 'financialTransactions'` (depends on T055)
- [X] T059 [US4] Add a Financial Transactions Report view/toolbar (in `src/pages/Children/
      ChildStatement.tsx` or a new tab there) wired to Print/Export (depends on T004, T057, T058)

**Checkpoint**: All six user stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Quality/consistency pass across all stories

- [X] T060 [P] Verify Arabic (RTL) / English (LTR) rendering across every new export/print output (FR-010)
- [X] T061 [P] Verify the empty-report ("zero matching rows") path renders a clearly-labeled document, not
      an error, across all four export types (FR-009)
- [X] T062 [P] Verify graceful handling when no company logo is configured (Edge Cases) across all
      export/print outputs
- [X] T063 Confirm `ReportActions.tsx` (T004) is the single component used by all four report screens,
      with no per-page duplicate button markup
- [ ] T064 Run the full `quickstart.md` validation (all 10 scenarios) end-to-end against a dev build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational only.
- **US5 (Phase 4)**: Depends on Foundational only (specifically T008's extracted payment-recalc helper).
- **US6 (Phase 5)**: Depends on Foundational AND US5 (needs the lock/`locked` flag from T023/T025 and the
  audit-log helper from T022 to exist first) — not independent of US5, unlike the other story pairs.
- **US2 (Phase 6)**, **US3 (Phase 7)**, **US4 (Phase 8)**: Each depends on Foundational + the shared
  `ReportActions` (T004)/`csvService`/`printService` scaffolding only — independent of US1/US5/US6 and of
  each other.
- **Polish (Phase 9)**: Depends on all desired stories being complete.

### Parallel Opportunities

- All Setup tasks (T001–T004) run in parallel.
- Within Foundational, T005/T006/T007 (separate migrations) and T012/T013 (separate stores) run in
  parallel; T008–T011 are sequential (each builds on the prior).
- Once Foundational is done: **US1, US2, US3, US4 can all be built in parallel** by different
  contributors (they touch disjoint report-shape functions and disjoint pages). **US5 must land before
  US6** (US6's approve path calls US5's audit-log helper and reads its `locked` flag).
- Within a story, tasks marked `[P]` (e.g., T015/T016 in US1, T041/T042 in US2) touch different files and
  can run in parallel; unmarked tasks in the same story are sequential.

---

## Parallel Example: User Story 1

```bash
# After Foundational is complete, launch these together:
Task: "Add generatePayrollReportSheet to electron/services/exportService.ts"
Task: "Add payroll report PDF document-definition builder to electron/services/pdfService.ts"
Task: "Unit test payroll report row-shaping and totals in tests/unit/exportReportShapes.test.ts"
```

## Parallel Example: Four report stories at once (after Foundational)

```bash
# Different contributors, disjoint files:
Contributor A: Phase 3 (US1 — Payroll Report)
Contributor B: Phase 6 (US2 — Expenses Report)
Contributor C: Phase 7 (US3 — Child Report)
Contributor D: Phase 8 (US4 — Financial Transactions Report)
# Meanwhile, Contributor E works Phase 4 → Phase 5 (US5 → US6) sequentially, since US6 depends on US5.
```

---

## Implementation Strategy

### MVP First (the three P1 stories)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks everything).
3. Complete Phase 3 (US1 — Payroll Report export/print) — validates the export engine end-to-end on the
   simplest report shape.
4. Complete Phase 4 (US5 — attendance lock) then Phase 5 (US6 — edit request/approval) — the
   data-integrity half of the feature; ships together since US6 has no effect without US5's lock in place.
5. **STOP and VALIDATE**: run quickstart.md scenarios 1 and 5–10 independently. This is a legitimate,
   demoable MVP: payroll reporting is exportable, and attendance can no longer be silently altered.

### Incremental Delivery

6. Add Phase 6 (US2 — Expenses Report) and Phase 7 (US3 — Child Report) — both P2, can ship in either
   order or in parallel.
7. Add Phase 8 (US4 — Financial Transactions Report) — P3, lowest urgency per research/spec (overlaps with
   data already visible via US3).
8. Finish with Phase 9 (Polish) once all desired stories are in.

### Parallel Team Strategy

With the Foundational phase done, up to five people can work simultaneously: one on US1, one on the
US5→US6 pair (sequential within that person's track), and one each on US2/US3/US4 — all touch disjoint
files per the Project Structure in plan.md.
