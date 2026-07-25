# IPC Contract: Daily Payments (`daily_payments:*`)

**Feature**: `008-daily-billing`
**Layer**: Electron Main Process ↔ Renderer (via `contextBridge`)
**Date**: 2026-07-08

This document defines the IPC channel contracts for the Daily Billing feature. All channels follow the existing project convention: invoked via `window.api.dailyPayments.*` in the renderer, handled by `ipcMain.handle('daily_payments:*', ...)` in the main process.

---

## `daily_payments:get`

Fetch all daily billing records for a given date, with per-child rollups and summary totals.

**Request**:
```typescript
{ billing_date: string }  // ISO date: 'YYYY-MM-DD'
```

**Response**:
```typescript
{
  payments: DailyPayment[]
  byChild: {
    child_id: number
    child_name: string
    child_guardian: string | null
    child_guardian_phone: string | null
    child_is_active: number
    services: DailyPayment[]
    totalInvoiced: number
    totalCollected: number
    balance: number
    status: PaymentStatus
  }[]
  summary: {
    totalInvoiced: number
    totalCollected: number
    arrears: number
  }
}
```

**Errors**: Auth required (any logged-in user). Throws if `billing_date` is missing.

---

## `daily_payments:generate`

Generate one billing record per active child per enrolled daily-unit service for the given date. Skips records that already exist.

**Request**:
```typescript
{ billing_date: string }  // ISO date: 'YYYY-MM-DD'
```

**Response**:
```typescript
{ created: number }
```

**Business rules**:
- Only processes services where `unit = 'يوم'`
- Skips if a record already exists for `(child_id, service_id, billing_date)`
- Uses `child_services.price` as the daily unit price
- `quantity` defaults to `1`; `total = quantity × price`
- Marks `paid = 0`, `balance = total`, `status = 'unpaid'`

**Errors**: Auth required. Throws if `billing_date` is missing or invalid.

---

## `daily_payments:update`

Update the paid amount, quantity, notes, or payment method on a single record.

**Request**:
```typescript
{
  id: number
  quantity?: number          // admin only
  paid?: number
  notes?: string
  payment_method_id?: number | null
}
```

**Response**: Updated `DailyPayment` record (with `child_name` join).

**Business rules**:
- Non-admins may only change `paid`, `notes`, and `payment_method_id`
- Changing `quantity` by a non-admin throws `FORBIDDEN`
- Recalculates `total`, `balance`, `status` from `quantity × price` and new `paid`
- Sets `synced = 0`, updates `updated_at`

**Errors**: Auth required. Throws if record not found or quantity changed by non-admin.

---

## `daily_payments:bulkPay`

Mark multiple records as fully paid in a single transaction.

**Request**:
```typescript
{ ids: number[]; payment_method_id?: number | null }
```

**Response**:
```typescript
{ updated: number }
```

**Business rules**:
- Sets `paid = total`, `balance = 0`, `status = 'paid'` for each ID
- Sets `synced = 0`, updates `updated_at`

**Errors**: Auth required. Throws if `ids` is empty or missing.

---

## `daily_payments:deleteBulk`

Delete selected records. Admin only.

**Request**:
```typescript
{ ids: number[] }
```

**Response**:
```typescript
{ ok: boolean; deleted: number }
```

**Errors**: Admin required. Silently skips non-existent IDs.

---

## `daily_payments:deleteAll`

Delete all records for a given date. Admin only.

**Request**:
```typescript
{ billing_date: string }
```

**Response**:
```typescript
{ ok: boolean; deleted: number }
```

**Errors**: Admin required. Throws if `billing_date` is missing.

---

## `daily_payments:deleteForChild`

Delete all records for a specific child on a specific date. Admin only.

**Request**:
```typescript
{ child_id: number; billing_date: string }
```

**Response**:
```typescript
{ ok: true }
```

**Errors**: Admin required. Throws if `child_id` or `billing_date` missing.

---

## Preload Bridge (`window.api.dailyPayments`)

```typescript
dailyPayments: {
  get:            (args: { billing_date: string }) => Promise<GetResult>
  generate:       (args: { billing_date: string }) => Promise<{ created: number }>
  update:         (args: UpdateArgs)               => Promise<DailyPayment>
  bulkPay:        (args: BulkPayArgs)              => Promise<{ updated: number }>
  deleteBulk:     (ids: number[])                  => Promise<{ ok: boolean; deleted: number }>
  deleteAll:      (args: { billing_date: string }) => Promise<{ ok: boolean; deleted: number }>
  deleteForChild: (args: { child_id: number; billing_date: string }) => Promise<{ ok: true }>
}
```
