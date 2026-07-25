# Phase 1 Data Model: Excel Import & Env Configuration

This feature introduces **no new tables**. It maps workbook sheets onto the existing schema (`electron/db/migrations/index.ts`) and adds a configuration surface. Below: the target columns per entity, the workbook→column mapping, match keys, and placeholder rules.

## Existing tables targeted (authoritative columns)

- **children**: `id, name, guardian, guardian_phone, child_phone, national_id, service, unit, price, reg_date, notes, is_active, created_at, updated_at, synced`
  (NOT NULL: name, guardian, guardian_phone, service, unit, price, reg_date, created_at, updated_at)
- **payments**: `id, child_id, month, year, service, unit, quantity, price, total, paid, balance, status, notes, created_at, updated_at, synced` — UNIQUE(child_id, month, year)
- **employees**: `id, name, role, base_salary, housing, transport, net_salary, is_active, created_at, synced` (NOT NULL: name, role, base_salary, net_salary, created_at)
- **salary_payments**: `id, employee_id, month, year, bonus, deductions, actual_paid, paid_date, notes, synced` — UNIQUE(employee_id, month, year)
- **expenses**: `id, item, month, year, amount, category, notes, created_at, synced` — UNIQUE(item, month, year)
- **settings**: `key, value` (key PK)
- **users**: `id, username, password, role, name, is_active, created_at`

## Mapping: workbook → schema

All sheets: data starts at **row 4**, columns are 1-based with **2 blank lead columns** (first data column = index 3 / "C"). Read formula cells via their `.result`.

### children ← `👶 بيانات الأطفال`
| Col (idx) | Workbook header | → column |
|-----------|-----------------|----------|
| 4 (D) | اسم الطفل | name |
| 5 (E) | اسم ولي الأمر | guardian |
| 6 (F) | رقم هاتف ولي الأمر | guardian_phone |
| 7 (G) | رقم هاتف الطفل | child_phone |
| 8 (H) | الرقم القومي | national_id |
| 9 (I) | الخدمة | service |
| 10 (J) | الوحدة | unit |
| 11 (K) | السعر | price |
| 12 (L) | تاريخ التسجيل | reg_date |
| 13 (M) | ملاحظات | notes |

Defaults: `is_active=1`, `created_at=updated_at=now`, `synced=0`.

### payments ← monthly sheets `يناير`…`ديسمبر`
| Col (idx) | Header | → column |
|-----------|--------|----------|
| 4 (D) | اسم الطفل (formula→result) | (match child) |
| 5 (E) | الخدمة | service |
| 6 (F) | الوحدة | unit |
| 7 (G) | الكمية | quantity |
| 8 (H) | السعر | price |
| 9 (I) | الإجمالي (formula) | total |
| 10 (J) | المدفوع | paid |
| 11 (K) | الرصيد (formula) | balance |
| 13 (M) | ملاحظات | notes |

- `month` = the sheet's Arabic month name; `year` = resolved import year (R4).
- `status` recomputed: `paid>=total → 'paid'`, `paid>0 → 'partial'`, else `'unpaid'` (don't trust the emoji formula cell).
- `balance` recomputed as `total - paid` if the cell is empty.

### employees ← `👔 الرواتب`
| Col (idx) | Header | → column |
|-----------|--------|----------|
| 4 (D) | الاسم | name |
| 5 (E) | الوظيفة | role |
| 6 (F) | الراتب الأساسي | base_salary |
| 7 (G) | بدل سكن | housing |
| 8 (H) | بدل مواصلات | transport |
| 11 (K) | صافي الراتب (formula) | net_salary |

`net_salary` fallback = `base_salary + housing + transport`. Defaults `is_active=1, created_at=now, synced=0`.

### salary_payments ← `👔 الرواتب`
| Col (idx) | Header | → column |
|-----------|--------|----------|
| 9 (I) | حوافز | bonus |
| 10 (J) | خصومات | deductions |
| (per-month net columns) | يناير…ديسمبر | actual_paid (per month) |

- One salary_payment per employee per month present (month = column header; year = resolved import year). `actual_paid` = month column `.result` (fallback net_salary). `paid_date` = NULL or first-of-month. `synced=0`.

### expenses ← `💸 المصروفات`
| Col (idx) | Header | → column |
|-----------|--------|----------|
| 4 (D) | بند المصروف | item |
| 5–16 (E–P) | يناير…ديسمبر | amount (one row per non-zero month) |

`year` = resolved import year; `category=NULL`, `notes=NULL`, `created_at=now`, `synced=0`. Skip zero/blank months.

## Placeholder rules (FR-006a)

When a required field is missing for an imported record:
| Field | Placeholder |
|-------|-------------|
| guardian | `—` |
| guardian_phone | `—` |
| service | sheet value or `حضانة` |
| unit | sheet value or `شهر` |
| price | row value or `0` |
| reg_date | first-of-month from source sheet, else import date |
| created_at / updated_at | now (ISO) |
| net_salary | base+housing+transport |
| actual_paid | month net, else base_salary |

Prefer real values from `👶 بيانات الأطفال` whenever the child exists there.

## Match keys (idempotency / non-destructive)

| Entity | Match key | On match |
|--------|-----------|----------|
| children | exact `name` | skip (reuse id) |
| payments | (child_id, month, year, service) | skip |
| employees | exact `name` | skip (reuse id) |
| salary_payments | (employee_id, month, year) | skip |
| expenses | (item, month, year) | skip (ON CONFLICT DO NOTHING) |

Existing rows are never overwritten (FR-005). Each sheet's writes run in one transaction (R6).

## Configuration / Seed entities

### Sensitive (required via `.env`, never in source)
| Key | Used by | Notes |
|-----|---------|-------|
| `JWT_SECRET` | session signing | **Required**; production hard-fail if absent |
| `MONGO_URI` | cloud sync | optional; falls back to settings table |
| `SEED_ADMIN_USERNAME` | first-run admin seed | optional, default `admin` (dev only) |
| `SEED_ADMIN_PASSWORD` | first-run admin seed | optional; if unset in production, force change / warn |

### Non-sensitive seed overrides (optional `.env`, else code default; first-run only — FR-017)
`SEED_NURSERY_MONTHLY/DAILY/HOURLY`, `SEED_HOSTING_*`, `SEED_SESSION_*`, `SEED_TARGET_PROFIT_PCT`, `SEED_MAX_CAPACITY`, `SEED_WORK_DAYS`, `SEED_WORK_HOURS`, `SEED_BRAND_*` → map to the existing `settings` keys in `seed.ts`.

State rule: env seed values apply **only when the target table/row is empty** at first run; they never modify an already-populated database.
