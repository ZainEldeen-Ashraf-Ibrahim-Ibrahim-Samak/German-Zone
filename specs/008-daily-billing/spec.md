# Feature Specification: Daily Billing

**Feature Branch**: `008-daily-billing`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "make new daily pilling like monthly and need to be sync in mongo for push and pull"

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are PRIORITIZED as journeys ordered by importance.
  Each story is INDEPENDENTLY TESTABLE and delivers standalone value.
-->

### User Story 1 — Generate Daily Bills for Active Children (Priority: P1)

A nursery administrator opens the Daily Billing page, selects the current day (date, month, year), and clicks "Generate Daily Bills." The system creates one billing record per active child, per enrolled service, for that specific day. The page then displays the list of children with their day's charges and payment status.

**Why this priority**: Without the ability to generate and view daily billing records, the entire feature has no foundation. This is the core read/write loop that every other story depends on.

**Independent Test**: Can be fully tested by navigating to the Daily Billing page, selecting a date, clicking "Generate," and verifying that one row per child-service appears in the table with the correct price and an "Unpaid" status.

**Acceptance Scenarios**:

1. **Given** there are active children enrolled with daily-rated services (`unit = يوم`), **When** the admin selects a specific date and clicks "Generate Daily Bills," **Then** one billing record per active child-service is created for that date and appears in the list.
2. **Given** a billing record already exists for that child/service/date, **When** the admin clicks "Generate Daily Bills" again, **Then** no duplicate record is created and the existing record is preserved unchanged.
3. **Given** a child registered on a date after the selected billing date, **When** the admin generates bills for the earlier date, **Then** no billing record is created for that child on that date.
4. **Given** there are no active children, **When** the admin clicks "Generate Daily Bills," **Then** the system shows a friendly message indicating that no records were generated.

---

### User Story 2 — Record and Track Daily Payments (Priority: P2)

A nursery staff member opens the Daily Billing page for a specific date, finds a child's record, and marks it as paid (fully or partially). The summary totals update immediately to reflect the collected and outstanding amounts for that day.

**Why this priority**: Billing records are only useful if staff can act on them by collecting and recording payments in real time.

**Independent Test**: Can be fully tested by generating bills for a date, finding a child's row, entering a paid amount, saving, and verifying the status changes from "Unpaid" to "Paid" or "Partial" and the summary cards update.

**Acceptance Scenarios**:

1. **Given** a daily billing record with status "Unpaid," **When** the staff member enters the full amount in the "Paid" field and saves, **Then** the record status changes to "Paid" and the balance becomes zero.
2. **Given** a daily billing record with status "Unpaid," **When** the staff member enters a partial amount and saves, **Then** the status changes to "Partial" and the balance shows the remaining amount.
3. **Given** a daily billing record, **When** the admin changes the quantity and saves, **Then** the total recalculates correctly and the status updates.
4. **Given** one or more selected records, **When** the staff member uses "Bulk Pay," **Then** all selected records are marked as "Paid" in a single action.

---

### User Story 3 — Search, Filter, and Navigate Daily Bills (Priority: P3)

A nursery administrator uses the Daily Billing page to navigate between different dates, filter by payment status, and search for a specific child by name or guardian phone number — mirroring the functionality already available in the Monthly Billing page.

**Why this priority**: With potentially many children billed per day, discoverability is essential for efficient daily operations.

**Independent Test**: Can be fully tested by generating records for multiple children, then using the date picker, name search, phone search, and status filters and verifying the displayed list narrows accordingly.

**Acceptance Scenarios**:

1. **Given** billing records for multiple children on a date, **When** the admin types a child's name in the search box, **Then** only that child's row is shown.
2. **Given** billing records with mixed statuses, **When** the admin selects the "Unpaid" filter, **Then** only unpaid records are displayed.
3. **Given** the admin is viewing bills for one date, **When** the admin picks a different date using the date picker, **Then** the list refreshes and shows the bills for the newly selected date.

---

### User Story 4 — Sync Daily Bills to and from MongoDB (Priority: P4)

An admin triggers a full sync (push and/or pull) from the Sync Settings page. The system pushes all unsynced daily billing records to MongoDB and pulls any cloud-side records not yet present locally, using the same conflict resolution rules as all other synced entities.

**Why this priority**: The MongoDB sync is a cross-cutting concern that protects data against device loss. It is important but depends on the core billing entity being established first (P1–P3).

**Independent Test**: Can be fully tested by creating a daily billing record on one machine, pushing to MongoDB, then pulling on a second machine and verifying the record appears with the correct data.

**Acceptance Scenarios**:

1. **Given** newly created or updated daily billing records (synced = 0), **When** the admin triggers "Push," **Then** all unsynced records are sent to the `sync_daily_payments` MongoDB collection and marked synced locally.
2. **Given** a daily billing record exists in MongoDB but not locally, **When** the admin triggers "Pull," **Then** the record is inserted into the local `daily_payments` table and marked as synced.
3. **Given** the same daily billing record exists both locally and in MongoDB with different timestamps, **When** the admin triggers "Pull," **Then** the record with the most recent `updated_at` timestamp wins (cloud overwrites local if cloud is newer, local is kept if local is newer).
4. **Given** a daily billing record was deleted locally and a tombstone was created, **When** the admin triggers "Push," **Then** the tombstone is synced and the matching cloud record is removed on a subsequent pull.

---

### Edge Cases

- What happens when the admin selects a future date for billing generation? (System should allow it — future-dated pre-billing is a valid nursery use case.)
- How does the system handle a child whose enrollment has no daily-rated services (e.g., only monthly or session-based)? (That child should be skipped during daily bill generation.)
- What happens if the device goes offline mid-push while syncing daily billing records? (Records already pushed are marked synced; un-pushed records remain unsynced and will be retried on the next push.)
- What happens if the admin generates daily bills and then deactivates a child? (Existing daily billing records for the inactive child remain and can still be marked paid; future generation will skip the inactive child.)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a "Daily Billing" section accessible from the main navigation, parallel to the existing "Monthly Billing" section.
- **FR-002**: The system MUST allow the admin to select a specific date (day, month, year) for which to view and generate daily billing records.
- **FR-003**: The system MUST generate one billing record per active child, per enrolled service, for the selected date — using the service's daily price — unless a record already exists for that child/service/date combination.
- **FR-004**: Each daily billing record MUST contain: child reference, service reference, billing date (day, month, year), service name, unit, quantity (defaulting to 1 for daily-rate services), price per unit, total, amount paid, balance, payment status, and optional notes.
- **FR-005**: The system MUST calculate and display daily summary totals: total invoiced, total collected, and outstanding balance for the selected date.
- **FR-006**: Staff MUST be able to update the paid amount and notes on any individual daily billing record; admins MUST additionally be able to change the quantity.
- **FR-007**: The system MUST provide a bulk-pay action that marks all selected daily billing records as fully paid in a single operation.
- **FR-008**: The system MUST provide name and phone search filters, and a status filter (All / Paid / Partial / Unpaid), consistent with the Monthly Billing page.
- **FR-009**: Admin users MUST be able to delete selected daily billing records or all records for the selected date, with a confirmation prompt before any destructive action.
- **FR-010**: The `daily_payments` table MUST include a `synced` flag (0 = unsynced, 1 = synced) on every record to support bidirectional MongoDB sync.
- **FR-011**: The sync system MUST include `daily_payments` as a registered entity so that push and pull operations cover daily billing records alongside all other synced tables.
- **FR-012**: The MongoDB schema for `sync_daily_payments` MUST mirror all columns of the local `daily_payments` SQLite table, using the record's integer `id` as the MongoDB document identifier.
- **FR-013**: Conflict resolution during pull MUST follow the existing rule: the record with the most recent `updated_at` timestamp wins; on a tie, the higher `id` wins.

### Key Entities

- **DailyPayment**: Represents a single day's billing charge for one child–service pair. Key attributes: `id`, `child_id`, `service_id`, `billing_date` (ISO date string), `month`, `year`, `service` (name), `unit`, `quantity`, `price`, `total`, `paid`, `balance`, `status` (paid / partial / unpaid), `notes`, `payment_method_id`, `payment_method_name`, `created_at`, `updated_at`, `synced`. Unique constraint on `(child_id, service_id, billing_date)`.
- **DailyPaymentSummary**: Derived view per selected date: total invoiced, total collected, total outstanding (arrears).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can generate all daily billing records for a given date in under 3 seconds for a nursery with up to 200 active children.
- **SC-002**: Staff can record a payment update on a daily billing record in under 2 clicks from the daily billing list.
- **SC-003**: All daily billing records created or updated since the last sync are pushed to the cloud in under 30 seconds during a normal push operation.
- **SC-004**: A daily billing record created on one device appears on a second device within one full push–pull cycle, with data integrity preserved (no duplicates, correct amounts).
- **SC-005**: 100% of daily billing records that fail a push due to connectivity are retried automatically on the next push without data loss.
- **SC-006**: The daily billing page displays the correct date's records immediately after the admin navigates to a different date, with no stale data visible.

---

## Assumptions

- Daily billing will initially target children enrolled in services with `unit = يوم` (daily rate). Children enrolled exclusively in monthly or session-based services are excluded from daily bill generation automatically.
- The daily billing page will re-use the same UI component library, design language, and layout conventions already established in the Monthly Billing page.
- The existing MongoDB sync infrastructure (connection management, push/pull handlers, conflict resolution, tombstones) will be extended — not replaced — to accommodate daily billing records.
- Payment method tracking on daily billing records follows the same model as monthly billing (optional method name stored on the record, updated on payment).
- Installment/partial-payment transactions (the `payment_transactions` table) are out of scope for daily billing in the initial version; partial payments are recorded as a single "paid" amount directly on the daily billing record.
- Print and export (PDF/XLSX) for daily billing is out of scope for this feature and will be addressed in a future spec if needed.
- Role-based access control mirrors monthly billing: staff can record payments; only admins can change quantities or delete records.
