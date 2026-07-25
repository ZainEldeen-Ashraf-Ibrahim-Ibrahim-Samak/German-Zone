# Implementation Plan: Daily Billing

**Branch**: `008-daily-billing` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-daily-billing/spec.md`

---

## Summary

Add a Daily Billing module to the nursery Electron/React desktop app that mirrors the existing Monthly Billing flow but operates on a per-date (day) granularity. A new `daily_payments` SQLite table stores one billing record per active child/service/date. Seven IPC handlers expose CRUD and generation logic to the renderer. A new Zustand store and React page surface the functionality in the UI. The `daily_payments` entity is registered in the MongoDB sync engine (`SYNC_ENTITIES`) so push and pull work automatically with no changes to the sync logic.

---

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js 20 LTS

**Primary Dependencies**:
- Electron 32 (IPC / preload / main process)
- React 18 + React Router DOM (renderer)
- Zustand (renderer state)
- better-sqlite3 (local storage)
- Mongoose / MongoDB (cloud sync)
- react-i18next (bilingual AR/EN)

**Storage**: SQLite (better-sqlite3) for local data; MongoDB Atlas via Mongoose for cloud sync

**Testing**: Vitest (unit), Playwright (e2e)

**Target Platform**: macOS / Windows desktop (Electron app)

**Project Type**: Desktop application (Electron + Vite + React renderer)

**Performance Goals**: Generate 200 records in < 3s; UI re-renders < 100ms after date change

**Constraints**: Offline-capable; every table row must carry a `synced` flag; no new runtime dependencies allowed

**Scale/Scope**: Up to 200 active children × 1 daily-rate service each = 200 records per day

---

## Constitution Check

*Constitution file contains unfilled template placeholders — no project-specific gates defined.*

**Applied standards** (derived from codebase conventions):
- ✅ No new npm runtime dependencies — feature reuses existing IPC, Mongoose, Zustand, better-sqlite3
- ✅ New entity follows established `synced` flag + `SYNC_ENTITIES` registration pattern
- ✅ New IPC module imported in `main.ts` (same registration pattern as all other modules)
- ✅ Migration added to the migrations array (additive, never destructive)
- ✅ Role-based access control (admin vs. employee) enforced at IPC handler level

---

## Project Structure

### Documentation (this feature)

```text
specs/008-daily-billing/
├── spec.md              ← feature specification
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── ipc.md           ← IPC interface contracts
└── checklists/
    └── requirements.md  ← quality checklist (all pass)
```

### Source Code Layout

```text
electron/
├── db/migrations/index.ts       ← ADD migration 034_daily_payments
├── ipc/
│   ├── dailyPaymentsIPC.ts      ← NEW (7 handlers)
│   └── storageIPC.ts            ← MODIFY: add DELETE FROM daily_payments
├── main.ts                      ← MODIFY: import dailyPaymentsIPC
├── preload.ts                   ← MODIFY: add dailyPayments namespace
└── services/mongoSync.ts        ← MODIFY: DailyPaymentModel + SYNC_ENTITIES entry

src/
├── types/index.ts               ← MODIFY: add DailyPayment interface
├── store/
│   └── useDailyPaymentsStore.ts ← NEW
└── pages/Payments/
    └── DailyPayments.tsx        ← NEW
```

**Structure Decision**: Single Electron app with Vite renderer. All new files slot into the existing feature-module layout. No new top-level directories.

---

## Proposed Changes (Ordered by Dependency)

### Step 1 — DB Migration: `034_daily_payments`

**File**: `electron/db/migrations/index.ts`

Add a new migration entry after `033_notifications`:

```typescript
{
  name: '034_daily_payments',
  up: (db) => {
    db.exec(`
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
    `)
  }
}
```

---

### Step 2 — TypeScript Interface

**File**: `src/types/index.ts`

Add `DailyPayment` interface (see `data-model.md` for full definition). Appended after existing `Payment` interface.

---

### Step 3 — MongoDB Model

**File**: `electron/services/mongoSync.ts`

1. Add `dailyPaymentSchema` + `DailyPaymentModel` (after `NotificationModel`).
2. Add to `SYNC_ENTITIES` array:
   ```typescript
   { name: 'daily_payments', model: DailyPaymentModel, table: 'daily_payments' }
   ```

---

### Step 4 — IPC Handlers

**File**: `electron/ipc/dailyPaymentsIPC.ts` *(new)*

Implement all 7 handlers as defined in `contracts/ipc.md`:
- `daily_payments:get`
- `daily_payments:generate`
- `daily_payments:update`
- `daily_payments:bulkPay`
- `daily_payments:deleteBulk`
- `daily_payments:deleteAll`
- `daily_payments:deleteForChild`

Reuse `calculatePayment()` from `paymentsIPC.ts` — export it from there (or copy the pure function).

---

### Step 5 — Register IPC in Main

**File**: `electron/main.ts`

Add after existing IPC imports:
```typescript
import './ipc/dailyPaymentsIPC.js'
```

---

### Step 6 — Storage Clear

**File**: `electron/ipc/storageIPC.ts`

Add inside the `clearAll` transaction (after existing `DELETE FROM` statements):
```typescript
db.prepare('DELETE FROM daily_payments').run()
```

---

### Step 7 — Preload Bridge

**File**: `electron/preload.ts`

Add `dailyPayments` namespace to the `api` object (after the `payments` section):
```typescript
dailyPayments: {
  get:            (args: any) => ipcRenderer.invoke('daily_payments:get', args),
  generate:       (args: any) => ipcRenderer.invoke('daily_payments:generate', args),
  update:         (args: any) => ipcRenderer.invoke('daily_payments:update', args),
  bulkPay:        (args: any) => ipcRenderer.invoke('daily_payments:bulkPay', args),
  deleteBulk:     (ids: number[]) => ipcRenderer.invoke('daily_payments:deleteBulk', { ids }),
  deleteAll:      (args: any) => ipcRenderer.invoke('daily_payments:deleteAll', args),
  deleteForChild: (args: any) => ipcRenderer.invoke('daily_payments:deleteForChild', args),
},
```

---

### Step 8 — Zustand Store

**File**: `src/store/useDailyPaymentsStore.ts` *(new)*

State shape:
```typescript
{
  dailyPayments: DailyPayment[]
  byChild: any[]
  summary: { totalInvoiced: number; totalCollected: number; arrears: number }
  isLoading: boolean
  error: string | null
  currentDate: string           // ISO 'YYYY-MM-DD', default = today
  setDate: (date: string) => void
  fetchDailyPayments: () => Promise<void>
  generateDailyPayments: () => Promise<number>
  updateDailyPayment: (args) => Promise<DailyPayment | null>
  bulkPay: (ids: number[], payment_method_id?: number | null) => Promise<number>
  deleteForChild: (child_id: number) => Promise<boolean>
  deleteSelected: (ids: number[]) => Promise<number>
  deleteAll: () => Promise<number>
  clearError: () => void
}
```

---

### Step 9 — React Page

**File**: `src/pages/Payments/DailyPayments.tsx` *(new)*

Layout mirrors `MonthlyPayments.tsx`:
- **Header**: title + Generate button + Delete All (admin)
- **Date picker card**: `<input type="date">` (native HTML date input) replacing month/year selectors
- **Summary stats**: totalInvoiced / totalCollected / arrears (same `<Stat>` components)
- **Search & filter bar**: name search, phone search, status filter (all, paid, partial, unpaid)
- **Table**: reuses `<PaymentRow>` with `DailyPayment` cast as `Payment`; hides installments button
- **Bulk actions bar**: select-all, bulk-pay, delete-selected (admin)
- **Modals**: confirm-delete modal (same pattern as MonthlyPayments)

---

### Step 10 — Router & Navigation

**File**: `src/App.tsx`

Add route (accessible by both admin and employee, mirroring `/payments`):
```tsx
<Route path="payments/daily" element={<DailyPayments />} />
```

**File**: Sidebar component (identify path during implementation)

Add nav item under the Payments section:
- Arabic label: `دفع يومي`
- English label: `Daily Billing`
- Route: `/payments/daily`

---

## Complexity Tracking

No constitution violations. All changes are additive (new table, new module, new page) and follow the established patterns 1:1.

---

## Verification Plan

### Automated Tests (existing test runner)
```bash
npm run test:unit     # Verify migration runs cleanly; calculatePayment logic
npm run test:e2e      # Smoke-test navigation to /payments/daily
```

### Manual Verification (step-by-step)
1. `npm run dev` — app starts without errors or TypeScript complaints.
2. Navigate to **Daily Billing** (`/payments/daily`).
3. Pick today's date → click **Generate Daily Bills** → rows appear for daily-unit children.
4. Mark a row as **Paid** → status badge changes, summary updates.
5. Select multiple rows → **Bulk Pay** → all change to Paid.
6. **Sync → Push** — `daily_payments` shown in results with count > 0.
7. **Storage → Clear All Data** — daily records gone locally; MongoDB untouched.
8. **Sync → Pull** — records restored from MongoDB.
9. Try as employee role: quantity field is non-editable; delete buttons hidden.
