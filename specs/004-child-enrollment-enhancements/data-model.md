# Phase 1 Data Model: Child Enrollment Enhancements

Brownfield delta to the feature-001/003 SQLite schema (`electron/db/migrations/index.ts`). All additions are **additive columns** on the existing `children` table (migration `011`). Identity/sync conventions are unchanged: integer `id` is the Mongo identity, `updated_at` (ISO string) drives last-write-wins, `synced` (0 pending / 1 reconciled).

## Changed entity: Child (`children`)

New columns added by migration `011_child_photo_teacher_lessons`:

| Field | Type | Rules / Default |
|-------|------|-----------------|
| `photo_url` | TEXT | nullable — Cloudinary `secure_url`; null = no photo (show placeholder) |
| `photo_public_id` | TEXT | nullable — Cloudinary `public_id` (for future overwrite/cleanup) |
| `teacher_id` | INTEGER | nullable — FK → `employees.id`; the assigned teacher |
| `lesson_days` | TEXT | nullable — JSON array of weekday integers (JS `getDay`: 0=Sun … 6=Sat), e.g. `[1,3]` |
| `sessions_baseline` | INTEGER | default `8` — fixed monthly baseline (2 days/week), independent of month length |
| `extra_lessons` | INTEGER | default `0` — manually added sessions beyond the baseline (≥ 0) |
| `session_price` | REAL | nullable — price per session used for the fee calculation |
| `monthly_fee` | REAL | nullable — computed snapshot = `(sessions_baseline + extra_lessons) * session_price` |

Unchanged existing columns (for context): `id, name, guardian, guardian_phone, child_phone, national_id, service, unit, price, reg_date, notes, is_active, created_at, updated_at, synced`.

**Derived value (not stored independently of inputs)**: `total_sessions = sessions_baseline + extra_lessons`. `monthly_fee` is recomputed server-side on every `children:add` / `children:update` from the three stored inputs and persisted as a snapshot.

**Validation rules** (enforced in renderer and re-validated in IPC):

- `guardian_phone` MUST match `^01[0-9]{9}$` (exactly 11 digits, starts `01`). (FR-001)
- `extra_lessons` MUST be an integer ≥ 0. (FR-010)
- `session_price` MUST be ≥ 0 when present. (FR-011)
- `teacher_id`, `lesson_days`, photo fields are all OPTIONAL — a child saves without them. (FR-004a)
- `lesson_days` entries are unique integers in `0..6`.

**Foreign key note**: `teacher_id` references `employees.id`. A deactivated/removed teacher does not blank a child's historical `teacher_id` (FR-013 / edge case "Teacher removed/deactivated"); the UI shows the stored teacher name where resolvable.

## Read view: Teacher (no new table)

"Teacher" is a projection over the existing `employees` table, exposed via the new auth-level `teachers:list` channel — it is **not** a new table.

| Field | Source | Notes |
|-------|--------|-------|
| `id` | `employees.id` | identity |
| `name` | `employees.name` | display label in the picker |
| `role` | `employees.role` | used to optionally filter to teacher roles (`teacher`/`مدرس`/`معلم`) |

Only active employees (`is_active = 1`) are returned. Salary fields are intentionally excluded (least privilege — see research R5).

## Service Distribution Calculator inputs (no persistence)

The Target Planning calculator is computed-on-read; this feature adds one user-facing input. No new table or column.

| Input | Source today | Change |
|-------|--------------|--------|
| per-service `distribution` counts | form state | unchanged |
| reference `month`, `year` | form / page selector | unchanged |
| per-service `pricing` | `settings` keys | unchanged |
| **`targetProfitPct`** | `settings.target_profit_pct` only (no field) | **NEW editable field**, defaults to the saved setting, passed to `target:calc` |

## Settings / environment additions

- Environment (`.env`, read in main via `env.ts`): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (or a single `CLOUDINARY_URL`). Not stored in SQLite; never sent to the renderer. (research R2)
- No new `settings` rows are required; `target_profit_pct` already exists and remains the default source for the calculator input.

## Sync impact (`mongoSync.ts`)

`childSchema` (collection `sync_children`) gains the eight new fields above so admin sync round-trips them. Additive only; last-write-wins on `updated_at` unchanged. No other entity schemas change.
