# Quickstart: Printing & Export System + Attendance Edit Approval Workflow

Manual verification steps once implementation is complete. Assumes the dev app is running (`npm run dev`)
against a local SQLite DB with migrations applied through this feature's new tables
(`attendance_edit_requests`, `attendance_audit_log`, `notifications`).

## Part A — Printing & Export

### 1. Salary (Payroll) Report

1. Sign in as admin → Salaries → Payroll Report tab.
2. Apply a date range and (if available) a teacher filter.
3. Click **Export Excel** → confirm the downloaded `.xlsx` shows the same filtered rows, in the same sort
   order, plus a totals row, the org logo, and a "Generated at" timestamp in the header.
4. Click **Export PDF** → confirm the same content renders as a paginated PDF with the same header.
5. Click **Print** → confirm a print preview opens showing the identical filtered/branded report.
6. Clear the filters so zero rows match → repeat Export PDF → confirm a clearly-labeled empty report is
   produced, not an error.

### 2. Expenses Report

1. Expenses → filter by category and date range.
2. Export Excel/PDF/Print → confirm expense name, category, amount, paid by, date, and notes appear per
   row, with totals, logo, and timestamp, matching the filtered on-screen view.

### 3. Child Report

1. Children → open a child with attendance history, at least one teacher, one or more services, and
   payment history.
2. Click **Print Child Report** (or Export PDF/Excel) → confirm the output includes: personal info,
   attendance history, assigned teacher(s), services, computed attendance percentage, payment history, and
   notes — all in one document, with logo and timestamp.
3. Repeat for a newly-created child with no attendance yet → confirm the attendance section renders empty
   (0%/N/A) instead of failing.

### 4. Financial Transactions Report

1. From the same child, open the Financial Transactions Report.
2. Export Excel/PDF → confirm every recorded transaction (payments; refunds/discounts/adjustments if any
   exist elsewhere in the system) appears with type, date, amount, and the resulting outstanding balance.

## Part B — Attendance Edit Approval Workflow

### 5. Attendance locks after first save

1. Sign in as an employee → Sessions → open today's session → mark a child's attendance → Save.
2. Try to change that same child's status again directly → confirm the UI blocks the direct edit and
   instead offers "Request Edit."
3. Confirm the originally saved value is still shown, unchanged.

### 6. Submit and approve an edit request

1. As the employee, click "Request Edit" on the locked record → change the status → enter a reason →
   submit.
2. Confirm the request appears with status "Pending" and the admin receives an in-app notification.
3. Sign in as admin → open the Edit Requests inbox → find the pending request → **Approve**.
4. Confirm: the attendance record now shows the requested value; any teacher payment tied to the old value
   is voided and a new one generated if applicable; the request shows "Approved"; the employee receives an
   in-app notification.
5. Open the attendance record's audit log → confirm one entry with old value, new value, changed-by
   (employee), approved-by (admin), timestamp, and reason.

### 7. Submit and reject an edit request

1. Repeat step 6.1–6.2 for a different record.
2. As admin, **Reject** the request instead, with a short decision note.
3. Confirm the attendance record and any related payment are completely unchanged, the request shows
   "Rejected," and the employee is notified.

### 8. Admin direct edit bypasses the request flow

1. As admin, open a locked attendance record directly and change it without going through the request
   flow.
2. Confirm the change applies immediately, the affected payment is recalculated, and an audit log entry is
   still created (with `changed_by` = `approved_by` = the admin).

### 9. Duplicate pending request is blocked

1. Submit an edit request for a locked record as an employee.
2. While it's still pending, attempt to submit a second edit request for the same record.
3. Confirm the system blocks the second submission and shows the existing pending request instead of
   creating a duplicate.

### 10. Employee cannot approve/reject

1. Sign in as an employee (non-admin).
2. Attempt to call/reach the approve or reject action on any edit request (including one they submitted
   themselves).
3. Confirm the action is denied.
