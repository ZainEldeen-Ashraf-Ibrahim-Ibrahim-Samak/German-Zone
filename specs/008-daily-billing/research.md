# Research: Daily Billing (008)

**Phase 0 — Resolved Unknowns**
**Date**: 2026-07-08

---

## 1. IPC Pattern for the New `daily_payments` Entity

**Decision**: Mirror the existing `payments` IPC module (`electron/ipc/paymentsIPC.ts`) exactly, naming the new module `electron/ipc/dailyPaymentsIPC.ts`. Register it in `electron/main.ts` the same way.

**Rationale**: Every feature in this codebase follows the same IPC handler → preload bridge → Zustand store → React page flow. Deviating would be inconsistent and harder to maintain.

**Handlers to add** (mirrors `payments:*`):
- `daily_payments:get` — fetch by `billing_date`
- `daily_payments:generate` — create rows for active children on a given date
- `daily_payments:update` — update paid/quantity/notes/method on a record
- `daily_payments:bulkPay` — mark multiple records as paid
- `daily_payments:deleteBulk` — delete selected records (admin)
- `daily_payments:deleteAll` — delete all records for a date (admin)
- `daily_payments:deleteForChild` — delete all records for a child on a date (admin)

**Alternatives considered**: Re-using the same `payments` table with a `billing_type` column. Rejected: it would require modifying the unique constraint and all existing queries, risking regression in the stable monthly billing flow.

---

## 2. SQLite Table Design for `daily_payments`

**Decision**: New table `daily_payments` with this schema:

```sql
CREATE TABLE IF NOT EXISTS daily_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  service_id INTEGER,
  billing_date TEXT NOT NULL,        -- ISO date: YYYY-MM-DD
  month TEXT NOT NULL,               -- Arabic month name (same convention as payments)
  year INTEGER NOT NULL,
  service TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  price REAL NOT NULL,
  total REAL NOT NULL,
  paid REAL DEFAULT 0,
  balance REAL NOT NULL,
  status TEXT NOT NULL,              -- 'paid' | 'partial' | 'unpaid'
  notes TEXT,
  payment_method_id INTEGER,
  payment_method_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  UNIQUE (child_id, service_id, billing_date)
);
```

Migration number: `034_daily_payments` (current last migration is `033_notifications`).

**Rationale**: `billing_date` (ISO date) is the primary lookup key. `month`/`year` Arabic names are stored redundantly (same as `payments`) so the UI's month-name conventions work without conversion. The unique constraint on `(child_id, service_id, billing_date)` prevents duplicate generation.

**Alternatives considered**: Using a separate `billing_date` column on the existing `payments` table. Rejected: adds nullable column to a heavily-used table and blurs the monthly/daily distinction throughout the codebase.

---

## 3. MongoDB Model for `sync_daily_payments`

**Decision**: Add a `DailyPaymentModel` in `electron/services/mongoSync.ts` mirroring all SQLite columns and register it in `SYNC_ENTITIES` as `{ name: 'daily_payments', model: DailyPaymentModel, table: 'daily_payments' }`.

**Schema** (all fields mirror the SQLite columns):

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

**Rationale**: The existing sync engine iterates `SYNC_ENTITIES` generically; adding one entry automatically enables push, pull, and conflict resolution with no changes to the sync logic.

---

## 4. Frontend State Management: Zustand Store

**Decision**: Add `src/store/useDailyPaymentsStore.ts` modelled directly on `usePaymentsStore.ts`, with `currentDate` (ISO string) replacing `currentMonth`/`currentYear`.

**Key state**: `{ dailyPayments, byChild, summary, isLoading, error, currentDate, setDate, fetch, generate, update, bulkPay, deleteForChild, deleteSelected, deleteAll, clearError }`

**Alternatives considered**: Sharing the existing `usePaymentsStore`. Rejected: the store holds `currentMonth`/`currentYear` state which is incompatible with a per-date model, and mixing the two would make the store harder to reason about.

---

## 5. Generation Logic — Which Children to Bill

**Decision**: Generate one row per active child (`is_active = 1`) per enrolled service in `child_services`, using the service's `price` as the daily rate. Only services where `unit = 'يوم'` are billed daily; other units are skipped.

**Why `unit = يوم` only**: This matches the spec assumption and matches the fact that the `payments` module already handles monthly (`شهر`) and session (`جلسة`) services. Charging a "daily rate" for a session-based service doesn't make sense semantically.

**Quantity default**: Always `1` for a daily billing record (one day). The admin can change it if needed (e.g. billing for 2 days as a group entry).

**Alternatives considered**: Using the service's `price_daily` from `service_definitions`. Rejected: `child_services` already stores the individual child's negotiated price, which is the correct value to bill.

---

## 6. UI Component Reuse

**Decision**: The new `DailyPayments.tsx` page will reuse `PaymentRow.tsx` as-is — it accepts a `Payment`-compatible object and the daily payment type has the same fields. A minor type alias `DailyPayment = Payment` (with `billing_date` added) will be used in the store/types.

**Navigation**: Add `daily-payments` route under `/payments/daily` in `App.tsx`. The existing `/payments` route remains unchanged pointing to `MonthlyPayments.tsx`. The Sidebar gets a sub-item under Payments.

**Alternatives considered**: A single tabbed `PaymentsPage` container with Monthly/Daily tabs. Rejected: adds complexity, and the existing Monthly page is a self-contained page — a new sibling page is simpler and matches how every other feature in this app is structured.

---

## 7. `storage:clear` — Daily Payments

**Decision**: Add `db.prepare('DELETE FROM daily_payments').run()` to the `clearAll` transaction in `storageIPC.ts`. MongoDB is not cleared (existing decision from session 008).

---

## 8. Preload Bridge

**Decision**: Add a `dailyPayments` namespace to `electron/preload.ts` exposing the seven IPC channels listed in section 1.

---

## Summary of All Files Touched

| Layer | File | Change |
|---|---|---|
| DB Migration | `electron/db/migrations/index.ts` | Add `034_daily_payments` migration |
| Electron IPC | `electron/ipc/dailyPaymentsIPC.ts` | **NEW** — all 7 handlers |
| Electron Main | `electron/main.ts` | Import new IPC module |
| Preload | `electron/preload.ts` | Add `dailyPayments` namespace |
| Mongo Model | `electron/services/mongoSync.ts` | Add `DailyPaymentModel` + `SYNC_ENTITIES` entry |
| Types | `src/types/index.ts` | Add `DailyPayment` interface |
| Zustand Store | `src/store/useDailyPaymentsStore.ts` | **NEW** |
| React Page | `src/pages/Payments/DailyPayments.tsx` | **NEW** |
| Router | `src/App.tsx` | Add `/payments/daily` route |
| Storage Clear | `electron/ipc/storageIPC.ts` | Add `DELETE FROM daily_payments` |
