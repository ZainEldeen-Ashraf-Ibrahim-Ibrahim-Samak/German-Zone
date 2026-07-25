---

description: "Task list for Nursery & Autism Center Management System"
---

# Tasks: Nursery & Autism Center Management System

**Input**: Design documents from `/specs/001-nursery-management-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md

**Tests**: Included as a lean, high-value set per the testing strategy in `research.md` (§14): Vitest for financial/business logic and IPC contract shape, Playwright for critical e2e flows. Test tasks are marked and may be skipped if you choose not to test.

**Organization**: Tasks are grouped by user story (priority order) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to a user story (US1…US12 per spec.md)
- File paths follow the Electron layout in plan.md (`electron/` main process, `src/` renderer)

## Path Conventions

- Main process: `electron/` (DB, IPC, export, sync — Node only)
- Renderer: `src/` (React: components, pages, store, hooks, services, types)
- Tests: `tests/unit/`, `tests/contract/`, `tests/e2e/`
- Assets: `assets/branding/`, `assets/default-branding/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and toolchain

- [x] T001 Scaffold Electron + React + TypeScript project (Vite `react-ts` template) at repo root with `electron/`, `src/`, `tests/`, `assets/` directories per plan.md
- [x] T002 Install dependencies in package.json: electron, react, react-dom, react-router-dom, zustand, better-sqlite3, exceljs, pdfmake, mongoose, bcryptjs, jsonwebtoken, recharts, react-i18next, i18next, date-fns, clsx; dev: vite, vite-plugin-electron, tailwindcss, postcss, autoprefixer, electron-builder, typescript, vitest, @playwright/test, @types/better-sqlite3
- [x] T003 [P] Configure Tailwind in tailwind.config.js (primary/success/danger/warning colors, Cairo/Inter fonts) and CSS variables `--color-primary`/`--color-accent` in src/index.css
- [x] T004 [P] Configure vite.config.ts with vite-plugin-electron (main + preload entries) and tsconfig project references for main/preload/renderer
- [x] T005 [P] Configure ESLint + Prettier and npm scripts (dev, build, dist, test, test:e2e) in package.json
- [x] T006 [P] Create electron-builder.yml (win/mac/linux icon paths under assets/branding) and `.env` template (JWT_SECRET, MONGO_URI)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shell, database, IPC bridge, auth primitives, i18n, layout, and shared UI — required before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement SQLite connection with pragmas (WAL, foreign_keys) in electron/db/connection.ts using app userData path
- [x] T008 Create versioned migration framework and initial schema for all tables (users, children, payments, employees, salary_payments, expenses, settings, sync_log) in electron/db/migrations/
- [x] T009 Implement first-launch seed (default admin user, default pricing/target settings, default brand_* keys) in electron/db/seed.ts
- [x] T010 [P] Define shared TypeScript types (Child, Payment, Employee, SalaryPayment, Expense, Setting, User, SyncLog) in src/types/
- [x] T011 Implement electron/main.ts: BrowserWindow (contextIsolation on, nodeIntegration off), RTL support, `asset://` protocol registration, app lifecycle, migrations+seed on startup
- [x] T012 Implement typed contextBridge `window.api` skeleton in electron/preload.ts (all channels from contracts/ipc-contracts.md, stubbed)
- [x] T013 Implement auth primitives in electron/ipc/authIPC.ts: bcrypt hashing, JWT issue/verify, handlers `auth:login`/`auth:logout`/`auth:current` (session persists until logout)
- [x] T014 Implement server-side role guard helper (`requireAdmin`) used by all admin-only IPC handlers in electron/ipc/_guard.ts
- [x] T015 Implement settings IPC `settings:get`/`settings:update` (admin write) in electron/ipc/settingsIPC.ts
- [x] T016 [P] Set up i18n (react-i18next) with src/i18n/ar.json + en.json and live `document.documentElement.dir` switching
- [x] T017 [P] Scaffold Zustand stores directory and useAuthStore in src/store/useAuthStore.ts
- [x] T018 [P] Build UI primitives in src/components/ui/ (Button, Input, Select, Modal, Table, Badge, Card, Stat, Alert, SearchBar, Pagination, LoadingSpinner)
- [x] T019 Build layout components in src/components/layout/ (Sidebar, Header, LanguageSwitcher, RoleGuard)
- [x] T020 Implement Router + protected routes + i18n provider in src/App.tsx
- [x] T021 [P] Implement useBranding hook (CSS variable + title application) in src/hooks/useBranding.ts and AppLogo in src/components/ui/AppLogo.tsx
- [x] T022 [P] Add default branding assets in assets/default-branding/ and copy to assets/branding/ on first run
- [x] T023 [P] Set up IPC contract test harness validating the `window.api` surface against contracts/ipc-contracts.md in tests/contract/api-surface.test.ts

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 10 - Authentication & Roles (Priority: P1) 🎯 MVP

**Goal**: Users log in; admins and employees see only their permitted capabilities; admins manage employee accounts.

**Independent Test**: Log in as admin and as employee; confirm each sees only permitted nav, and admins can create/deactivate employee accounts.

- [x] T024 [P] [US10] Contract test for auth + users channels in tests/contract/auth.test.ts
- [x] T025 [P] [US10] Unit test role enforcement (employee blocked from admin actions) in tests/unit/roles.test.ts
- [x] T026 [US10] Build Login page (username/password, language switcher, error message) in src/pages/Login.tsx
- [x] T027 [US10] Implement auto-login from persisted session via `auth:current` in src/App.tsx
- [x] T028 [US10] Implement user-management IPC (`users:list`/`create`/`update`/`deactivate`, admin-only) in electron/ipc/authIPC.ts
- [x] T029 [US10] Build Users management page (list + create/edit/deactivate employees) in src/pages/Users/UsersList.tsx
- [x] T030 [US10] Enforce role-based nav/visibility (hide salaries, sync, storage, settings-edit, delete for employees) in src/components/layout/RoleGuard.tsx and Sidebar

**Checkpoint**: Login, sessions, and role restrictions fully functional

---

## Phase 4: User Story 1 - Manage Children Records (Priority: P1)

**Goal**: Maintain the children roster with add/edit/deactivate, search, and filter.

**Independent Test**: Add children, search/filter, edit a price, deactivate one; confirm employee is read-only.

- [x] T031 [P] [US1] Contract test for children channels in tests/contract/children.test.ts
- [x] T032 [US1] Implement children IPC (`children:get` with search/filter, `add`/`update`/`deactivate`, admin writes) in electron/ipc/childrenIPC.ts
- [x] T033 [P] [US1] Implement useChildrenStore in src/store/useChildrenStore.ts
- [x] T034 [US1] Build ChildrenList page (sortable/filterable table, search, export button) in src/pages/Children/ChildrenList.tsx
- [x] T035 [US1] Build ChildForm (service→unit/price defaults from settings, editable price) in src/pages/Children/ChildForm.tsx
- [x] T036 [US1] Build Settings container (3 tabs) + PricingSettings tab in src/pages/Settings/Settings.tsx and src/pages/Settings/PricingSettings.tsx
- [x] T037 [US1] Enforce employee read-only on children UI (hide add/edit/delete)

**Checkpoint**: Children registry usable end-to-end

---

## Phase 5: User Story 2 - Track Monthly Payments (Priority: P1)

**Goal**: Generate per-child monthly payment rows; record paid amounts; compute balance/status incl. overpayment credit.

**Independent Test**: Select a month, generate rows, record full/partial/over payments; confirm status and summary totals.

- [x] T038 [P] [US2] Unit test payment calculations (total, balance, status, overpayment→credit) in tests/unit/payments.test.ts
- [x] T039 [P] [US2] Contract test for payments channels (server-side recompute, price ignored from client) in tests/contract/payments.test.ts
- [x] T040 [US2] Implement payments IPC (`payments:get`+summary, `generate` idempotent, `update` recompute, `bulkPay`) in electron/ipc/paymentsIPC.ts
- [x] T041 [P] [US2] Implement usePaymentsStore in src/store/usePaymentsStore.ts
- [x] T042 [US2] Build MonthlyPayments page + PaymentRow (editable quantity/paid only) in src/pages/Payments/MonthlyPayments.tsx and PaymentRow.tsx
- [x] T043 [US2] Add month/year selector and summary bar (invoiced/collected/arrears)
- [x] T044 [US2] Implement bulk "record full payment" for selected children

**Checkpoint**: Monthly collection tracking functional

---

## Phase 6: User Story 3 - Financial Dashboard (Priority: P1)

**Goal**: Per-month KPIs, target calculator, 12-month summary, revenue-by-service, alerts, and charts.

**Independent Test**: Enter payments/expenses for a month; open dashboard; confirm KPIs, summary, and charts reflect data within 2s.

- [x] T045 [P] [US3] Unit test dashboard + target calculations (collection rate, net profit, target required, gap) in tests/unit/dashboard.test.ts
- [x] T046 [US3] Implement `dashboard:get` aggregation IPC (KPIs, 12-month summary, revenue-by-service, alerts) in electron/ipc/dashboardIPC.ts
- [x] T047 [P] [US3] Implement useDashboard hook in src/hooks/useDashboard.ts
- [x] T048 [US3] Build Dashboard page with month selector + KPI cards in src/pages/Dashboard.tsx
- [x] T049 [US3] Add 12-month summary table, revenue-by-service table, target calculator card, and smart alerts
- [x] T050 [P] [US3] Build charts (RevenueChart, CollectionDonut, MonthlyProfitBar) in src/components/charts/

**Checkpoint**: All P1 stories complete — **MVP achievable**

---

## Phase 7: User Story 9 - Excel & PDF Export (Priority: P2)

**Goal**: Full and partial exports in both .xlsx and .pdf with branding header and language choice.

**Independent Test**: Export a month as xlsx and pdf; confirm sheet/layout parity and branding header.

- [x] T051 [P] [US9] Implement export header/branding helper (`getExportHeader`) in electron/services/exportHeader.ts
- [x] T052 [US9] Implement ExcelJS workbook builder (original sheet names+emoji, columns, `#,##0.00`, status colors, RTL views, embedded logo) in electron/services/exportService.ts
- [x] T053 [US9] Implement pdfmake builder with embedded Cairo font (`RTL`) in electron/services/pdfService.ts
- [x] T054 [US9] Implement export IPC (`export:full`/`month`/`child`/`salaries`/`expenses`, format+lang, save dialog, role checks) in electron/ipc/exportIPC.ts
- [x] T055 [P] [US9] Contract test export channels incl. employee-can-export-child-only in tests/contract/export.test.ts
- [x] T056 [US9] Implement useExport hook and wire export buttons across pages in src/hooks/useExport.ts

**Checkpoint**: Export works for all report types in both formats

---

## Phase 8: User Story 4 - Per-Child Account Statement (Priority: P2)

**Goal**: Month-by-month statement from registration date with totals and export.

**Independent Test**: Open a child's statement; confirm months from reg_date to now with accurate totals; export it.

- [x] T057 [P] [US4] Unit test statement builder (reg_date→now span, per-month totals/status) in tests/unit/statement.test.ts
- [x] T058 [US4] Implement statement computation in electron/ipc/childrenIPC.ts (or statementIPC.ts)
- [x] T059 [US4] Build ChildStatement page (child header, 12-row table, overall totals) in src/pages/Children/ChildStatement.tsx
- [x] T060 [US4] Wire statement export (xlsx + pdf) via useExport

**Checkpoint**: Statements viewable and exportable

---

## Phase 9: User Story 5 - Manage Salaries (Priority: P2)

**Goal**: Employee payroll with allowances, net salary, monthly bonuses/deductions, and totals (admin only).

**Independent Test**: Add employees, record a month's payroll; confirm net salaries and monthly total; employee access denied.

- [x] T061 [P] [US5] Contract test salaries channels (admin-only) in tests/contract/salaries.test.ts
- [x] T062 [US5] Implement salaries IPC (`employees:*`, `salary:get`/`update`) in electron/ipc/salariesIPC.ts
- [x] T063 [P] [US5] Implement useSalariesStore in src/store/useSalariesStore.ts
- [x] T064 [US5] Build SalariesList + SalaryForm pages with 12-month columns and monthly totals in src/pages/Salaries/
- [x] T065 [US5] Enforce admin-only access on salaries module

**Checkpoint**: Payroll functional

---

## Phase 10: User Story 6 - Manage Operational Expenses (Priority: P2)

**Goal**: Expense items with monthly amounts, per-item annual totals, and combined expenses+salaries total (admin only).

**Independent Test**: Enter monthly amounts; confirm annual totals and combined grand total; add/remove items.

- [x] T066 [P] [US6] Contract test expenses channels in tests/contract/expenses.test.ts
- [x] T067 [US6] Implement expenses IPC (`expenses:get`/`update`/`addItem`/`removeItem`) in electron/ipc/expensesIPC.ts
- [x] T068 [P] [US6] Implement useExpensesStore in src/store/useExpensesStore.ts
- [x] T069 [US6] Build ExpensesList + ExpenseForm (12-month grid, annual totals, add/remove items) in src/pages/Expenses/
- [x] T070 [US6] Compute and display combined operational expenses + salaries total

**Checkpoint**: Expenses functional

---

## Phase 11: User Story 7 - Target Planning (Priority: P3)

**Goal**: Per-month target/gap/status and a custom-distribution coverage calculator.

**Independent Test**: Set target profit %, enter a distribution; confirm required target, gap, and coverage %.

- [x] T071 [P] [US7] Unit test target coverage + units-needed calculations in tests/unit/target.test.ts
- [x] T072 [US7] Implement target IPC (`target:get`, `target:calc`) in electron/ipc/targetIPC.ts
- [x] T073 [US7] Build TargetPlanning page (12-month table) in src/pages/Target/TargetPlanning.tsx
- [x] T074 [US7] Build smart suggestions + custom distribution calculator with coverage progress bar

**Checkpoint**: Target planning functional

---

## Phase 12: User Story 8 - White-Label Branding (Priority: P3)

**Goal**: Customize app name, org, tagline, logo, icon, colors, and contacts — applied live (admin only).

**Independent Test**: Change name/colors/logo and see live updates and on exports; reset to defaults; employee has no branding tab.

- [x] T075 [P] [US8] Contract test branding channels in tests/contract/branding.test.ts
- [x] T076 [US8] Implement branding IPC (`get`/`save`/`upload-logo`/`upload-icon`/`reset`/`apply-icon`; live title + icon) in electron/ipc/brandingIPC.ts
- [x] T077 [P] [US8] Build ColorPicker + ImageUpload components in src/components/ui/
- [x] T078 [US8] Implement useBrandingStore and BrandingSettings tab in src/pages/Settings/BrandingSettings.tsx
- [x] T079 [US8] Wire live color/title/icon application + restore-defaults; warn that installer icon needs rebuild

**Checkpoint**: Branding fully customizable

---

## Phase 13: User Story 11 - Backup, Restore & Import (Priority: P3)

**Goal**: DB stats, backup/restore, import from original workbook, clear-with-confirmation, audit log (admin only).

**Independent Test**: Back up then restore; confirm record counts match; import workbook populates data.

- [x] T080 [P] [US11] Contract test storage channels in tests/contract/storage.test.ts
- [x] T081 [US11] Implement storage IPC (`stats`, `backup`, `restore`, `import`, `clear`, `audit`) in electron/ipc/storageIPC.ts
- [x] T082 [US11] Implement import service (Excel → DB) in electron/services/importService.ts
- [x] T083 [US11] Build StorageManager page (backup/restore/import/clear/audit) in src/pages/Storage/StorageManager.tsx

**Checkpoint**: Data management functional

---

## Phase 14: User Story 12 - Cloud Synchronization (Priority: P3)

**Goal**: Admin push/pull with MongoDB, status, conflict resolution (most-recent wins), optional auto-sync.

**Independent Test**: Configure connection, push unsynced records; confirm they report as synced; pull newer records.

- [x] T084 [P] [US12] Unit test sync conflict resolver (most-recent `updated_at` wins, id tie-break) in tests/unit/sync.test.ts
- [x] T085 [US12] Define mongoose models/collections in electron/services/mongoSync.ts
- [x] T086 [US12] Implement sync IPC (`push`/`pull`/`status`, graceful offline failure, sync_log writes) in electron/ipc/syncIPC.ts
- [x] T087 [P] [US12] Implement useSyncStore + useSync hook in src/store/useSyncStore.ts and src/hooks/useSync.ts
- [x] T088 [US12] Build SyncManager page (connection status, last sync, pending counts, manual push/pull, conflict strategy, auto-sync toggle) in src/pages/Sync/SyncManager.tsx
- [x] T089 [US12] Build SecuritySettings tab (app password, MongoDB URI, auto-sync interval) in src/pages/Settings/SecuritySettings.tsx
- [x] T090 [US12] Implement auto-sync interval scheduler in main process

**Checkpoint**: All user stories complete

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Quality, performance, and release readiness across all stories

- [ ] T091 [P] Full RTL/LTR pass across all pages (spacing, alignment, charts) and complete ar.json/en.json coverage
- [ ] T092 [P] Standardize loading, empty, and error states across pages using shared UI primitives
- [ ] T093 [P] Add keyboard shortcuts and print stylesheets for statements/reports
- [ ] T094 Performance pass: ensure 100-child month sheet stays responsive (SC-001) and dashboard renders <2s (SC-002)
- [ ] T095 Security hardening review (context isolation, IPC role re-validation, password change flow, JWT secret handling)
- [ ] T096 [P] Playwright e2e smoke flow (login → add child → record payment → export) in tests/e2e/smoke.spec.ts
- [ ] T097 Run quickstart.md validation (all 7 smoke steps)
- [ ] T098 Configure electron-builder packaging and produce .exe/.dmg/AppImage (`npm run dist`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–14)**: All depend on Foundational; then proceed in priority order or in parallel by different developers
- **Polish (Phase 15)**: Depends on the desired user stories being complete

### User Story Dependencies & Notes

- **US10 (Auth, P1)**: First story; builds on auth primitives in Foundational. Other stories assume a logged-in session.
- **US1 (Children, P1)**: Uses settings pricing (Foundational T015 + PricingSettings T036). Independent thereafter.
- **US2 (Payments, P1)**: Consumes children data; testable independently with seeded children.
- **US3 (Dashboard, P1)**: Aggregates payments/expenses/salaries; degrades gracefully with partial data.
- **US9 (Export, P2)**: Reads from whatever data exists; export header from branding settings.
- **US4 (Statement, P2)**: Uses children + payments; export via US9 helpers (or standalone if US9 not yet done).
- **US5/US6 (Salaries/Expenses, P2)**: Independent admin modules; feed US3 totals when present.
- **US7 (Target, P3)**: Uses expenses + settings; standalone calculator otherwise.
- **US8 (Branding, P3)**: Independent; enhances US9 export headers and live theme.
- **US11 (Storage, P3)**: Independent admin utility; import populates other modules' data.
- **US12 (Sync, P3)**: Independent admin utility over existing tables.

### Within Each User Story

- Tests (where included) written first and expected to fail before implementation
- IPC handler (main) before store/hook before page (renderer)
- Core implementation before role/integration polish

### Parallel Opportunities

- All `[P]` Setup tasks (T003–T006) run together
- Foundational `[P]` tasks (T010, T016–T018, T021–T023) run together after T007–T009/T011–T015
- After Foundational, different developers can take whole user-story phases in parallel
- Within a story, `[P]` test + store tasks run alongside each other before the page task

---

## Parallel Example: User Story 2 (Payments)

```bash
# Tests + store in parallel before the page:
Task: "Unit test payment calculations in tests/unit/payments.test.ts"      # T038 [P]
Task: "Contract test payments channels in tests/contract/payments.test.ts" # T039 [P]
Task: "Implement usePaymentsStore in src/store/usePaymentsStore.ts"        # T041 [P]
# Then T040 (IPC) → T042 (page) → T043/T044 sequentially
```

---

## Implementation Strategy

### MVP First (P1 stories)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US10 (Auth) → Phase 4 US1 (Children) → Phase 5 US2 (Payments) → Phase 6 US3 (Dashboard)
3. **STOP and VALIDATE**: a usable financial system — log in, manage children, record payments, view dashboard
4. Demo MVP

### Incremental Delivery

- Add US9 (Export) → US4 (Statement) → US5/US6 (Salaries/Expenses) → US7 (Target) → US8 (Branding) → US11 (Storage) → US12 (Sync)
- Each story is independently testable and adds value without breaking prior stories
- Run Polish (Phase 15) before packaging

---

## Notes

- `[P]` = different files, no incomplete dependencies
- `[Story]` labels map tasks to spec.md user stories for traceability
- Heavy/native modules (better-sqlite3, ExcelJS, pdfmake, mongoose) stay in the main process; renderer uses `window.api` only
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
