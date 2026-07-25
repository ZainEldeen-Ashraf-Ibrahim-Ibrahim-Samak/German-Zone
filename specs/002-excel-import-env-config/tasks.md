---

description: "Task list for Excel Data Import & Environment-Based Configuration"
---

# Tasks: Excel Data Import & Environment-Based Configuration

**Input**: Design documents from `specs/002-excel-import-env-config/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the plan and quickstart explicitly call for an import contract test and an env-config unit test.

**Organization**: Tasks are grouped by user story. Both stories are P1 and independently testable; US1 (import) is the recommended MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = workbook import, US2 = environment config & seeding

## Path Conventions

Single Electron desktop project. Main-process code in `electron/`, renderer in `src/`, tests in `tests/`. Repo root = `C:\Users\ALFA2023\Desktop\Nursery`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and test fixtures needed by the feature.

- [X] T001 Add `dotenv` to `dependencies` in `package.json` and install (`npm install dotenv`).
- [X] T002 [P] Create an import test fixture at `tests/fixtures/nursery-sample.xlsx` — a trimmed copy of `Nursery_V4_Final_5.xlsx` containing the `👶 بيانات الأطفال`, `👔 الرواتب`, `💸 المصروفات`, and at least the `يناير` and `فبراير` sheets (keep ~3 children, 2 employees, 2 expense items) for fast, deterministic tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts both stories/tests rely on. No DB schema change is introduced.

**⚠️ CRITICAL**: Complete before the per-story phases.

- [X] T003 Define and export the `ImportSummary` / `ImportResult` types (per `contracts/import-ipc.md`: per-category `{imported, skipped}`, `sheetsProcessed`, `sheetsIgnored`, `year`, `rowErrors`) at the top of `electron/services/importService.ts` so the handler, renderer, and tests share one shape.
- [X] T004 [P] Add column-index and row constants for the workbook layout (data starts at row 4, first data column = index 3) plus the per-sheet column maps from `data-model.md` as named constants in `electron/services/importService.ts`.

**Checkpoint**: Shared types/constants ready — both user stories can proceed.

---

## Phase 3: User Story 1 - Import all data from the existing workbook (Priority: P1) 🎯 MVP

**Goal**: Reliably import children, payments, employees, salary payments, and expenses from `Nursery_V4_Final_5.xlsx` into SQLite — idempotent, non-destructive, with a summary.

**Independent Test**: Run `storage:import` against `tests/fixtures/nursery-sample.xlsx` on a clean DB; confirm children/payments/employees/salaries/expenses match the fixture and the summary reports counts; re-run and confirm 0 new rows.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T005 [P] [US1] Contract test in `tests/contract/import.test.ts`: import the fixture into an in-memory/temp DB and assert (a) children from the master sheet have guardian/phone/unit/price, (b) one payment per child per monthly sheet with recomputed status, (c) employees + monthly salary payments, (d) expenses per non-zero month, (e) `ImportSummary` counts and `year`.
- [X] T006 [P] [US1] Idempotency + resilience test in `tests/contract/import.test.ts`: second import yields 0 new rows (all `skipped`); a row with a blank name and a malformed numeric cell is skipped (counted in `rowErrors`) without aborting.

### Implementation for User Story 1

- [X] T007 [US1] Add a `resolveCell(cell)` helper in `electron/services/importService.ts` that unwraps ExcelJS formula cells (`{formula,result}` → `result`), joins `richText` runs, and returns the raw value otherwise; route existing `toNum`/`toStr` through it.
- [X] T008 [US1] Rewrite children import in `electron/services/importService.ts` to read the `👶 بيانات الأطفال` master sheet (cols D–M from row 4) into the correct schema columns (`name, guardian, guardian_phone, child_phone, national_id, service, unit, price, reg_date, notes`, `is_active=1`, `created_at/updated_at=now`, `synced=0`); match existing children by exact `name` and skip.
- [X] T009 [US1] Rewrite monthly payments import in `electron/services/importService.ts`: detect month sheets by Arabic month name (no year required), resolve `year` via `IMPORT_DEFAULT_YEAR` → current year, read cols D–M from row 4, unwrap the name-formula cell, create a child placeholder per `data-model.md` if the name is unknown, recompute `status` from paid/total, match payments by `(child_id, month, year, service)` and skip duplicates.
- [X] T010 [US1] Rewrite employees + salary payments import in `electron/services/importService.ts` from `👔 الرواتب` (fix sheet match for `الرواتب`, cols D–K from row 4): upsert employee by name with `base_salary/housing/transport/net_salary` (net fallback = base+housing+transport, `role` required), then one `salary_payments` row per month-net column present, matched by `(employee_id, month, year)`.
- [X] T011 [US1] Rewrite expenses import in `electron/services/importService.ts` from `💸 المصروفات` (item at col D, month amounts cols E–P from row 4): insert one expense per non-zero month via `ON CONFLICT(item,month,year) DO NOTHING`, `year` = resolved import year.
- [X] T012 [US1] Implement the placeholder-fill rules (FR-006a / `data-model.md` table) for required fields missing from the workbook, preferring real values from the master children sheet.
- [X] T013 [US1] Wrap each sheet's writes in a `db.transaction` (atomic per sheet) and populate the full `ImportSummary` (`sheetsProcessed`, `sheetsIgnored`, `year`, `rowErrors`); skip dashboard/settings/statement/target sheets explicitly.
- [X] T014 [US1] Update `electron/ipc/storageIPC.ts` `storage:import` handler to return the enriched `ImportResult` (keep `requireAdmin()` guard and the file-picker fallback).
- [X] T015 [US1] Update `src/pages/Storage/StorageManager.tsx` to render the new summary fields (per-category imported/skipped, resolved `year`, ignored sheets, `rowErrors`), bilingual AR/EN.

**Checkpoint**: Importing the real `Nursery_V4_Final_5.xlsx` loads all data correctly and is safely repeatable — MVP complete.

---

## Phase 4: User Story 2 - Configuration and seed values from the environment (Priority: P1)

**Goal**: Remove hardcoded secrets/seed values; load `.env`, source the JWT secret, admin credentials, Mongo URI, and seed overrides from the environment; hard-fail production when no secret is set; ship a complete `.env.example`.

**Independent Test**: Set values in `.env`, seed a fresh DB, confirm admin/secret/settings reflect env values; in a packaged build with no `JWT_SECRET`, confirm startup halts with a clear error.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T016 [P] [US2] Unit test in `tests/unit/env-config.test.ts`: a secret/setting resolver returns env value when set, documented default otherwise; the production-mode check throws/fails when `JWT_SECRET` is absent and `isPackaged` is true, and warns (not throws) in development.

### Implementation for User Story 2

- [X] T017 [US2] Create `electron/env.ts` that calls `dotenv.config()` at module-evaluation time, exposes `getJwtSecret()` and config getters, and on import performs the production guard: if `app.isPackaged` and no `JWT_SECRET` → log a clear actionable error and `app.quit()` (dev → generated/dev secret + warning).
- [X] T018 [US2] Make `electron/env.js` the **first** import in `electron/main.ts` (above all `./ipc/*` imports) so `process.env` is populated before any handler module evaluates.
- [X] T019 [US2] Refactor `electron/ipc/authIPC.ts` to resolve the secret lazily via `getJwtSecret()` (remove the top-level `const JWT_SECRET = process.env.JWT_SECRET || '...'` hardcoded fallback) at sign/verify call sites.
- [X] T020 [US2] Update `electron/db/seed.ts` to read the initial admin username/password from `SEED_ADMIN_USERNAME`/`SEED_ADMIN_PASSWORD` (first-run only), keeping dev fallback `admin`/`admin123` with a warning and no production hardcoded secret.
- [X] T021 [US2] Update `electron/db/seed.ts` so non-sensitive default settings (pricing, capacity, targets, branding) read optional `SEED_*` env overrides per `contracts/env-vars.md`, falling back to the existing code defaults; apply only when the `settings` row does not already exist (FR-017).
- [X] T022 [US2] Rewrite `.env.example` to enumerate every supported key from `contracts/env-vars.md` with safe placeholders and one-line comments; confirm `.env` is gitignored (add to `.gitignore` if missing) and no real secret is committed.

**Checkpoint**: No secret/credential remains in source; configuration is fully `.env`-driven; production refuses to start without a secret.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validation and consistency across both stories.

- [X] T023 [P] Run `npx tsc -b` and `npm run test`; fix any type or test failures introduced by the import/env changes.
- [X] T024 [P] Execute `quickstart.md` end-to-end against the real `Nursery_V4_Final_5.xlsx` (configure `.env`, run dev, import, verify rosters/payments/salaries/expenses and Sync pending counts).
- [X] T025 Run `npm run build` to regenerate `dist-electron` artifacts and confirm the packaged main process loads `.env` correctly.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks US1 implementation/tests (shared types/constants). US2 does not strictly need T003/T004 but follows Setup (needs `dotenv` from T001).
- **User Stories (Phase 3 = US1, Phase 4 = US2)**: Independent of each other; either can be delivered alone. Both depend on Setup.
- **Polish (Phase 5)**: After the desired stories are complete.

### Within Each User Story

- Tests written first and failing before implementation.
- US1: T007 (cell helper) before T008–T011; T012 placeholders before/with T008–T011; T013 summary before T014; T014 handler before T015 UI.
- US2: T017 env module before T018 wiring and T019 auth refactor; seed changes T020/T021 independent of auth; T022 docs last.

### Parallel Opportunities

- T002 ∥ T001 setup.
- T004 ∥ T003 (same file but distinct regions — coordinate or do sequentially).
- US1 tests T005 ∥ T006; US2 test T016 ∥ everything in US1.
- Entire US1 (Phase 3) ∥ entire US2 (Phase 4) with two developers after Setup.
- Polish T023 ∥ T024.

---

## Parallel Example

```bash
# After Setup, two developers split the stories:
Developer A → US1: T005, T006 (tests) → T007–T015 (electron/services/importService.ts, storageIPC.ts, StorageManager.tsx)
Developer B → US2: T016 (test) → T017–T022 (electron/env.ts, main.ts, authIPC.ts, seed.ts, .env.example)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & validate** importing the real workbook → demo. This alone delivers the headline value (data migration).

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 (import) → test → demo (MVP).
3. US2 (env/config) → test → demo (security hardening + configurability).
4. Polish → full quickstart validation + packaged build.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- No new DB tables or migrations; the importer must conform to the existing schema (see `data-model.md`).
- The current `importService.ts` is rewritten, not patched (see `research.md` R2).
- Commit after each task or logical group; never commit a real `.env`.
