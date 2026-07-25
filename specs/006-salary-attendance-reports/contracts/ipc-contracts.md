# Phase 1 Contracts: IPC Surface Delta

Only **changes and additions** relative to the existing surface. Every handler re-validates role
server-side via `electron/ipc/_guard.ts` (`checkAuth` / `requireAdmin`). Notation: `channel` → `args` ⇒
`result`. New `window.api` bridge entries are added in `electron/preload.ts`.

---

## Service Teachers (new handlers — `electron/ipc/serviceTeachersIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `serviceTeachers:list` | `{ service_id }` | `Teacher[]` (teachers linked to that service) | all (authenticated) |
| `serviceTeachers:set` | `{ service_id, employee_ids: number[] }` | `{ ok }` (replaces the full list for that service) | admin |

- `serviceTeachers:list` is auth-level (not admin-only) because the child enrollment form (accessible to
  employees) needs it to populate the teacher dropdown for a service.
- If a service has zero rows in `service_teachers`, callers should fall back to the existing
  `teachers:list` (any active employee) — preserves current behavior for services that haven't been
  restricted to a specific teacher roster yet.

---

## Employees (extended — `electron/ipc/salariesIPC.ts`)

| Channel | Change |
|---------|--------|
| `employees:add` | Accepts new optional `teacher_session_rate: number` |
| `employees:update` | `patch.teacher_session_rate` accepted like other patchable fields |
| `employees:get` | Returned rows now include `teacher_session_rate` |

- No new channel — this is a field addition to the existing admin-only employee CRUD, surfaced in the
  Employees form as "Per Session Cost" (FR-004).

---

## Child Services / Enrollment (extended — `electron/ipc/childServicesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `childServices:previewTeacherCost` (new) | `{ teacher_id, lesson_days: number[] }` | `{ remaining_sessions: number, expected_cost: number, teacher_session_rate: number }` | all (authenticated) |

- Pure read-only computation (FR-002/FR-003) — never writes. `remaining_sessions` counts calendar dates
  from today (inclusive) through the last day of the current month whose weekday is in `lesson_days`,
  reusing the local-date parsing approach from `attendanceIPC.ts`/`sessionsIPC.ts`.
- `childServices:add`/`childServices:update` continue to accept `teacher_id` as before; the admin UI
  restricts the selectable options to `serviceTeachers:list` results for that service, but the IPC handler
  itself does not hard-reject an out-of-list `teacher_id` (avoids breaking existing/legacy data where a
  service has no configured teacher list yet).

---

## Attendance (extended — `electron/ipc/attendanceIPC.ts`)

| Channel | Change |
|---------|--------|
| `attendance:getSheet` | Each row now also returns `teacher_status`, `attended_teacher_id`, and a joined `payment` object (`{ generated: boolean, amount: number \| null, status: 'pending'\|'paid'\|'void'\|null }`) sourced from `teacher_payments` |
| `attendance:record` | Each record now accepts `teacher_status: 'present' \| 'absent'` alongside the existing `status`/`excuse_notes`. After upserting `attendance_records`, the handler evaluates the five payment-eligibility cases (FR-008…FR-011) inside the same transaction and upserts/voids the matching `teacher_payments` row (FR-013, FR-015, FR-016, FR-017) |
| `attendance:getChildHistory` (new) | `{ child_id }` ⇒ `AttendanceHistoryRow[]` — full attendance history for one child, each row carrying date, teacher, teacher status, child status, absence type, payment-generated flag, and session cost (FR-019) | admin |

`AttendanceHistoryRow`:
```ts
{
  attendance_date: string
  teacher_id: number | null
  teacher_name: string | null
  teacher_status: 'present' | 'absent' | null
  child_status: 'attended' | 'absent_excused' | 'absent_unexcused'
  payment_generated: boolean
  payment_status: 'pending' | 'paid' | 'void' | null
  session_cost: number | null
}
```

- Payment-eligibility evaluation (server-side, inside `attendance:record`'s existing transaction):
  - `teacher_status === 'present'` and `status IN ('attended','absent_unexcused')` → upsert
    `teacher_payments` row to `pending` (only creates a fresh `session_cost` snapshot if the row does not
    already exist or is currently `void`; a `paid` row is left untouched).
  - Otherwise → if an existing `teacher_payments` row for that (teacher, child, date) is `pending`, set it
    to `void`. A `paid` row is never auto-voided (research.md #7).
- `attendance:getSheet`/`attendance:record` keep their existing `checkAuth` (teacher-scoped) access level —
  recording attendance is unchanged in who may do it.

---

## Teacher Payments (new handlers — `electron/ipc/teacherPaymentsIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `teacherPayments:list` | `{ teacher_id?, child_id?, month?, year? }` | `TeacherPayment[]` (any combination of filters) | admin |
| `teacherPayments:markPaid` | `{ ids: number[] }` | `{ ok, updated: number }` — only affects rows currently `pending` | admin |

`TeacherPayment`: `{ id, teacher_id, teacher_name, child_id, child_name, attendance_date, session_cost,
status, created_at, updated_at }`.

---

## Payroll Report (new handler — `electron/ipc/payrollIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `payroll:report` | `{ month: number, year: number }` | `PayrollReportRow[]` | admin |

`PayrollReportRow`: `{ teacher_id, teacher_name, sessions_paid: number, session_cost: number,
total_salary: number }` — `sessions_paid` counts `teacher_payments` rows with `status IN ('pending','paid')`
for that teacher/month; `session_cost` is the teacher's *current* `teacher_session_rate` (display only);
`total_salary` is `SUM(session_cost)` of those same rows (reflects rate-at-generation-time per
research.md #8).

---

## Preload additions (`electron/preload.ts`)

```ts
serviceTeachers: {
  list: (service_id: number) => ipcRenderer.invoke('serviceTeachers:list', { service_id }),
  set: (service_id: number, employee_ids: number[]) => ipcRenderer.invoke('serviceTeachers:set', { service_id, employee_ids }),
},
childServices: {
  // ...existing entries...
  previewTeacherCost: (teacher_id: number, lesson_days: number[]) =>
    ipcRenderer.invoke('childServices:previewTeacherCost', { teacher_id, lesson_days }),
},
attendance: {
  // ...existing entries...
  getChildHistory: (child_id: number) => ipcRenderer.invoke('attendance:getChildHistory', { child_id }),
},
teacherPayments: {
  list: (filters: { teacher_id?: number; child_id?: number; month?: number; year?: number }) =>
    ipcRenderer.invoke('teacherPayments:list', filters),
  markPaid: (ids: number[]) => ipcRenderer.invoke('teacherPayments:markPaid', { ids }),
},
payroll: {
  report: (month: number, year: number) => ipcRenderer.invoke('payroll:report', { month, year }),
},
```
