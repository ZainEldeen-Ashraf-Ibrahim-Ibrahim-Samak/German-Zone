# Tasks: Daily Billing (008)

**Input**: Design documents from `specs/008-daily-billing/`

**Prerequisites**: [plan.md](./plan.md) ✅ | [spec.md](./spec.md) ✅ | [research.md](./research.md) ✅ | [data-model.md](./data-model.md) ✅ | [contracts/ipc.md](./contracts/ipc.md) ✅ | [quickstart.md](./quickstart.md) ✅

**Tests**: Not requested in spec — no test tasks generated.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to ([US1]–[US4])
- Exact file paths included in every task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Wire in the new entity at the DB and infrastructure layer — must complete before any UI story can be built.

- [x] T001 Add migration `034_daily_payments` (table + 3 indexes) to `electron/db/migrations/index.ts`
- [x] T002 Add `DailyPayment` TypeScript interface to `src/types/index.ts` (after existing `Payment` interface)
- [x] T003 [P] Add `dailyPaymentSchema` + `DailyPaymentModel` to `electron/services/mongoSync.ts`
- [x] T004 [P] Register `{ name: 'daily_payments', model: DailyPaymentModel, table: 'daily_payments' }` in the `SYNC_ENTITIES` array in `electron/services/mongoSync.ts`

> **Note**: T003 and T004 are both in `mongoSync.ts` — do them together in one edit. Marked [P] relative to T001/T002 which are in different files.

**Checkpoint**: DB schema exists, TypeScript types defined, MongoDB model registered. Foundation is ready.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: IPC layer and preload bridge — MUST be complete before any renderer work (store, page) can begin.

**⚠️ CRITICAL**: Phases 3–5 cannot start until this phase is complete.

- [x] T005 Create `electron/ipc/dailyPaymentsIPC.ts` with all 7 IPC handlers:
  - `daily_payments:get` — fetch by `billing_date`, return `{ payments, byChild, summary }`
  - `daily_payments:generate` — create rows for active daily-unit children, return `{ created }`
  - `daily_payments:update` — update paid/qty/notes/method, enforce admin-only qty change
  - `daily_payments:bulkPay` — mark selected records fully paid
  - `daily_payments:deleteBulk` — admin-only, delete by IDs
  - `daily_payments:deleteAll` — admin-only, delete all for a given `billing_date`
  - `daily_payments:deleteForChild` — admin-only, delete child records for a date
- [x] T006 Import `./ipc/dailyPaymentsIPC.js` in `electron/main.ts` (after existing IPC imports)
- [x] T007 Add `DELETE FROM daily_payments` to the `clearAll` transaction in `electron/ipc/storageIPC.ts`
- [x] T008 Add `dailyPayments` namespace to the `api` object in `electron/preload.ts` (7 channels, after the `payments` section)

**Checkpoint**: `window.api.dailyPayments.*` is callable from the renderer. App starts without errors.

---

## Phase 3: User Story 1 — Generate Daily Bills (Priority: P1) 🎯 MVP

**Goal**: Admin can select a date, click "Generate Daily Bills," and see one row per active daily-unit child/service for that date with correct amounts and "Unpaid" status.

**Independent Test**: Navigate to `/payments/daily`, pick today's date, click "Generate Daily Bills" → rows appear for daily-unit children. Clicking again generates no duplicates. Children with no daily-unit services produce no rows.

### Implementation

- [x] T009 [US1] Create `src/store/useDailyPaymentsStore.ts` with full state shape:
  - `currentDate: string` (ISO, default = today)
  - `setDate`, `fetchDailyPayments`, `generateDailyPayments`
  - `updateDailyPayment`, `bulkPay`, `deleteForChild`, `deleteSelected`, `deleteAll`, `clearError`
- [x] T010 [US1] Create `src/pages/Payments/DailyPayments.tsx` — page skeleton:
  - Header (title + Generate button + Delete All admin button)
  - `<input type="date">` card (replaces month/year selectors from MonthlyPayments)
  - Summary stat cards (totalInvoiced, totalCollected, arrears) — reuse `<Stat>` component
  - Table area with loading / empty states
- [x] T011 [US1] Wire `generateDailyPayments` action to the Generate button in `DailyPayments.tsx`
- [x] T012 [US1] Add route `<Route path="payments/daily" element={<DailyPayments />} />` in `src/App.tsx`
- [x] T013 [US1] Add "Daily Billing" nav link in the Sidebar component (under Payments section):
  - Arabic: `دفع يومي` | English: `Daily Billing` | Route: `/payments/daily`

**Checkpoint**: The Daily Billing page is reachable, daily bills generate correctly, summary totals display, no duplicates on repeat generation.

---

## Phase 4: User Story 2 — Record and Track Daily Payments (Priority: P2)

**Goal**: Staff can open a generated daily billing record, enter a paid amount, and save — status changes to Paid or Partial; summary cards update in real time.

**Independent Test**: Generate bills for a date → find a child row → enter full amount in "Paid" → save → status badge shows "Paid," balance shows 0, summary cards update.

### Implementation

- [x] T014 [US2] Add the billing table to `DailyPayments.tsx`:
  - Reuse `<PaymentRow>` component from `src/pages/Payments/PaymentRow.tsx` (pass `DailyPayment` cast as `Payment`)
  - Hide installments trigger (pass `onOpenInstallments={() => {}}`, suppress the installments button)
  - Wire `onUpdate` → `updateDailyPayment` from store
- [x] T015 [US2] Implement per-child group rows in `DailyPayments.tsx`:
  - Group rows by child (reuse `byChild` shape from store, mirrors Monthly Billing)
  - Show child name / guardian header row with per-child totals
  - Sub-rows per service (PaymentRow)
- [x] T016 [US2] Add bulk-pay toolbar in `DailyPayments.tsx`:
  - Select-all checkbox in table header
  - Per-row checkboxes (via `isSelected` / `onToggleSelect` props)
  - "Bulk Pay" button + payment method selector
  - Wire to `bulkPay` action in store
- [x] T017 [P] [US2] Add payment method selector support: payment methods fetched via `usePaymentMethodsStore` in `DailyPayments.tsx` (same pattern as `MonthlyPayments.tsx`)

**Checkpoint**: Staff can record full and partial payments; bulk-pay works; status badges and summary totals update after every save.

---

## Phase 5: User Story 3 — Search, Filter, and Navigate (Priority: P3)

**Goal**: Admin can filter the daily billing list by status (All/Paid/Partial/Unpaid), search by child name or guardian phone, and switch between dates — the list refreshes instantly.

**Independent Test**: Generate records for multiple children → type child name in search → list narrows. Switch to "Unpaid" filter → only unpaid rows visible. Pick a different date → list refreshes with that date's records.

### Implementation

- [x] T018 [US3] Add search state and inputs to `DailyPayments.tsx`:
  - `searchQuery` (name / guardian search)
  - `phoneQuery` (phone digit search)
  - Render search input rows (same pattern as `MonthlyPayments.tsx`)
- [x] T019 [US3] Add status filter pill buttons to `DailyPayments.tsx`:
  - `statusFilter: 'all' | 'paid' | 'partial' | 'unpaid'`
  - Filter pills: All / Paid / Partial / Unpaid (styled same as Monthly Billing)
- [x] T020 [US3] Implement `filteredByChild` memoised list in `DailyPayments.tsx`:
  - Apply name filter, phone filter, status filter to `byChild` from store
  - Show "X of Y" count when filters are active
- [x] T021 [US3] Wire `<input type="date">` to `setDate` in `useDailyPaymentsStore.ts` so changing the date triggers `fetchDailyPayments`

**Checkpoint**: Search, filter, and date navigation all work independently with no page reload.

---

## Phase 6: User Story 4 — MongoDB Sync (Priority: P4)

**Goal**: Daily billing records push to `sync_daily_payments` MongoDB collection and pull back on demand, using the same conflict-resolution rules as all other entities.

**Independent Test**: Create a daily billing record → Sync → Push → confirm `daily_payments` count > 0 in push results. Clear local DB → Sync → Pull → confirm records restored.

### Implementation

- [x] T022 [US4] Verify end-to-end push: open Sync page, trigger Push, confirm `daily_payments` entry appears in results with the correct pushed count (no code change needed if T003/T004 are correct — this is a verification task)
- [x] T023 [US4] Verify end-to-end pull: on a fresh/cleared local DB, trigger Pull, confirm `daily_payments` records are inserted locally (verification task)
- [x] T024 [US4] Verify conflict resolution: create a record locally, push, modify on a second device (or via MongoDB Compass), pull — confirm most-recent `updated_at` wins (verification task)
- [x] T025 [US4] Verify `storage:clear` behaviour: click "Clear All Data" in Storage page — confirm `daily_payments` local rows are gone and MongoDB collection is untouched (verification task; T007 implements the code change)

> **Note**: US4 is primarily a verification phase — the infrastructure was wired in Phases 1–2 (T003, T004, T007). These tasks confirm correctness end-to-end.

**Checkpoint**: Daily billing records sync bidirectionally with correct conflict resolution. MongoDB untouched on local clear.

---

## Phase 7: Admin Delete Actions (Polish for P1–P3)

**Purpose**: Complete the admin delete surface that blocks certain edge-case user flows.

- [x] T026 [P] Add "Delete All" confirmation modal to `DailyPayments.tsx`:
  - Triggered by "Delete All" button (admin only, visible when records exist)
  - Confirm modal → call `deleteAll` from store → list clears
- [x] T027 [P] Add "Delete Selected" button to bulk actions toolbar in `DailyPayments.tsx`:
  - Visible only for admin role (check `user?.role === 'admin'`)
  - Confirm modal → call `deleteSelected` from store
- [x] T028 Add "Delete from list" per-child button (admin + inactive children only) in `DailyPayments.tsx`:
  - Shown on the child group header row for inactive children
  - Calls `deleteForChild` from store

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final checks, i18n, and validation before the feature is considered shipped.

- [x] T029 [P] Add `daily_payments`-related i18n keys to `src/i18n/ar.json` and `src/i18n/en.json`:
  - `generate_daily_payments`, `daily_billing`, `no_daily_payments`, `daily_billing_period`
- [x] T030 [P] Add `window.api.dailyPayments` TypeScript declaration to the preload type shims (if the project maintains a `window.d.ts` or similar) so the renderer gets full type safety
- [x] T031 Run `npm run dev` — verify no TypeScript errors, app loads, Daily Billing page renders and all actions work end-to-end (quickstart.md verification steps 1–9)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)       ──► Phase 2 (Foundational)  ──► Phases 3–6 (User Stories)
   T001–T004                  T005–T008                    T009–T025
                                                             │
                                                             ▼
                                                        Phase 7 (Delete)
                                                           T026–T028
                                                             │
                                                             ▼
                                                        Phase 8 (Polish)
                                                           T029–T031
```

### Within-Phase Dependencies

| Task | Depends On |
|---|---|
| T004 | T003 (same file — do together) |
| T006 | T005 (must exist before import) |
| T008 | T005 (preload exposes the channel names) |
| T009 | T008 (store calls `window.api.dailyPayments.*`) |
| T010–T013 | T009 (page uses store) |
| T014–T017 | T010 (adds to existing page) |
| T018–T021 | T010 (adds to existing page) |
| T022–T025 | T003, T004, T007 (infrastructure already wired) |
| T026–T028 | T010 (adds to existing page) |
| T029 | T010 (keys referenced in page JSX) |

### Parallel Opportunities

```
# Phase 1 — run together (different files):
T001  electron/db/migrations/index.ts
T002  src/types/index.ts
T003+T004  electron/services/mongoSync.ts

# Phase 2 — do in order within same session:
T005 → T006 → T007 → T008

# Phases 3–5 share the same file (DailyPayments.tsx):
Build page incrementally: T010 skeleton → T014 table → T018 search

# Phase 7 — parallel (all modify DailyPayments.tsx but distinct sections):
T026 (delete-all modal) || T027 (delete-selected toolbar)
Then T028 (per-child delete) after T026/T027

# Phase 8 — parallel:
T029 (i18n files) || T030 (type shims)
```

---

## Implementation Strategy

### MVP First (User Story 1 — Generate + View)

1. Complete **Phase 1** (T001–T004) — DB + types + Mongo model
2. Complete **Phase 2** (T005–T008) — IPC + preload bridge
3. Complete **Phase 3** (T009–T013) — store + page skeleton + route + nav
4. **STOP and VALIDATE**: Navigate to Daily Billing, generate bills, verify list appears
5. Ship MVP if sufficient for current needs

### Incremental Delivery

| Milestone | Tasks Completed | Capability Unlocked |
|---|---|---|
| Foundation | T001–T008 | IPC layer live, DB table exists |
| MVP | T001–T013 | Generate and view daily bills |
| Full billing | T001–T017 | Record payments, bulk pay |
| Full UI | T001–T025 | Search, filter, date nav, sync verified |
| Admin complete | T001–T028 | All delete actions |
| Shipped | T001–T031 | i18n, types, all validation done |

---

## Notes

- `PaymentRow.tsx` is **reused as-is** — no modifications needed. Cast `DailyPayment` as `Payment` when passing props.
- The `calculatePayment()` helper in `paymentsIPC.ts` should be imported directly (it's already a named export) in `dailyPaymentsIPC.ts` — no duplication.
- The Sidebar component path: locate it during T013 — likely `src/components/layout/Sidebar.tsx`.
- `[P]` tasks in different phases mean they can be executed in parallel *within* that phase relative to other `[P]` tasks in the same phase; they still depend on the previous phase completing.
- Commit after each phase checkpoint to keep history clean.
