# Data Model: Daily Billing (008)

**Feature**: `008-daily-billing`
**Date**: 2026-07-08

---

## Entity: `DailyPayment`

The core entity representing a single day's billing charge for one child–service pair.

### Fields

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | `INTEGER` PK AUTOINCREMENT | No | Unique row identifier |
| `child_id` | `INTEGER` FK → `children.id` | No | The billed child |
| `service_id` | `INTEGER` FK → `child_services.id` | Yes | The enrolled service being billed |
| `billing_date` | `TEXT` (ISO date `YYYY-MM-DD`) | No | The calendar day being billed |
| `month` | `TEXT` (Arabic month name) | No | Derived from `billing_date`; stored for UI month-name conventions |
| `year` | `INTEGER` | No | Derived from `billing_date`; stored for UI grouping |
| `service` | `TEXT` | No | Service name (snapshot at generation time) |
| `unit` | `TEXT` | No | `'يوم'` for daily services |
| `quantity` | `REAL` | No | Default `1.0`; admin can adjust |
| `price` | `REAL` | No | Daily price per unit (from `child_services.price`) |
| `total` | `REAL` | No | Computed: `quantity × price` |
| `paid` | `REAL` | No | Amount collected; starts at `0` |
| `balance` | `REAL` | No | Computed: `total − paid` |
| `status` | `TEXT` | No | One of `'paid'` / `'partial'` / `'unpaid'` |
| `notes` | `TEXT` | Yes | Free-text staff notes |
| `payment_method_id` | `INTEGER` | Yes | FK → `payment_methods.id` |
| `payment_method_name` | `TEXT` | Yes | Snapshot of method name at payment time |
| `created_at` | `TEXT` (ISO datetime) | No | Record creation timestamp |
| `updated_at` | `TEXT` (ISO datetime) | No | Last modification timestamp |
| `synced` | `INTEGER` | No | `0` = unsynced; `1` = synced to MongoDB |

### Constraints

- **Unique**: `(child_id, service_id, billing_date)` — prevents duplicate daily bills for the same child/service/day.
- **Foreign Key**: `child_id → children(id) ON DELETE CASCADE`
- **Status Enum**: `status ∈ { 'paid', 'partial', 'unpaid' }`

### Indexes (to add in migration)

```sql
CREATE INDEX IF NOT EXISTS idx_daily_payments_date ON daily_payments(billing_date);
CREATE INDEX IF NOT EXISTS idx_daily_payments_child ON daily_payments(child_id, billing_date);
CREATE INDEX IF NOT EXISTS idx_daily_payments_synced ON daily_payments(synced);
```

---

## Derived View: `DailyPaymentSummary`

Not a stored table — computed on every `daily_payments:get` call.

| Field | Type | Description |
|---|---|---|
| `totalInvoiced` | `number` | Sum of `total` for the selected date |
| `totalCollected` | `number` | Sum of `paid` for the selected date |
| `arrears` | `number` | Sum of positive `balance` values (unpaid/partial) |

---

## State Transitions: `status`

```
           generate()
               │
               ▼
          ┌─────────┐
          │ unpaid  │◄────────── paid reset to 0
          └────┬────┘
               │ update(paid > 0 && paid < total)
               ▼
          ┌─────────┐
          │ partial │
          └────┬────┘
               │ update(paid >= total)
               ▼
          ┌─────────┐
          │  paid   │
          └─────────┘
```

---

## Relationships to Existing Entities

```
children ──< daily_payments >── child_services
                    │
                    └── payment_methods (optional)
```

- One child can have **many** daily payment records (one per service per day).
- Each daily payment record optionally references **one** payment method.
- There is **no** relationship to `payment_transactions` (installments are out of scope for v1).

---

## Migration Script: `034_daily_payments`

```sql
CREATE TABLE IF NOT EXISTS daily_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  service_id INTEGER,
  billing_date TEXT NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  service TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  price REAL NOT NULL,
  total REAL NOT NULL,
  paid REAL DEFAULT 0,
  balance REAL NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  payment_method_id INTEGER,
  payment_method_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  UNIQUE (child_id, service_id, billing_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_payments_date ON daily_payments(billing_date);
CREATE INDEX IF NOT EXISTS idx_daily_payments_child ON daily_payments(child_id, billing_date);
CREATE INDEX IF NOT EXISTS idx_daily_payments_synced ON daily_payments(synced);
```

---

## MongoDB Schema: `sync_daily_payments`

Collection name: `sync_daily_payments`
Model name: `DailyPaymentModel`

All fields mirror the SQLite columns (all typed as `Number` or `String` per existing convention). The integer `id` is used as the Mongo document identifier (`_id` suppressed via `versionKey: false, _id: false`).

```typescript
const dailyPaymentSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  child_id: Number,
  service_id: Number,
  billing_date: String,
  month: String,
  year: Number,
  service: String,
  unit: String,
  quantity: Number,
  price: Number,
  total: Number,
  paid: Number,
  balance: Number,
  status: String,
  notes: String,
  payment_method_id: Number,
  payment_method_name: String,
  created_at: String,
  updated_at: String,
  synced: Number,
}, sharedOptions)
```

---

## TypeScript Interface

```typescript
export interface DailyPayment {
  id: number
  child_id: number
  service_id?: number | null
  billing_date: string          // ISO: 'YYYY-MM-DD'
  month: string                 // Arabic month name
  year: number
  service: string
  unit: string
  quantity: number
  price: number
  total: number
  paid: number
  balance: number
  status: PaymentStatus         // reuses existing union type
  notes?: string | null
  payment_method_id?: number | null
  payment_method_name?: string | null
  created_at: string
  updated_at: string
  synced: number

  // Optional join fields for UI
  child_name?: string
  child_guardian?: string
  child_guardian_phone?: string
  child_is_active?: number
}
```
