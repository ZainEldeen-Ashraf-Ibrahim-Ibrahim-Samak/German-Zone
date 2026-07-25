---
description: "Task list for Child Enrollment Enhancements"
---

# Tasks: Child Enrollment Enhancements

**Input**: Design documents from `/specs/004-child-enrollment-enhancements/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-contracts.md

**Tests**: Included — the plan's Testing section requests Vitest unit tests (phone regex, fee calculation, Cloudinary signature, calculator formula parity) and Playwright e2e (enrollment+photo, employee-adds-child, calculator input).

**Organization**: Tasks grouped by user story, in spec priority order. P1: US1 (teacher/lessons/fee) and US3 (employee adds children). P2: US2 (photo) and US4 (phone). P3: US5 (index) and US6 (calculator input). Each story is an independently testable increment of the existing app.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = Teacher/Lessons/Fee, US2 = Child Photo, US3 = Employee Adds Children, US4 = Guardian Phone, US5 = Child Index, US6 = Calculator Input
- Brownfield extension: paths are real files in `electron/` (main process) and `src/` (renderer).

## Path Conventions

- Main process: `electron/` (DB, IPC, services). Renderer: `src/`. Tests: `tests/unit/`, `tests/e2e/`.
- DB driver is `node:sqlite` via the `Db` wrapper in `electron/db/connection.ts` (not better-sqlite3).
- Renderer reaches main only through the typed `window.api` bridge in `electron/preload.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm tooling and document the new configuration before code changes.

- [X] T001 Confirm Vitest + Playwright run clean on the current branch (`npm run test`, `npx playwright test`) so new tests have a known-good baseline
- [X] T002 [P] Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (and `CLOUDINARY_URL` comment) placeholders to `.env.example` with a note that absence disables photo upload gracefully

**Checkpoint**: Test tooling green; config documented.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared types, and sync mapping that the persistence-touching stories (US1, US2) build on. MUST complete before US1/US2.

- [X] T003 Add migration `011_child_photo_teacher_lessons` to `electron/db/migrations/index.ts`: guarded `ALTER TABLE children ADD COLUMN` for `photo_url TEXT`, `photo_public_id TEXT`, `teacher_id INTEGER`, `lesson_days TEXT`, `sessions_baseline INTEGER DEFAULT 8`, `extra_lessons INTEGER DEFAULT 0`, `session_price REAL`, `monthly_fee REAL` (try/catch per column, matching the 003/007/008 pattern)
- [X] T004 [P] Extend the `Child` type and add the `Teacher` type in `src/types/index.ts` (new optional fields: `photo_url`, `photo_public_id`, `teacher_id`, `lesson_days`, `sessions_baseline`, `extra_lessons`, `session_price`, `monthly_fee`; `Teacher = { id; name; role }`)
- [X] T005 [P] Extend `childSchema` in `electron/services/mongoSync.ts` with the eight new child columns so admin sync round-trips them (additive; last-write-wins unchanged)

**Checkpoint**: New columns exist locally and in the sync schema; renderer types compile.

---

## Phase 3: User Story 1 — Teacher + lessons + monthly fee (Priority: P1) 🎯 MVP

**Goal**: Assign a teacher (from Employees) and lesson weekdays, default 8 sessions, allow extra lessons, compute and persist the monthly fee.

**Independent Test**: Add a child, assign a teacher and two lesson days, confirm 8 sessions and fee = 8 × session price; add 2 extra lessons → count 10 and fee = 10 × price; open the record and see teacher + lesson days.

- [X] T006 [P] [US1] Create `electron/ipc/teachersIPC.ts` with `teachers:list` (auth-level via `checkAuth` pattern; returns `{ id, name, role }` for active employees only, optional `role` filter; salary fields excluded)
- [X] T007 [US1] Register the new handler by importing `./ipc/teachersIPC.js` in `electron/main.ts` (alongside the other IPC imports)
- [X] T008 [US1] Add `teachers.list` to the `window.api` bridge in `electron/preload.ts`
- [X] T009 [US1] In `electron/ipc/childrenIPC.ts`, extend `children:add` and `children:update` to accept and persist the new optional columns (`teacher_id`, `lesson_days` as JSON string, `sessions_baseline` default 8, `extra_lessons` default 0, `session_price`) and compute `monthly_fee = (sessions_baseline + extra_lessons) * session_price`; add `teacher_id`/`lesson_days`/etc. to the `allowedKeys` update list
- [X] T010 [US1] In `src/pages/Children/ChildForm.tsx`, add a teacher `<Select>` (load options from `window.api.teachers.list`), a lesson-days multi-select (weekday checkboxes → `number[]`), an `extra_lessons` number input, a `session_price` input, and a read-only computed "sessions" + "monthly fee" display; include the new fields in the submit payload and edit-mode load
- [X] T011 [P] [US1] In `src/pages/Children/ChildStatement.tsx`, show the assigned teacher name and lesson days when present (read-only)
- [X] T012 [P] [US1] Add i18n strings (ar/en) for teacher, lesson days, sessions, extra lessons, session price, monthly fee in the renderer locale resources
- [X] T013 [P] [US1] Unit test in `tests/unit/childFee.test.ts`: `monthly_fee` = `(8 + extra) * session_price`; default baseline 8; extra=0 default; non-negative `extra_lessons`
- [X] T014 [US1] Playwright e2e in `tests/e2e/enroll-teacher-fee.spec.ts`: add child with teacher + 2 lesson days → 8 sessions/fee; add 2 extra → 10 sessions/fee; verify record shows teacher

**Checkpoint**: US1 fully usable and independently testable.

---

## Phase 4: User Story 3 — Employees can add children (Priority: P1)

**Goal**: An employee (not only admin) can create child records.

**Independent Test**: Sign in as employee → "Add Child" is available → submit a valid child → saved.

- [X] T015 [US3] In `electron/ipc/childrenIPC.ts`, change `children:add` from `requireAdmin()` to the authenticated check (`checkAuth()`); leave `children:update`/`children:deactivate` as `requireAdmin()`
- [X] T016 [US3] In the renderer, expose the "Add Child" action/route to the employee role (verify gating in `src/pages/Children/ChildrenList.tsx` and the router/nav guard; remove any admin-only restriction on the add path)
- [X] T017 [P] [US3] Unit/contract test in `tests/unit/childrenAccess.test.ts`: `children:add` succeeds for an employee session and `children:update` still rejects a non-admin
- [X] T018 [US3] Playwright e2e in `tests/e2e/employee-add-child.spec.ts`: employee logs in, adds a valid child, sees it in the list

**Checkpoint**: US3 independently testable; combined with US1 forms the P1 MVP.

---

## Phase 5: User Story 2 — Child photo via camera / upload (Priority: P2)

**Goal**: Capture from camera, select device, or upload a file; store on Cloudinary; show on record/list; optional & offline-safe.

**Independent Test**: Add a child, capture or upload a photo → shows on record/list; offline → child still saves without photo; no-photo child shows placeholder.

- [X] T019 [P] [US2] Add `getCloudinaryConfig()` to `electron/env.ts` (read `CLOUDINARY_*` / parse `CLOUDINARY_URL`; never expose to renderer)
- [X] T020 [US2] Create `electron/services/cloudinaryService.ts`: signed upload helper using global `fetch` + `node:crypto` (HMAC-SHA1 signature over sorted params + secret) → returns `{ url, publicId }`; throws descriptive error when unconfigured/unreachable
- [X] T021 [US2] Add `storage:uploadPhoto` handler to `electron/ipc/storageIPC.ts` (auth-level; args `{ dataUrl, folder? }` ⇒ `{ url, publicId }`) delegating to `cloudinaryService`
- [X] T022 [US2] Add `storage.uploadPhoto` to the `window.api` bridge in `electron/preload.ts`
- [X] T023 [P] [US2] Create `src/components/PhotoCapture.tsx`: `enumerateDevices` → `videoinput` dropdown, `getUserMedia` → `<video>` → `<canvas>` capture → JPEG data URL; plus `<input type="file" accept="image/*">` upload path; emits a data URL
- [X] T024 [US2] Integrate `PhotoCapture` into `src/pages/Children/ChildForm.tsx`: on save, attempt `storage.uploadPhoto` first; on success pass `photo_url`/`photo_public_id` to add/update; on failure show a non-blocking message and save without a photo (offline fallback, FR-004a)
- [X] T025 [P] [US2] Show the photo thumbnail (or neutral placeholder when absent) in `src/pages/Children/ChildrenList.tsx` and `src/pages/Children/ChildStatement.tsx`
- [X] T026 [P] [US2] Add i18n strings (ar/en) for camera/use-device/upload/placeholder/offline-photo messages
- [X] T027 [P] [US2] Unit test in `tests/unit/cloudinarySignature.test.ts`: signature is the SHA1 of sorted params + secret for a fixed fixture (no network)
- [X] T028 [US2] Playwright e2e in `tests/e2e/child-photo.spec.ts`: upload a file image → appears on record; simulate upload failure → child still saved without photo

**Checkpoint**: US2 independently testable; photo optional and offline-safe.

---

## Phase 6: User Story 4 — Guardian phone validation (Priority: P2)

**Goal**: Guardian phone must be exactly 11 digits, digits only, starting `01`.

**Independent Test**: Field stops at 11 digits and rejects non-digits; `0123` rejected on save; `01012345678` accepted.

- [X] T029 [US4] In `src/pages/Children/ChildForm.tsx`, enforce `maxLength={11}`, digit-only input filtering, and replace the guardian-phone validation with `^01[0-9]{9}$` (keep child-phone validation unchanged)
- [X] T030 [US4] In `electron/ipc/childrenIPC.ts`, re-validate `guardian_phone` against `^01[0-9]{9}$` in both `children:add` and `children:update` (reject with a bilingual message)
- [X] T031 [P] [US4] Unit test in `tests/unit/guardianPhone.test.ts`: accepts `01012345678`; rejects too-short, too-long, non-digit, and non-`01` prefixes

**Checkpoint**: US4 independently testable.

---

## Phase 7: User Story 5 — Sequential index per child (Priority: P3)

**Goal**: Show a 1-based index column for every child in the list.

**Independent Test**: Every visible row shows a consecutive number from 1; stays consecutive after filter/search.

- [X] T032 [US5] In `src/pages/Children/ChildrenList.tsx`, render a 1-based index column derived from the displayed (filtered) row position

**Checkpoint**: US5 independently testable.

---

## Phase 8: User Story 6 — Calculator missing input (Priority: P3)

**Goal**: Surface the Target Profit % input on the Service Distribution Calculator; outputs unchanged.

**Independent Test**: New Target Profit % field defaults to the saved setting; leaving it unchanged reproduces the exact prior outputs; changing it recomputes via the same formula.

- [X] T033 [US6] In `electron/ipc/targetIPC.ts`, make `target:calc` accept optional `targetProfitPct` and use it in place of the `settings.target_profit_pct` lookup when provided; leave `calcRequiredRevenue`/`projectedRevenue`/`coveragePct`/`unitsNeeded` formulas unchanged
- [X] T034 [US6] In `src/pages/Target/TargetPlanning.tsx`, add a "Target Profit %" input to the Service Distribution Calculator card (default from the saved setting) and pass it to `window.api.target.calc`
- [X] T035 [P] [US6] Unit test in `tests/unit/targetCalcParity.test.ts`: `target:calc` with `targetProfitPct` equal to `settings.target_profit_pct` returns output identical to the settings-only path (FR-015 regression guard)

**Checkpoint**: US6 independently testable.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T036 [P] Run `npm run lint` and the TypeScript build; fix any type/lint issues introduced by the new fields and handlers
- [X] T037 [P] Walk through `specs/004-child-enrollment-enhancements/quickstart.md` manual validation for all six stories
- [X] T038 Verify admin sync round-trips the new child columns (push/pull a child with photo/teacher/lesson/fee and confirm fields persist on the mirror)

---

## Dependencies & Story Completion Order

- **Setup (Phase 1)** → no dependencies.
- **Foundational (Phase 2: T003–T005)** → blocks US1 and US2 (they persist the new columns). US3, US4, US5, US6 do not require the new columns but US4's server validation and US3's access change edit the same `childrenIPC.ts` that US1 also edits — sequence US1 before US3/US4 to avoid edit conflicts, or coordinate the shared file.
- **US1 (P1)** and **US3 (P1)** → the MVP. US1 depends on Foundational; US3 depends only on the existing `childrenIPC.ts`.
- **US2 (P2)** → depends on Foundational (photo columns) + its own Cloudinary plumbing.
- **US4 (P2)** → independent except it edits `childrenIPC.ts`/`ChildForm.tsx` shared with US1.
- **US5 (P3)** and **US6 (P3)** → fully independent (different files), can be done any time.
- **Polish (Phase 9)** → after the stories it validates.

## Parallel Execution Examples

- **Foundational**: T004 and T005 run in parallel (different files); T003 is the migration and can land alongside them.
- **US1**: T006, T011, T012, T013 are `[P]` (separate files) once T009/T010 contracts are settled.
- **US2**: T019, T023, T026, T027 are `[P]` (env, component, locales, unit test) before wiring T024/T025.
- **Cross-story**: US5 (T032) and US6 (T033–T035) can proceed in parallel with the P1/P2 work since they touch unrelated files (`ChildrenList.tsx`, `targetIPC.ts`, `TargetPlanning.tsx`).

## Implementation Strategy

- **MVP**: Complete Phase 1–2, then **US1** (teacher/lessons/fee) — the highest-value billing capability — and **US3** (employee can add). This delivers a demoable enrollment improvement.
- **Increment 2 (P2)**: US2 (photo) and US4 (phone) harden the enrollment form.
- **Increment 3 (P3)**: US5 (index) and US6 (calculator input) — small, independent polish items.
- Land server-side validation (US4 T030) and access change (US3 T015) together with US1's `childrenIPC.ts` edit if working the file serially, to minimize merge churn.
