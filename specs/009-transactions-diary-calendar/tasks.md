---

description: "Task list for Transactions Timeline, Child Diary & Staff Calendar"
---

# Tasks: Transactions Timeline, Child Diary & Staff Calendar

**Input**: Design documents from `specs/009-transactions-diary-calendar/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md

**Tests**: Not explicitly requested in the spec — no test tasks are included. Use `quickstart.md` for manual verification of each story.

**Organization**: Tasks are grouped by user story (matching spec.md priorities) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Paths are relative to repo root; `electron/` = main process, `src/` = renderer

---

## Phase 1: Setup

**Purpose**: Nothing new to scaffold — this feature extends the existing Electron/React/SQLite project. No new packages, build config, or lint config needed.

- [X] T001 Confirm dev environment runs cleanly (`npm run dev`) before starting, and note the current highest migration number in `electron/db/migrations/index.ts` (currently `035_daily_payment_transactions`) so new migrations are numbered `036`/`037` without collision.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and sync-registry changes every user story depends on. **Must complete before any user story work.**

- [X] T002 Add migration `036_child_illness_cases` in `electron/db/migrations/index.ts` creating `child_illness_cases` (id, child_id FK, status CHECK open/resolved, description, opened_at, resolved_at, created_at, updated_at, synced) with index `idx_illness_cases_child_status`, per data-model.md.
- [X] T003 Add migration `036b_child_activities` (or combine as `036_child_activities` and renumber the illness-case migration to `037` — keep sequential, no gaps) in `electron/db/migrations/index.ts` creating `child_activities` (id, child_id FK, activity_date, note, media_url, media_type CHECK photo/video, media_status CHECK uploaded/failed, created_at, updated_at, synced) with index `idx_child_activities_child_date`, per data-model.md.
- [X] T004 Add migration `038_drop_daily_payments` in `electron/db/migrations/index.ts` that drops `daily_payments` and `daily_payment_transactions` tables (depends on T002, T003 for numbering).
- [X] T005 [P] In `electron/services/mongoSync.ts`: remove `DailyPaymentModel`, `DailyPaymentTransactionModel`, and their two `SYNC_ENTITIES` rows.
- [X] T006 [P] In `electron/services/mongoSync.ts`: add `ChildIllnessCaseModel` and `ChildActivityModel` (mirroring existing schema patterns) plus their `SYNC_ENTITIES` rows (`child_illness_cases`, `child_activities`).
- [X] T007 [P] In `electron/services/cloudinaryService.ts`: add `uploadVideo(dataUrl, folder)` mirroring the existing `uploadImage` signed-upload flow but with `resource_type: 'video'` and the `/video/upload` endpoint.
- [X] T008 Remove `electron/ipc/dailyPaymentsIPC.ts` and its registration in `electron/main.ts`; remove its `window.api.dailyPayments.*` bridge entries from the preload bridge file.
- [X] T009 In `electron/ipc/storageIPC.ts`: remove the `daily_payments`/`daily_payment_transactions` DELETE-all wiring (depends on T004, T008).

**Checkpoint**: Schema, sync registry, Cloudinary, and old Daily Billing IPC are settled — user stories can now proceed.

---

## Phase 3: User Story 1 — Remove Daily Billing, add Transactions timeline (Priority: P1) 🎯 MVP

**Goal**: Daily Billing is gone from the UI/data/sync; a Transactions tab shows day/week/month/custom-range financial history.

**Independent Test**: Confirm "Daily Billing" is unreachable everywhere; open "Transactions", switch through Day/Week/Month/Custom, and verify listed rows match the selected window.

### Implementation for User Story 1

- [X] T010 [US1] Create `electron/ipc/transactionsIPC.ts` with `transactions:list` handler: validates `{ range, date?, from?, to?, childId?, status? }`, computes the day/Saturday–Friday-week/month/custom SQL date bounds, and queries `payments` joined to `children`/`child_services` returning `{ child_id, child_name, service_id, service_name, amount, type, date }[]` sorted by date desc.
- [X] T011 [US1] Register `transactionsIPC` in `electron/main.ts` and add `window.api.transactions.list(...)` to the preload bridge file.
- [X] T012 [P] [US1] Create `src/store/useTransactionsStore.ts` (Zustand) holding the current range mode, date/from/to selection, and fetched transaction list, calling `window.api.transactions.list`.
- [X] T013 [P] [US1] Create `src/pages/Transactions/Transactions.tsx`: range-mode toggle (Day/Week/Month/Custom), date pickers appropriate to each mode, and a table listing child, service, amount, type, date.
- [X] T014 [US1] Remove `src/pages/Payments/DailyPayments.tsx` and `src/pages/Payments/DailyPaymentInstallmentsModal.tsx`.
- [X] T015 [US1] Remove `src/store/useDailyPaymentsStore.ts`.
- [X] T016 [US1] In `src/App.tsx`: remove the Daily Billing route/nav entry; add the `Transactions` route and nav entry (bilingual AR/EN label).
- [ ] T017 [US1] Run Part A and Part B of `quickstart.md` to verify Daily Billing is fully gone and Transactions filtering works for all four range modes.

**Checkpoint**: User Story 1 fully functional and independently testable — this alone is a shippable MVP increment.

---

## Phase 4: User Story 2 — Child details timetable + teachers/services (Priority: P1)

**Goal**: A child's details page shows their weekly timetable with assigned teacher and service per slot.

**Independent Test**: Open a child with scheduled services and confirm each day/time slot lists its service and teacher; a child with none shows an empty state.

### Implementation for User Story 2

- [X] T018 [US2] In `electron/ipc/childServicesIPC.ts`: add `childServices:getTimetable` handler returning `TimetableSlot[]` (day/lesson_days, service, teacher) derived from `child_services` (`teacher_id`, `lesson_days`, `service`) joined with `service_teachers` where applicable.
- [X] T019 [US2] Add `window.api.childServices.getTimetable(childId)` to the preload bridge file.
- [X] T020 [P] [US2] Create `src/store/useChildDetailsStore.ts` (Zustand) to hold the active child's timetable data (extendable in later stories for illness/activity/balance).
- [X] T021 [US2] Create `src/pages/Children/ChildDetails.tsx` with a timetable section rendering each slot's day, service, and teacher; empty-state message when no scheduled services exist.
- [X] T022 [US2] In `src/App.tsx`: add a `Children/:id/details` (or equivalent) route and a link from `ChildrenList.tsx`/`ChildForm.tsx` into the new details page.
- [ ] T023 [US2] Run Part C (timetable portion) of `quickstart.md` to verify the timetable section and its empty state.

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 — Illness case vs. activity/media diary (Priority: P2)

**Goal**: The child details page's health section shows the open illness case if one exists, otherwise offers "Add Activity" with note + photo/video via Cloudinary.

**Independent Test**: On a child with no open illness case, add an activity with a note and photo/video and confirm it's viewable afterward; on a child with an open case, confirm the illness case is shown instead.

### Implementation for User Story 3

- [X] T024 [US3] Create `electron/ipc/childIllnessCasesIPC.ts` with `childIllnessCases:getOpen`, `childIllnessCases:create`, `childIllnessCases:resolve`, `childIllnessCases:list` handlers per contracts/ipc-contracts.md.
- [X] T025 [US3] Create `electron/ipc/childActivitiesIPC.ts` with `childActivities:list`, `childActivities:create` (uploads via `cloudinaryService.uploadImage`/`uploadVideo`, sets `media_status: 'failed'` on upload error without failing the whole save), `childActivities:delete` (admin-only) handlers per contracts/ipc-contracts.md.
- [X] T026 [US3] Register `childIllnessCasesIPC` and `childActivitiesIPC` in `electron/main.ts`; add corresponding `window.api.childIllnessCases.*` / `window.api.childActivities.*` entries to the preload bridge file.
- [X] T027 [P] [US3] Create `src/store/useChildActivitiesStore.ts` (Zustand) for illness-case-open check, activity list, and create/delete actions.
- [X] T028 [US3] In `src/pages/Children/ChildDetails.tsx`: add the health section — render the open illness case (existing illness workflow, unchanged) when present; otherwise render an "Add Activity" form (note + photo/video picker) and the chronological diary list with photo previews and video playback.
- [ ] T029 [US3] Run Part C (illness/activity portion) of `quickstart.md`, including the failed-media-upload edge case.

**Checkpoint**: User Stories 1–3 all work independently.

---

## Phase 6: User Story 4 — Paid vs. remaining balance (Priority: P2)

**Goal**: Everywhere payment totals are shown, both "Total Paid" and "Remaining Due" are visible and sum to the total due.

**Independent Test**: View a partially-paid child and confirm both figures are shown and sum correctly; view a fully-paid child and confirm "Remaining Due" is zero.

### Implementation for User Story 4

- [X] T030 [US4] Extend the existing child payment-summary IPC handler (in `electron/ipc/childServicesIPC.ts` or `electron/ipc/paymentsIPC.ts`, whichever currently returns `total_paid`/`total_due`) to add a `remaining_due = total_due - total_paid` field to its response.
- [X] T031 [US4] In `src/pages/Children/ChildDetails.tsx`: add a payment summary block showing "Total Paid" and "Remaining Due" side by side.
- [X] T032 [P] [US4] Update any other existing billing summary view(s) that already show `total_paid` (e.g. Monthly Billing summary cards) to also surface `remaining_due` from the same extended response.
- [ ] T033 [US4] Run Part C (balance portion) of `quickstart.md` to verify both figures display correctly for partially-paid and fully-paid children.

**Checkpoint**: User Stories 1–4 all work independently.

---

## Phase 7: User Story 5 — Shared Calendar page for all roles (Priority: P3)

**Goal**: A Calendar page available to admin and employee alike shows the full aggregated schedule; clicking a day drills into who's scheduled with service/teacher.

**Independent Test**: As an employee, open Calendar, see the monthly view, click a day, and confirm the scheduled users/services/teachers list (or empty state) appears.

### Implementation for User Story 5

- [X] T034 [US5] Create `electron/ipc/calendarIPC.ts` with `calendar:getMonth` (aggregates `child_services` lesson_days/teacher + `scheduled_sessions`/`session_teachers` for a given year/month, grouped by day) and `calendar:getDay` (drill-down list for one date, empty array when nothing scheduled) per contracts/ipc-contracts.md — no per-role filtering.
- [X] T035 [US5] Register `calendarIPC` in `electron/main.ts`; add `window.api.calendar.getMonth(...)` / `window.api.calendar.getDay(...)` to the preload bridge file.
- [X] T036 [P] [US5] Create `src/store/useCalendarStore.ts` (Zustand) for the current month's aggregated entries and the selected day's drill-down.
- [X] T037 [US5] Create `src/pages/Calendar/Calendar.tsx`: month grid view populated from `calendar:getMonth`; clicking a day opens a detail panel/modal from `calendar:getDay` listing scheduled users with service/teacher, or an empty state.
- [X] T038 [US5] In `src/App.tsx`: add the `Calendar` route and nav entry, visible to both `admin` and `employee` roles (no role-based hiding, per FR-012/Clarifications).
- [ ] T039 [US5] Run Part D of `quickstart.md`, verifying both roles see the identical aggregated calendar and drill-down behavior.

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T040 [P] Add/adjust bilingual (AR/EN) strings for all new UI: Transactions tab, Child Details sections, Calendar page.
- [X] T041 [P] Verify role re-validation (`electron/ipc/_guard.ts`) is applied on every new IPC handler (`transactionsIPC`, `childIllnessCasesIPC`, `childActivitiesIPC`, `calendarIPC`, extended `childServicesIPC`).
- [ ] T042 Run a full push/pull sync cycle and confirm `child_illness_cases`/`child_activities` sync correctly and no `daily_payments`/`daily_payment_transactions` traffic occurs.
- [ ] T043 Run the complete `quickstart.md` end-to-end (Parts A–D) as a final regression pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (schema/sync/Cloudinary/old-IPC-removal must land first).
- **User Stories (Phase 3–7)**: All depend on Foundational completion. US1 and US2 are both P1 and can proceed in parallel; US3 depends on US2's `ChildDetails.tsx` existing (shares the same page/file); US4 also touches `ChildDetails.tsx` and existing summary views; US5 is independent of US2–US4 but shares the same underlying timetable data as US2.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent — only needs Foundational phase.
- **US2 (P1)**: Independent — only needs Foundational phase. Creates `ChildDetails.tsx`, which US3/US4 extend.
- **US3 (P2)**: Builds on US2's `ChildDetails.tsx` file (same page, additional section) but is functionally independent and separately testable.
- **US4 (P2)**: Builds on US2's `ChildDetails.tsx` file (same page, additional section) but is functionally independent and separately testable.
- **US5 (P3)**: Independent of US2–US4's page work; reuses the same `child_services` timetable data conceptually but writes its own IPC/page/store.

### Parallel Opportunities

- T005, T006, T007 (Phase 2) can run in parallel — different files.
- US1 and US2 can be implemented in parallel by different developers once Phase 2 is done.
- T012/T013 (US1) can run in parallel; T020 (US2) is independent of US1's files.
- US5's T034–T038 can run in parallel with US3/US4 since they touch different files.

---

## Parallel Example: Phase 2 (Foundational)

```bash
Task: "In electron/services/mongoSync.ts: remove DailyPaymentModel, DailyPaymentTransactionModel, and their SYNC_ENTITIES rows"
Task: "In electron/services/mongoSync.ts: add ChildIllnessCaseModel and ChildActivityModel plus their SYNC_ENTITIES rows"
Task: "In electron/services/cloudinaryService.ts: add uploadVideo(dataUrl, folder)"
```

## Parallel Example: User Story 1

```bash
Task: "Create src/store/useTransactionsStore.ts"
Task: "Create src/pages/Transactions/Transactions.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — removes Daily Billing plumbing, adds new tables/sync/Cloudinary support)
3. Complete Phase 3: User Story 1 (Transactions tab replacing Daily Billing)
4. **STOP and VALIDATE**: Run quickstart.md Parts A–B independently
5. Deploy/demo if ready — this alone satisfies the most explicit ask in the original request

### Incremental Delivery

1. Setup + Foundational → foundation ready (old Daily Billing gone, new schema/sync/Cloudinary in place)
2. Add US1 (Transactions) → validate → deploy (MVP)
3. Add US2 (Child timetable) → validate → deploy
4. Add US3 (Illness/activity diary) → validate → deploy
5. Add US4 (Paid/remaining balance) → validate → deploy
6. Add US5 (Shared Calendar) → validate → deploy
7. Phase 8 polish pass

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. Once Foundational is done:
   - Developer A: US1 (Transactions)
   - Developer B: US2 (Child timetable) → hands `ChildDetails.tsx` to Developer C
   - Developer C: US3 + US4 (extend `ChildDetails.tsx` once US2's skeleton exists)
   - Developer D: US5 (Calendar, fully independent)
3. Stories complete and integrate independently; Phase 8 polish once all are merged.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps each task to its user story for traceability.
- No test tasks included — tests were not requested in the spec; use `quickstart.md` for manual verification at each checkpoint.
- Commit after each task or logical group.
- US3 and US4 both touch `src/pages/Children/ChildDetails.tsx` — coordinate to avoid merge conflicts if worked on in parallel.

## Implementation Notes (as actually built)

- **T020 deviation**: no separate `useChildDetailsStore.ts` was created. Timetable and balance data
  are fetched directly inside `ChildDetails.tsx` with local component state, matching the existing
  `ChildStatement.tsx` page's convention (which also fetches `children.statement` directly without
  a dedicated store) — avoids an unnecessary abstraction for a single read-only fetch.
- **T032 re-checked and found already satisfied**: Monthly Payments (`MonthlyPayments.tsx`) already
  displays `summary.arrears` (from `paymentsIPC.ts`'s existing summary calculation) as its
  outstanding/remaining figure alongside `totalInvoiced`/`totalCollected` — this is the same
  "remaining due next to paid" pairing FR-010 asks for, just under an existing name (`arrears`)
  rather than the new `remainingDue` field. No changes were needed there; `remainingDue` was added
  specifically for the new Child Details page, which had no such figure before.
- **T017/T023/T029/T033/T039 (quickstart.md manual walkthroughs) and T042/T043 (full sync cycle /
  end-to-end pass)**: not run — these require driving the actual Electron app UI and a live
  MongoDB connection, neither of which was exercised in this session. What *was* verified
  automatically: `tsc -b` (clean build across the whole project), `eslint` on every new/changed
  file (clean after one fix in `calendarIPC.ts`), and the full existing Vitest suite (377/377
  passing, no regressions). Manual verification against `quickstart.md` is still recommended
  before shipping.
- Migration numbering: implemented as `036_child_illness_cases`, `037_child_activities`,
  `038_drop_daily_payments` (sequential, matching the plan's intent — T003's "or renumber" note
  was resolved this way).
