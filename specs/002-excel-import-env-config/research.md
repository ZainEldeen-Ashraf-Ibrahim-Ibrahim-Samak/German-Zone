# Phase 0 Research: Excel Import & Env Configuration

All Technical Context unknowns were resolved by inspecting the real `Nursery_V4_Final_5.xlsx`, the current DB schema (`electron/db/migrations/index.ts`), and the existing source. No outstanding NEEDS CLARIFICATION.

## R1. Actual workbook structure (ground truth)

The workbook has 19 sheets. Two leading spreadsheet columns (A, B) are blank — **data begins at column C (index 3)**, the header row is **row 3**, and data rows start at **row 4**.

| Sheet | Role | Use |
|-------|------|-----|
| `📊 داشبورد` | Dashboard | Ignore |
| `⚙️ الإعدادات` | Pricing/targets | Ignore for v1 (settings come from code/env per clarification); structure noted below |
| `👶 بيانات الأطفال` | **Children master** | Source of children (full fields) |
| `👔 الرواتب` | **Salaries** | Source of employees + salary payments |
| `💸 المصروفات` | **Expenses** | Source of expenses (item × 12 months) |
| `📄 كشف حساب` | Statement | Ignore |
| `🎯 تخطيط التارجت` | Target planning | Ignore |
| `يناير` … `ديسمبر` | **Monthly revenue** (12) | Source of payments per child per month |

### Children master `👶 بيانات الأطفال` (header row 3, cols C–M)
`# | اسم الطفل (name) | اسم ولي الأمر (guardian) | رقم هاتف ولي الأمر (guardian_phone) | رقم هاتف الطفل (child_phone) | الرقم القومي (national_id) | الخدمة (service) | الوحدة (unit) | السعر (price) | تاريخ التسجيل (reg_date) | ملاحظات (notes)`

### Monthly sheets `يناير`…`ديسمبر` (header row 3, cols C–M)
`# | اسم الطفل (name) | الخدمة (service) | الوحدة (unit) | الكمية (quantity) | السعر (price) | الإجمالي (total) | المدفوع (paid) | الرصيد (balance) | الحالة (status) | ملاحظات (notes)`
- **No year in the sheet name** (just `يناير`, not `يناير 2025`).
- The `name` cell is a **formula** (`'👶 بيانات الأطفال'!C4`); must read its `.result`.
- `total`, `balance`, `status` are formula cells too.

### Salaries `👔 الرواتب` (header row 3, cols C–…)
`# | الاسم (name) | الوظيفة (role) | الراتب الأساسي (base_salary) | بدل سكن (housing) | بدل مواصلات (transport) | حوافز (bonus) | خصومات (deductions) | صافي الراتب (net_salary) | <blank> | يناير…ديسمبر (per-month net) | إجمالي`
- `net_salary` and all monthly columns are formula cells.

### Expenses `💸 المصروفات` (header row 3)
`# | بند المصروف (item) | يناير | فبراير | … | ديسمبر | إجمالي` — item at column D (index 4), month amounts start at column E (index 5). Year-total column is a formula.

### Settings `⚙️ الإعدادات`
Pricing grid: `service | hourly | daily | monthly` (e.g., حضانة → 50 / 200 / 3500). **Out of scope for v1** import (defaults come from code/env per the clarification); documented here for a possible future enhancement.

## R2. Why the current importer fails (must rewrite, not patch)

**Decision**: Rewrite `importFromWorkbook`. **Rationale**: every assumption it makes is wrong against the real file and the current schema:

1. Reads children only from monthly sheets — **ignores the `👶 بيانات الأطفال` master sheet** that actually carries guardian, phone, national_id, unit, reg_date.
2. Requires a 4-digit year in the monthly sheet name → all 12 monthly sheets are skipped → **zero payments imported**.
3. Reads cells `1,2,3` (cols A,B,C) but data lives in cols **C+ (3+)** with two blank lead columns → wrong/empty values.
4. Skips only `rowNum < 2`, but the real header is **row 3** (title in row 1, blank row 2).
5. Does not unwrap **formula cells** — `String(cellValue)` on `{formula,result}` yields `[object Object]`.
6. Salary-sheet matcher `name.includes('راتب')` does **not** match `الرواتب` (contains `رواتب`, not the substring `راتب`).
7. INSERT column names don't match the schema: `monthly_fee/join_date` (schema: `price/reg_date`), `housing_allowance/transport_allowance` (schema: `housing/transport`), `deduction/pay_date` (schema: `deductions/paid_date`); also omits NOT-NULL columns (`guardian`, `guardian_phone`, `unit`, `updated_at`, `net_salary`, `actual_paid`).

**Alternatives considered**: incremental patching — rejected; the number of independent defects equals a rewrite, and a fixture-driven rewrite is testable.

## R3. Cell reading strategy (ExcelJS)

**Decision**: Add helpers that resolve a cell to its effective value: if `cell.value` is an object with a `result` field (formula) use `result`; if it has `richText` join the runs; else use the raw value. Then coerce via existing `toNum`/`toStr`. Read by explicit column index (C=3 …) and start at row 4.

**Rationale**: The workbook is formula-heavy; only `.result` carries the computed number/string. Reading by fixed indices is robust because the layout is stable and authored by the center.

## R4. Missing year on monthly sheets

**Decision**: Assign payments an import year resolved in this order: optional `IMPORT_DEFAULT_YEAR` env value → else the current calendar year. Record the chosen year in the import summary.

**Rationale**: The workbook is a single-year planning template with no year label. The clarification requires importing all valid rows; a deterministic default year keeps the (child, month, year, service) uniqueness meaningful and is overridable without code edits. **Alternative**: prompt the user per import — rejected as extra UX for v1; can be added later.

## R5. Required-field placeholders (FR-006a)

**Decision**: When a child comes only from a monthly sheet (not the master) or the master row omits a required field, fill: `guardian = '—'`, `guardian_phone = '—'`, `unit` = sheet's unit or `'شهر'`, `service` = sheet's service or `'حضانة'`, `price` = row price or 0, `reg_date` = first-of-month derived from the sheet (or import date), `created_at/updated_at` = now, `synced = 0`. Prefer the master sheet's real values whenever the child exists there.

**Rationale**: Honors the clarified "auto-fill so the record imports and is editable later" without weakening the schema for hand-entered children.

## R6. Idempotency & non-destructiveness (FR-004, FR-005)

**Decision**: Match children by exact name; payments by `(child_id, month, year, service)`; employees by name; salary payments by `(employee_id, month, year)`; expenses by `(item, month, year)` UNIQUE. Use `INSERT … ON CONFLICT DO NOTHING` / pre-SELECT existence checks; never UPDATE an existing row. Wrap each sheet's writes in a `db.transaction` so a mid-sheet failure rolls that sheet back (atomic per logical unit).

**Rationale**: Matches the spec's skip-existing, additive, atomic-per-batch requirements and the documented same-name limitation.

## R7. Loading `.env` in Electron (ordering is the trap)

**Decision**: Add `dotenv` and a dedicated `electron/env.ts` that calls `dotenv.config()` and performs secret validation **at module-evaluation time**, then make it the **first** import in `main.ts` (before `authIPC` et al.). Additionally refactor `authIPC` to resolve the secret lazily via `getJwtSecret()` rather than a top-level `const`.

**Rationale**: Electron does not auto-load `.env`. ES module imports are hoisted and executed in source order depth-first, so `authIPC`'s current top-level `const JWT_SECRET = process.env.JWT_SECRET || '...'` runs *before* any `dotenv.config()` placed as a statement in `main.ts`. Importing `./env.js` first guarantees `process.env` is populated before other modules evaluate; the lazy getter is defense-in-depth. **Alternative**: electron-builder `extraResources` + manual parse — rejected, `dotenv` is standard and already implied by `.env.example`.

## R8. Production secret hard-fail (FR-012, clarified)

**Decision**: In `electron/env.ts`, after loading: if `app.isPackaged` (production) **and** no `JWT_SECRET` is set, log a clear error and quit (or show an error dialog) before windows open. In development, fall back to a generated/dev secret with a console warning.

**Rationale**: Clarification chose hard-fail in production; dev convenience preserved. `app.isPackaged` is the reliable production signal for Electron.

## R9. Configuration surface

**Decision**: Environment keys (see `contracts/env-vars.md`): required — `JWT_SECRET`; optional — `MONGO_URI`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `IMPORT_DEFAULT_YEAR`, and optional overrides for non-sensitive seed settings (e.g. `SEED_NURSERY_MONTHLY`, `SEED_MAX_CAPACITY`, `SEED_TARGET_PROFIT_PCT`, branding keys). Seed reads env only when seeding a fresh/empty table (FR-017).

**Rationale**: Satisfies clarification (sensitive required, non-sensitive overridable) and FR-016 (`.env.example` lists all keys, no real secrets committed).
