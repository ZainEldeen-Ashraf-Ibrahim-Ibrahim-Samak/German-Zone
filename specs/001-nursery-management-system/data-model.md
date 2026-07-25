# Phase 1 Data Model: Nursery & Autism Center Management System

System of record: local **SQLite** (`better-sqlite3`). Mirror: MongoDB Atlas (admin sync). All money fields are EGP (clarification Q2). Syncable tables carry `synced` (0/1) and timestamps for the last-write-wins strategy.

## Conventions

- Arabic month names are canonical: `يناير, فبراير, مارس, أبريل, مايو, يونيو, يوليو, أغسطس, سبتمبر, أكتوبر, نوفمبر, ديسمبر`.
- `created_at`/`updated_at` are ISO timestamps; `updated_at` drives sync conflict resolution.
- Boolean flags stored as INTEGER 0/1.

## Entities

### User  (`users`)
Application account governing access (FR-001..FR-005a).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| username | TEXT | unique, required |
| password | TEXT | bcrypt hash, required |
| role | TEXT | `admin` \| `employee` |
| name | TEXT | optional display name |
| is_active | INTEGER | default 1 |
| created_at | TEXT | default now |

- Seed: one default `admin` on first launch; prompt to change password.
- Admins manage employee accounts in-app (clarification Q1); the user-management screen is admin-only.

### Child  (`children`)
Enrolled child (FR-006..FR-009).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| name | TEXT | required |
| guardian | TEXT | required |
| guardian_phone | TEXT | required |
| child_phone | TEXT | optional |
| national_id | TEXT | optional |
| service | TEXT | `حضانة` \| `استضافة` \| `جلسة` |
| unit | TEXT | `شهر` \| `يوم` \| `ساعة` \| `جلسة` (defaults from service) |
| price | REAL | defaults from settings, editable |
| reg_date | TEXT | registration date |
| notes | TEXT | optional |
| is_active | INTEGER | default 1 |
| created_at, updated_at | TEXT | |
| synced | INTEGER | default 0 |

- Search keys: name, guardian, guardian_phone, child_phone, national_id.
- Deactivating excludes the child from future payment generation; historical rows/statement preserved (edge case).

### Payment  (`payments`)
Monthly billing row per child (FR-010..FR-015, Q5).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| child_id | INTEGER FK → children.id | required |
| month | TEXT | Arabic month name |
| year | INTEGER | required |
| service, unit | TEXT | snapshot from child at generation |
| quantity | REAL | default 1, editable |
| price | REAL | from child/settings (not user-edited on row) |
| total | REAL | = quantity × price |
| paid | REAL | default 0, editable |
| balance | REAL | = total − paid (may be negative = credit) |
| status | TEXT | `paid` (paid ≥ total) \| `partial` (0 < paid < total) \| `unpaid` (paid = 0) |
| notes | TEXT | optional |
| created_at, updated_at | TEXT | |
| synced | INTEGER | default 0 |

- Uniqueness: one row per (child_id, month, year).
- Editable fields: `quantity`, `paid` only.
- Overpayment: paid > total allowed → negative `balance` shown as credit, status `paid` (Q5).

### Employee  (`employees`)
Staff member (FR-022).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| name | TEXT | required |
| role | TEXT | job title |
| base_salary | REAL | |
| housing | REAL | default 0 |
| transport | REAL | default 0 |
| net_salary | REAL | = base_salary + housing + transport |
| is_active | INTEGER | default 1 |
| created_at | TEXT | |
| synced | INTEGER | default 0 |

### Salary Payment  (`salary_payments`)
Monthly payroll record per employee (FR-023).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| employee_id | INTEGER FK → employees.id | required |
| month | TEXT | Arabic month name |
| year | INTEGER | |
| bonus | REAL | default 0 |
| deductions | REAL | default 0 |
| actual_paid | REAL | = net_salary + bonus − deductions |
| paid_date | TEXT | optional |
| notes | TEXT | optional |
| synced | INTEGER | default 0 |

- Uniqueness: one row per (employee_id, month, year).
- Admin-only module.

### Expense  (`expenses`)
Operational expense entry (FR-024, FR-025).

| Field | Type | Rules |
|-------|------|-------|
| id | INTEGER PK | auto |
| item | TEXT | required |
| month | TEXT | Arabic month name |
| year | INTEGER | |
| amount | REAL | |
| category | TEXT | optional |
| notes | TEXT | optional |
| created_at | TEXT | |
| synced | INTEGER | default 0 |

- Per-item annual total = Σ amount over the 12 months of a year.

### Setting  (`settings`)
Key/value configuration (FR-028..FR-034).

| Field | Type | Rules |
|-------|------|-------|
| key | TEXT PK | |
| value | TEXT | |

Key groups:
- **Pricing/targets**: `nursery_hourly/daily/monthly`, `hosting_hourly/daily/monthly`, `session_hourly/daily`, `target_profit_pct`, `max_capacity`, `work_days`, `work_hours`.
- **Security/sync**: `app_password` (hashed), `mongo_uri`, `last_sync`, `auto_sync_interval`.
- **Branding** (`brand_*`): `brand_app_name`, `brand_org_name`, `brand_tagline`, `brand_primary_color`, `brand_accent_color`, `brand_logo_path`, `brand_icon_path`, `brand_phone`, `brand_address`, `brand_email`, `brand_show_logo_sidebar`, `brand_show_logo_login`, `brand_show_logo_export`.
- **Currency**: fixed EGP (display label; not user-editable in this version).

### Sync Log  (`sync_log`)
Record of synchronization actions (FR-047).

| Field | Type |
|-------|------|
| id | INTEGER PK |
| action | TEXT (`push` \| `pull`) |
| table_name | TEXT |
| record_id | INTEGER |
| status | TEXT (`ok` \| `error`) |
| error | TEXT |
| synced_at | TEXT |

## Relationships

- `children` 1—N `payments` (child_id).
- `employees` 1—N `salary_payments` (employee_id).
- `settings`, `users`, `expenses`, `sync_log` are standalone.

## Derived / computed (not stored)

- **Dashboard** (per month): totalInvoiced = Σ payments.total; totalCollected = Σ paid; arrears = Σ balance where balance > 0; collectionRate = collected/invoiced; salaries = Σ actual_paid; expensesTotal = Σ expense.amount; netProfit = collected − (expensesTotal + salaries).
- **Target**: targetRequired = expensesTotal / (1 − target_profit_pct); gap = targetRequired − collected.
- **Statement**: per month from reg_date → now: total = quantity × price, balance = total − paid, status as above.
- **Coverage %**: Σ(serviceCount × servicePrice) / targetRequired × 100.

## State transitions

- **Payment.status**: unpaid → partial → paid as `paid` increases; reversible if `paid` decreased. Overpayment keeps `paid` with negative balance.
- **Child.is_active / Employee.is_active / User.is_active**: active ⇄ inactive (deactivation hides from new generation/listings but preserves history).
- **Row.synced**: 0 → 1 after successful push; reset to 0 on local edit.
