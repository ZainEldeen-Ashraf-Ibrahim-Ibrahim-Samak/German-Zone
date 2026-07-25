# Phase 1 Contracts: IPC Surface Delta

Only **changes and additions** relative to the existing surface. Every handler re-validates role
server-side via `electron/ipc/_guard.ts` (`checkAuth` / `requireAdmin`). Notation: `channel` → `args` ⇒
`result`. New `window.api` bridge entries are added in the preload bridge; removed channels are deleted
from it.

---

## Removed — `electron/ipc/dailyPaymentsIPC.ts` (deleted entirely)

All `dailyPayments:*` channels are removed. The module file, its `main.ts` registration, its
`window.api.dailyPayments.*` bridge entries, and its `SYNC_ENTITIES` rows in `mongoSync.ts` are deleted.

---

## Transactions (new — `electron/ipc/transactionsIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `transactions:list` (new) | `{ range: 'day'\|'week'\|'month'\|'custom', date?: string, from?: string, to?: string, childId?: number, status?: string }` | `Transaction[]` (child, service, amount, type, date) sorted by date desc | all (authenticated) |

- `range = 'day'` requires `date`; `week`/`month` require `date` (any date within the target
  week/month — week computed Saturday–Friday); `custom` requires `from` and `to` (inclusive).
- Missing/invalid range params return a validation error rather than an empty/ambiguous result.

---

## Child Illness Cases (new — `electron/ipc/childIllnessCasesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `childIllnessCases:getOpen` (new) | `{ child_id }` | `ChildIllnessCase \| null` | all (authenticated) |
| `childIllnessCases:create` (new) | `{ child_id, description, opened_at }` | `ChildIllnessCase` (status `open`) | all (authenticated) |
| `childIllnessCases:resolve` (new) | `{ id, resolved_at }` | `ChildIllnessCase` (status `resolved`) | all (authenticated) |
| `childIllnessCases:list` (new) | `{ child_id }` | `ChildIllnessCase[]` (history) | all (authenticated) |

---

## Child Activities / Diary (new — `electron/ipc/childActivitiesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `childActivities:list` (new) | `{ child_id }` | `ChildActivity[]` (chronological) | all (authenticated) |
| `childActivities:create` (new) | `{ child_id, activity_date, note?, media_data_url?, media_type?: 'photo'\|'video' }` | `ChildActivity` | all (authenticated) |
| `childActivities:delete` (new) | `{ id }` | `{ success: true }` | admin |

- `childActivities:create` rejects with a descriptive error if `child_illness_cases` has an `open`
  row for `child_id` (server-side enforcement of FR-007), rather than silently allowing it.
- When `media_data_url` is present, the handler calls `cloudinaryService.uploadImage` (photo) or
  the new `cloudinaryService.uploadVideo` (video); on upload failure the note is still saved and the
  row is written with `media_status: 'failed'` (Edge Cases) instead of the whole call failing.

---

## Child Timetable (extended — `electron/ipc/childServicesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `childServices:getTimetable` (new) | `{ child_id }` | `TimetableSlot[]` (day/lesson_days, service, teacher) derived from existing `child_services` + `service_teachers` rows | all (authenticated) |
| `childServices:getPaymentSummary` (extended) | unchanged args | unchanged fields **plus** `remaining_due` (= `total_due - total_paid`) | all (authenticated) |

---

## Calendar (new — `electron/ipc/calendarIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `calendar:getMonth` (new) | `{ year, month }` | `CalendarEntry[]` aggregated from `child_services` (lesson_days/teacher) and `scheduled_sessions`/`session_teachers` for that month, grouped by day | all (authenticated) — identical result for admin and employee (no per-role filtering, per Clarifications) |
| `calendar:getDay` (new) | `{ date }` | `{ date, entries: CalendarEntry[] }` — drill-down list of users scheduled that day with related service/teacher; empty `entries` array when nobody is scheduled | all (authenticated) |

---

## Sync (modified — `electron/services/mongoSync.ts`)

- Remove `DailyPaymentModel`, `DailyPaymentTransactionModel`, and their two `SYNC_ENTITIES` rows.
- Add `ChildActivityModel` (mirrors existing schema pattern, includes `media_url`/`media_type`/`media_status`)
  and its `SYNC_ENTITIES` row (`{ name: 'child_activities', model: ChildActivityModel, table: 'child_activities' }`).
- Add `ChildIllnessCaseModel` and its `SYNC_ENTITIES` row analogously.
