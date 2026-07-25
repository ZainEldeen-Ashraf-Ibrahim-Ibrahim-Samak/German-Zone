# Quickstart: Daily Billing (008)

**Feature**: `008-daily-billing`
**Date**: 2026-07-08

---

## What This Feature Does

Adds a **Daily Billing** page to the nursery app, parallel to the existing Monthly Billing page. Staff can select any calendar date, generate one billing record per active child enrolled in a daily-rate service, record payments, filter/search records, and sync everything to MongoDB alongside all other entities.

---

## Files to Create (NEW)

| File | Purpose |
|---|---|
| `electron/ipc/dailyPaymentsIPC.ts` | IPC handlers for all 7 `daily_payments:*` channels |
| `src/store/useDailyPaymentsStore.ts` | Zustand store (mirrors `usePaymentsStore`) |
| `src/pages/Payments/DailyPayments.tsx` | React page (mirrors `MonthlyPayments.tsx`) |

---

## Files to Modify (EXISTING)

| File | Change Summary |
|---|---|
| `electron/db/migrations/index.ts` | Add migration `034_daily_payments` |
| `electron/main.ts` | Import `./ipc/dailyPaymentsIPC.js` |
| `electron/preload.ts` | Add `dailyPayments` namespace |
| `electron/services/mongoSync.ts` | Add `DailyPaymentModel` + `SYNC_ENTITIES` entry |
| `electron/ipc/storageIPC.ts` | Add `DELETE FROM daily_payments` to `clearAll` |
| `src/types/index.ts` | Add `DailyPayment` interface |
| `src/App.tsx` | Add route `/payments/daily` |
| Sidebar component | Add nav link for Daily Billing |

---

## Implementation Order (Dependency-Correct)

1. **Migration** — `034_daily_payments` must run before any other layer uses the table.
2. **Types** — `DailyPayment` interface needed by IPC and store.
3. **mongoSync** — `DailyPaymentModel` + `SYNC_ENTITIES` entry (no dependencies).
4. **IPC handlers** — `dailyPaymentsIPC.ts` (depends on DB, types).
5. **`main.ts` import** — register the IPC module.
6. **`storageIPC.ts`** — add `DELETE FROM daily_payments` to `clearAll`.
7. **Preload bridge** — expose `window.api.dailyPayments.*`.
8. **Zustand store** — `useDailyPaymentsStore.ts` (depends on preload bridge types).
9. **React page** — `DailyPayments.tsx` (depends on store, `PaymentRow` reuse).
10. **Router + Sidebar** — wire up navigation.

---

## Key Implementation Notes

### Generation Logic
- Only services with `unit = 'يوم'` in `child_services` are billed daily.
- SQL to fetch targets:
  ```sql
  SELECT cs.*, c.reg_date, c.is_active
  FROM child_services cs
  JOIN children c ON cs.child_id = c.id
  WHERE c.is_active = 1 AND cs.unit = 'يوم'
  ```
- Skip if `(child_id, service_id, billing_date)` already exists.

### Date State in the Store
- `currentDate: string` — ISO date (`YYYY-MM-DD`), defaults to today.
- `setDate(date: string)` triggers `fetchDailyPayments()`.

### Reusing `PaymentRow.tsx`
- `DailyPayment` has the same shape as `Payment` for display purposes.
- Pass a `DailyPayment` cast as `Payment` to `PaymentRow` — all displayed fields align.
- The "installments" button can be hidden by passing `onOpenInstallments={() => {}}` and removing the trigger (installments are out of scope for v1).

### Sync Registration
The single entry needed in `SYNC_ENTITIES` (in `mongoSync.ts`):
```typescript
{ name: 'daily_payments', model: DailyPaymentModel, table: 'daily_payments' }
```
No other sync code needs changing — the generic push/pull loop handles it automatically.

### `storage:clear` Addition
Add to the `clearAll` transaction in `storageIPC.ts`:
```typescript
db.prepare('DELETE FROM daily_payments').run()
```

---

## Verification Steps

1. Run `npm run dev` — app should start without errors.
2. Navigate to Daily Billing, select today's date, click Generate. Verify rows appear for daily-unit children.
3. Mark a row as paid. Verify status changes to "Paid" and summary updates.
4. Go to Sync → Push. Verify `daily_payments` appears in the pushed results with a non-zero count.
5. On a second machine (or after `storage:clear`), do a Pull. Verify the records appear.
6. Go to Storage → Clear All Data. Verify daily billing records are cleared locally and MongoDB is untouched.
