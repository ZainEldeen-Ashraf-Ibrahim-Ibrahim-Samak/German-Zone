# Feature Specification: Printing & Export System + Attendance Edit Approval Workflow

**Feature Branch**: `007-printing-export-attendance-approval`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Feature 1: Printing & Export System — support printing and exporting (Print, PDF, Excel, optional CSV) for the Salary Report, Expenses Report, Child Report, and Financial Transactions Report, preserving filters, sorting, date range, totals, company logo, and generated date/time. Feature 2: Attendance Edit Approval Workflow — attendance is locked after first save; employees who want to change it must submit an Edit Request (child, teacher, date, original values, requested changes, reason, requester, request date, status); admins review and approve/reject; approval updates attendance, recalculates teacher payment (voiding the old payment and generating a new one if needed), and both submission and decision trigger notifications; every attendance modification is captured in an audit log (old value, new value, changed by, approved by, date/time, reason) and no attendance record is ever fully deleted; employees cannot edit locked attendance directly, only admins can approve changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Print and export the Salary Report (Priority: P1)

An administrator reviewing monthly payroll wants to hand a paper copy or PDF of the Salary Report to an owner/accountant, or open the numbers in Excel for further analysis, without retyping anything shown on screen.

**Why this priority**: Payroll reporting is the most frequent "take this data outside the app" need and the report that is most often shared with non-app stakeholders (owners, accountants). It also validates the shared print/export mechanism that the other three reports reuse.

**Independent Test**: Open the Salary Report, apply a date range and any available filter, then use Print, Export PDF, and Export Excel in turn. Each output can be verified on its own — opened, visually checked, and confirmed to match the filtered on-screen data — without any other report needing to exist.

**Acceptance Scenarios**:

1. **Given** the Salary Report is filtered to a specific date range, **When** the admin clicks "Export PDF", **Then** a PDF is generated containing only the filtered rows (teacher name, sessions paid, session rate, total salary, payment status), the applied date range, the report totals, the company logo, and the date/time the document was generated.
2. **Given** the Salary Report is filtered and sorted by a column, **When** the admin clicks "Export Excel", **Then** an .xlsx file downloads containing the rows in the same filtered order and the same columns shown on screen, plus a totals row.
3. **Given** the Salary Report is open, **When** the admin clicks "Print", **Then** a print-preview/print dialog opens showing a formatted, paginated version of the currently filtered report with the company logo and generation timestamp, suitable for physical printing.
4. **Given** the Salary Report has zero matching rows for the current filters, **When** the admin attempts to print or export, **Then** the system produces a clearly labeled empty report (not an error) showing the filters applied and zero totals.

---

### User Story 2 - Print and export the Expenses Report (Priority: P2)

An administrator tracking operating costs wants to export or print the Expenses Report to reconcile against receipts or share with an accountant.

**Why this priority**: Expenses are reviewed less frequently than salaries but are still a core financial report; it reuses the same export mechanism built for User Story 1, so it is lower risk/lower cost once P1 exists.

**Independent Test**: Open the Expenses Report, filter by category and date range, and export to PDF and Excel independently of any other report.

**Acceptance Scenarios**:

1. **Given** the Expenses Report is filtered by category and date range, **When** the admin exports to PDF, **Then** the PDF shows expense name, category, amount, paid by, date, and notes for each matching row, plus the total amount, the filters applied, the logo, and the generation timestamp.
2. **Given** the Expenses Report is exported to Excel, **When** the file is opened, **Then** each visible column and the totals row are present and match the on-screen filtered data.

---

### User Story 3 - Print a complete Child Report (Priority: P2)

A staff member or administrator needs a full printable/exportable record for one child — for a parent meeting, a transfer, or an audit — combining personal details, attendance, teachers, services, and financial history into a single document.

**Why this priority**: This is the most complex report (multiple data sources combined) and is used less often than the recurring salary/expense reports, but it delivers high value per use (e.g., regulatory or parent requests) — hence P2, after the simpler recurring reports are proven.

**Independent Test**: Open a single child's profile, generate the Child Report, and verify print/PDF/Excel output contains every required section for that child, independent of any other report type.

**Acceptance Scenarios**:

1. **Given** a child with attendance history, assigned teacher(s), enrolled services, and payment history, **When** staff generate the Child Report as PDF, **Then** the PDF includes: personal information, full attendance history, assigned teacher(s), enrolled services, computed attendance percentage, payment history, and notes — with the company logo and generation timestamp.
2. **Given** the same child report is exported to Excel, **When** the file is opened, **Then** the same data is present, organized so each section (attendance, payments, etc.) is readable as its own table or clearly labeled block.
3. **Given** a child has no attendance records yet, **When** the Child Report is generated, **Then** the attendance section renders as empty (not an error) and the attendance percentage shows as not applicable/0%.

---

### User Story 4 - Print and export the Financial Transactions Report (Priority: P3)

An administrator wants a full ledger of a child's money movements (payments and any refunds/discounts/adjustments once available) to explain a balance or resolve a billing dispute.

**Why this priority**: This report overlaps significantly with the payments data already surfaced in the Child Report (User Story 3); it is prioritized last because it depends on clarifying which transaction types actually exist to report on (see Assumptions).

**Independent Test**: Open the Financial Transactions Report for a child, export to PDF/Excel, and verify all recorded transaction types and the outstanding balance appear, independent of the other reports.

**Acceptance Scenarios**:

1. **Given** a child with recorded payments, **When** the admin exports the Financial Transactions Report to PDF, **Then** the PDF lists each transaction with its type, date, and amount, plus the resulting outstanding balance, the logo, and the generation timestamp.
2. **Given** the report is exported to Excel, **When** opened, **Then** the same transaction rows and the outstanding balance total are present.

---

### User Story 5 - Attendance is locked after saving and cannot be silently changed (Priority: P1)

An employee records today's attendance and saves it. From that point on, neither that employee nor any other employee can directly overwrite the saved attendance values — protecting the payroll and reporting data that depends on it.

**Why this priority**: This is a data-integrity/security foundation — without it, the rest of the approval workflow has nothing to protect. It must ship before or together with the request/approval flow (User Story 6) to have any effect.

**Independent Test**: Save attendance for a session as an employee, then attempt to change a status directly as the same or another employee; verify the direct edit is blocked while the record remains fully visible.

**Acceptance Scenarios**:

1. **Given** an employee has saved attendance for a session, **When** any employee (non-admin) tries to modify a previously-saved attendance record for that session, **Then** the system blocks the direct edit and instead directs them to submit an Edit Request.
2. **Given** attendance has been saved and locked, **When** anyone views that session's attendance, **Then** the previously saved values remain visible and unchanged (no data loss, no silent modification).
3. **Given** an administrator wants to correct attendance, **When** they open the locked attendance, **Then** they can make the correction directly, since admins already hold the approval authority the employee workflow exists to route through (see Assumptions).

---

### User Story 6 - Employee submits an attendance Edit Request and admin approves or rejects it (Priority: P1)

An employee realizes a saved attendance record was wrong (e.g., marked a child absent instead of present) and needs it corrected. They submit an Edit Request explaining the change and why; an administrator reviews it and approves or rejects it, with payroll automatically kept consistent.

**Why this priority**: This is the primary corrective path the whole feature exists to provide — without it, User Story 5's lock has no legitimate way to be resolved, so it ships together with/immediately after it as P1.

**Independent Test**: As an employee, submit an edit request against a locked attendance record with a reason; as an admin, approve one request and reject another; verify the approved one updates attendance and payment while the rejected one changes nothing, all independent of the export/print features.

**Acceptance Scenarios**:

1. **Given** a locked attendance record, **When** an employee submits an Edit Request with the child, teacher, date, requested new values, and a reason, **Then** the request is stored with status "Pending", the original attendance values are preserved unchanged, and the administrator is notified.
2. **Given** a Pending Edit Request, **When** an administrator approves it, **Then** the attendance record is updated to the requested values, any teacher payment already generated from the old values is voided, a new payment is generated from the new values if applicable, the request status becomes "Approved", and the requesting employee is notified.
3. **Given** a Pending Edit Request, **When** an administrator rejects it, **Then** the attendance record and any related payment remain completely unchanged, the request status becomes "Rejected", and the requesting employee is notified with visibility into the rejection.
4. **Given** an approved or rejected Edit Request, **When** anyone with access views the attendance record's history, **Then** they can see the full audit trail: old value, new value, who changed it, who approved it, when, and why — and the original record is never deleted, only superseded.
5. **Given** an employee without admin rights, **When** they attempt to approve or reject any Edit Request (including their own), **Then** the system denies the action.

### Edge Cases

- What happens when an employee submits a second Edit Request for the same attendance record while an earlier request for it is still Pending? System MUST prevent duplicate concurrent pending requests for the same child/date/teacher combination and surface the existing pending request instead.
- What happens when an approved Edit Request changes attendance in a way that removes eligibility for a teacher payment that was already paid out (not just generated)? System MUST still void the original payment record and generate a corrected one, and the resulting balance/adjustment must be visible in reporting — actual money-recovery process is out of scope for this feature.
- What happens when a Print/Export action is attempted for a report with a date range spanning no data at all? System MUST render a valid, clearly-labeled empty document rather than failing.
- What happens when the company logo is not configured in Settings? System MUST still produce the Print/PDF output, omitting the logo placeholder gracefully rather than failing.
- What happens when an Edit Request references a child, teacher, or session that has since been deleted? System MUST still allow the admin to view and reject it (since the underlying record it would apply to no longer exists), and MUST prevent approval in this state.
- What happens if two admins act on the same Pending Edit Request at nearly the same time? System MUST honor only the first decision and prevent the request from being approved and rejected simultaneously.

## Requirements *(mandatory)*

### Functional Requirements

**Printing & Export**

- **FR-001**: System MUST provide Print, Export PDF, and Export Excel actions on the Salary Report, Expenses Report, Child Report, and Financial Transactions Report.
- **FR-002**: System MUST provide an optional Export CSV action alongside PDF/Excel on those same four reports.
- **FR-003**: Every export or print output MUST reflect the filters, sorting, and date range currently applied on screen at the time of generation — never unfiltered/raw data.
- **FR-004**: Every export or print output MUST include the report's totals (matching the totals shown on screen), the organization's configured logo, and the exact date and time the document was generated.
- **FR-005**: The Salary Report output MUST include, per row: teacher name, sessions paid, session rate, total salary, payment status, and the date range covered.
- **FR-006**: The Expenses Report output MUST include, per row: expense name, category, amount, paid by, date, and notes.
- **FR-007**: The Child Report output MUST include: personal information, attendance history, assigned teacher(s), enrolled services, computed attendance percentage, payment history, and notes for the selected child.
- **FR-008**: The Financial Transactions Report output MUST include every recorded money-movement type available in the system for the selected child (at minimum: payments) and the resulting outstanding balance.
- **FR-009**: System MUST produce a valid, clearly labeled document (not an error) when a print/export is requested for a report with zero matching rows.
- **FR-010**: System MUST produce Arabic (RTL) and English (LTR) print/export output matching the report's current display language.

**Attendance Locking**

- **FR-011**: System MUST lock an attendance record against direct edits by non-admin users immediately after it is first saved.
- **FR-012**: System MUST allow administrators to edit attendance directly without going through the Edit Request workflow.
- **FR-013**: System MUST prevent any user from permanently deleting a saved attendance record's history; superseding values must be layered on top via the approval workflow, not by overwriting or removing the record.

**Attendance Edit Requests**

- **FR-014**: System MUST allow an employee to submit an Edit Request against a locked attendance record, capturing: child, teacher, attendance date, original values, requested changes, reason for change, requesting user, and request date/time.
- **FR-015**: System MUST assign every new Edit Request a status of "Pending" and MUST prevent a second concurrent Pending request from being created for the same child/teacher/attendance date.
- **FR-016**: System MUST restrict approval and rejection of Edit Requests to administrator users only.
- **FR-017**: When an Edit Request is approved, system MUST update the attendance record to the requested values, recalculate any affected teacher payment (voiding the previous payment and generating a new one when the recalculation produces a different result), and set the request status to "Approved".
- **FR-018**: When an Edit Request is rejected, system MUST leave the attendance record and any related payment completely unchanged and set the request status to "Rejected".
- **FR-019**: System MUST notify the administrator(s) when a new Edit Request is submitted.
- **FR-020**: System MUST notify the requesting employee when their Edit Request is approved or rejected.

**Audit Log**

- **FR-021**: System MUST record an audit log entry for every attendance modification (whether made directly by an admin or via an approved Edit Request), capturing: old value, new value, who made the change, who approved it (if applicable), date/time, and reason.
- **FR-022**: System MUST make the audit trail for a given attendance record viewable by administrators, showing its full history of changes in chronological order.

### Key Entities

- **Print/Export Job**: A one-time, on-demand generation of a report in a given output form (print, PDF, Excel, or CSV) from a report's currently filtered/sorted view; not persisted, but its output MUST always carry the filters, totals, logo, and generation timestamp that produced it.
- **Attendance Record**: The existing per-child, per-session attendance entry (status, excuse notes, teacher, teacher status); gains a locked state after first save, and its values can only change thereafter through an approved Edit Request or a direct admin edit.
- **Attendance Edit Request**: A new entity representing a proposed change to one Attendance Record — child, teacher, attendance date, original values (snapshot), requested changes, reason, requesting user, request date/time, and status (Pending/Approved/Rejected), plus who decided it and when.
- **Attendance Audit Log Entry**: A new, append-only entity recording one historical change to an Attendance Record — old value, new value, changed-by user, approved-by user (if applicable), timestamp, and reason. Never deleted or overwritten.
- **Notification**: A message directed at a specific user (admin or employee) informing them of an Edit Request submission or decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from an open report to a downloaded PDF or Excel file, or a completed print job, in 3 clicks or fewer from the report screen.
- **SC-002**: 100% of exported/printed documents across all four reports display the same totals and row counts as the on-screen filtered view at the moment of export, verified by spot-check comparison.
- **SC-003**: 100% of exported/printed documents include the generation date/time and the organization's logo (when configured), with zero reports missing these elements.
- **SC-004**: After the attendance lock ships, 0% of attendance changes made by non-admin employees bypass the Edit Request workflow (all such changes are traceable to an approved request).
- **SC-005**: 100% of approved Edit Requests result in a teacher payment that is consistent with the new attendance values within the same working session (no stale/duplicate payments left active).
- **SC-006**: Administrators can find the full change history (old value, new value, who, when, why) for any attendance record in 2 actions or fewer from that record's view.
- **SC-007**: 100% of Edit Request submissions and decisions generate a notification to the correct recipient (admin on submission, employee on decision) with no missed notifications during normal operation.

## Assumptions

- Administrators are exempt from the Edit Request workflow: an admin may correct locked attendance directly, because they already hold the authority that the employee workflow exists to route through for approval. Every such direct admin edit still produces an audit log entry (FR-021) as if it had gone through the workflow, and admin edits also trigger the same payment recalculation (void/regenerate) as approved requests.
- "Notify" means an in-app notification visible to the recipient within the application (e.g., a notifications panel/badge); the app has no existing email/SMS integration, so no channel beyond in-app is assumed for v1.
- The Financial Transactions Report will surface whatever money-movement types already exist in the system today (payments) plus any additional transaction types (refunds, discounts, adjustments) as and when those features exist elsewhere in the app; this feature does not itself introduce new ways to create refunds, discounts, or adjustments — it only reports on them.
- "Invoices" referenced in the source material are treated as the existing payment/receipt records already tracked per child, not a new, separate invoicing feature.
- Print/export scope for this feature is limited to the four named reports (Salary, Expenses, Child, Financial Transactions). Other list/table pages in the system (e.g., Children list, Employees list, Sessions list) are out of scope for this feature and may be addressed in a future iteration.
- CSV export is treated as optional/lower-priority per the source material and may ship after PDF/Excel for each report without blocking the feature's completion.
- Exported files use the organization's already-configured branding (logo, name) from existing Settings; no new branding configuration is introduced by this feature.
