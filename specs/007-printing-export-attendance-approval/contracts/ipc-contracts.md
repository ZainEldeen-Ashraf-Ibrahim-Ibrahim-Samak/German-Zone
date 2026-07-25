# Phase 1 Contracts: IPC Surface Delta

Only **changes and additions** relative to the existing surface. Every handler re-validates role
server-side via `electron/ipc/_guard.ts` (`checkAuth` / `requireAdmin`). Notation: `channel` → `args` ⇒
`result`. New `window.api` bridge entries are added in `electron/preload.ts`.

---

## Attendance locking + edit requests (extended/new — `electron/ipc/attendanceIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `attendance:record` (extended) | unchanged args | unchanged result, but now: for a non-admin caller, any record whose `(session_id, child_id, teacher_id)` already has an existing row is **skipped** with a per-row `{ locked: true }` marker in the response instead of being overwritten; admin callers are unaffected and continue to write directly (each direct admin write also inserts an `attendance_audit_log` row) | all (authenticated); direct-write branch admin-only per row |
| `attendance:requestEdit` (new) | `{ attendance_record_id, requested_status, requested_excuse_notes?, requested_teacher_status?, reason }` | `AttendanceEditRequest` (status `pending`) | all (authenticated, non-admin submits; admin submitting is rejected — admins edit directly) |
| `attendance:listEditRequests` (new) | `{ status?: 'pending'\|'approved'\|'rejected', child_id?, teacher_id? }` | `AttendanceEditRequest[]` | admin (sees all); employee (sees only their own `requested_by`) |
| `attendance:decideEditRequest` (new) | `{ id, decision: 'approve'\|'reject', decision_notes? }` | `AttendanceEditRequest` (updated) | admin |
| `attendance:getAuditLog` (new) | `{ attendance_record_id }` | `AttendanceAuditLogEntry[]` (chronological) | admin |

- `attendance:decideEditRequest` approve path: inside one transaction — (1) apply `requested_*` values to
  the target `attendance_records` row, (2) re-run the shared payment-eligibility function from feature 006
  (`isPaymentEligible`, extracted for reuse — see research.md #5) to void the stale `teacher_payments` row
  and regenerate one if the new values are payable, (3) insert one `attendance_audit_log` row referencing
  this request, (4) flip the request to `approved`, (5) enqueue a `notifications` row for `requested_by`.
  The `UPDATE ... WHERE status = 'pending'` guard on the request row makes this whole sequence a no-op
  (zero rows affected, surfaced as an error to the caller) if the request was already decided concurrently
  (Edge Cases).
- `attendance:decideEditRequest` reject path: only flips the request to `rejected` and enqueues a
  `notifications` row for `requested_by` — no writes to `attendance_records`, `teacher_payments`, or
  `attendance_audit_log`.
- `attendance:requestEdit` rejects with a descriptive error if a `pending` request already exists for that
  `attendance_record_id` (FR-015) — the error payload includes the existing request so the UI can surface
  it instead of a generic failure.

---

## Notifications (new — `electron/ipc/notificationsIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `notifications:list` (new) | `{ unreadOnly?: boolean }` | `Notification[]` for the current user | all (authenticated) |
| `notifications:markRead` (new) | `{ id }` or `{ all: true }` | `{ ok }` | all (authenticated; only own notifications) |

---

## Export / Print (extended/new — `electron/ipc/exportIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `export:salaries` (extended) | adds optional `dateFrom`, `dateTo` (used instead of `month`/`year` when the Payroll Report is filtered by an explicit date range rather than a single month) | unchanged shape | admin |
| `export:expenses` (extended) | adds optional `category`, `dateFrom`, `dateTo` filters, mirrored from the Expenses Report screen's on-screen filters | unchanged shape | admin |
| `export:payrollReport` (new) | `{ dateFrom, dateTo, teacherId?, format: 'xlsx'\|'pdf'\|'csv', lang }` | `{ filePath } \| null` (native save dialog, same pattern as existing `export:*`) | admin |
| `export:childReport` (new) | `{ childId, format: 'xlsx'\|'pdf'\|'csv', lang }` | `{ filePath } \| null` — full Child Report: personal info, attendance history, teachers, services, attendance %, payment history, notes (FR-007) | all (authenticated — matches existing `export:child` statement access) |
| `export:financialTransactions` (new) | `{ childId, dateFrom?, dateTo?, format: 'xlsx'\|'pdf'\|'csv', lang }` | `{ filePath } \| null` — every recorded transaction (currently: payments) for the child plus outstanding balance (FR-008) | all (authenticated) |
| `print:preview` (new) | `{ reportType: 'payroll'\|'expenses'\|'childReport'\|'financialTransactions', ...same params as the matching export:* channel, lang }` | `{ html: string }` rendered from the same document-definition data as the PDF export, for the renderer to display and hand to `window.print()` | matches the access level of the equivalent `export:*` channel |

- All new/extended `export:*` channels reuse `executeExport()`'s existing save-dialog + `buildExcelFile`/
  `buildPdfFile` dispatch, extended with a third `format: 'csv'` branch calling the new
  `csvService.ts:buildCsvFile()`.
- Every export/print payload embeds the filters actually used (`dateFrom`/`dateTo`/`teacherId`/`category`
  etc.) into the document header via the existing `exportHeader.ts` branding block, satisfying FR-003/
  FR-004 (filters, totals, logo, generated-at all shown on the output itself, not just implied by the
  request).
