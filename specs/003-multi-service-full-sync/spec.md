# Feature Specification: Multi-Service Enrollment & Full-Database Sync

**Feature Branch**: `003-multi-service-full-sync`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Child can choose more than one service. The MongoDB sync push should make the whole SQL system database synced — when I push (or auto-sync), every change must propagate to all SQL databases on every other device so all devices hold the complete data set."

## Clarifications

### Session 2026-06-08

- Q: When a device syncs, how should the complete data set be reconciled across all devices? → A: Per-record merge — each record reconciled by version/last-modified time with most-recent-change-wins on the same record, and deletions tracked via tombstones, so concurrent edits to different records are all preserved.
- Q: When an admin removes a service from a child, what should happen to that enrollment? → A: Hard delete — the enrollment row is removed and a tombstone propagates the deletion to other devices; previously recorded payment lines for that service are retained in history.
- Q: How should a multi-service child's overall monthly payment status be displayed when their services differ? → A: Derived roll-up — "paid" only when all service lines are paid, "partial" when some are paid/owed, "unpaid" when none are paid; each service line still keeps its own status.
- Q: Which of the currently ignored workbook sheets (📊 داشبورد، ⚙️ الإعدادات، 📄 كشف حساب، 🎯 تخطيط التارجت) should the importer load as stored records? → A: All four — every sheet in Nursery_V4_Final_5.xlsx is imported and persisted as records, including Dashboard and Account Statement.
- Q: Where should Target Planning (🎯 تخطيط التارجت) data be stored on import? → A: The existing targets table/module (targetIPC), reusing its schema rather than a new entity.
- Q: Should the newly imported data (settings, targets, dashboard, account statement) participate in the full-database sync? → A: Yes — added to the synced entity set so it pushes/pulls, resolves conflicts, and propagates deletions via tombstones like every other entity.
- Q: What defines a "successful" import of Nursery_V4_Final_5.xlsx for backup/restore acceptance? → A: Import completes with zero row errors across all sheets, and a local backup→restore round-trips every table identically.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enroll a Child in Multiple Services (Priority: P1)

A center administrator registers or edits a child who attends more than one service at the center (for example, both the nursery and individual sessions). Instead of picking a single service, they select every service that applies, and for each selected service they set the billing unit, quantity, and price. The monthly payment sheet then bills the child once per enrolled service, and the dashboard, statements, and exports reflect the combined amounts.

**Why this priority**: Children attending multiple services cannot be billed correctly today because each child is limited to one service. This blocks accurate invoicing and revenue reporting for those children, which is the center's core financial workflow.

**Independent Test**: Can be fully tested by adding a child, assigning two or more services each with its own unit and price, opening the month's payment sheet, and confirming a separate billed line is generated for each service with correct per-service and combined totals.

**Acceptance Scenarios**:

1. **Given** the child form, **When** an administrator selects two or more services and sets a unit and price for each, **Then** the child is saved with all selected services and their per-service billing details.
2. **Given** a child enrolled in multiple services, **When** the payment sheet for a month is opened, **Then** a separate payment line is generated for each of that child's services with its own unit, quantity, price, and total.
3. **Given** a child enrolled in multiple services, **When** a staff member records payments, **Then** each service line tracks its own paid amount, balance, and status, and the child's combined total reflects the sum across services.
4. **Given** an existing child currently enrolled in one service, **When** an administrator adds a second service and saves, **Then** future payment sheets include both services while previously recorded months are unchanged.
5. **Given** a child enrolled in multiple services, **When** an administrator removes one service, **Then** that enrollment is deleted and stops generating new payment lines, the deletion propagates to other devices on sync, and already recorded payments for it remain in history.
6. **Given** a child enrolled in multiple services, **When** their account statement is opened, **Then** the breakdown shows each service per month and the correct combined totals.

---

### User Story 2 - Full-Database Synchronization Across Devices (Priority: P1)

An administrator works on more than one device. When they trigger a sync (manually or automatically) on one device, the system reconciles the entire local database with the cloud so that every device ends up holding the complete, up-to-date data set — all children, services, payments, salaries, expenses, settings, and users — not just a partial subset. After syncing on a second device, that device reflects every change made on the first.

**Why this priority**: The current sync moves records partially and does not guarantee that another device receives the whole data set, so devices drift out of agreement. A center relying on multiple devices needs every device to converge on identical, complete data to trust its financial figures.

**Independent Test**: Can be tested by making changes on Device A (add a child, record payments, change a setting), syncing, then syncing Device B and confirming Device B's database contains every change from Device A across all data types.

**Acceptance Scenarios**:

1. **Given** local changes across multiple data types on Device A, **When** the administrator syncs, **Then** all of those changes are uploaded to the cloud, not only a subset.
2. **Given** the cloud holds changes made on Device A, **When** Device B syncs, **Then** Device B's local database is updated to include every one of those changes across all data types.
3. **Given** two devices that have both synced, **When** their databases are compared, **Then** they contain the same complete set of records for every data type.
4. **Given** a record changed on both devices since the last sync, **When** a sync runs, **Then** the configured conflict strategy (most-recent-change-wins by default) deterministically decides the surviving version on every device.
5. **Given** a record deleted on one device, **When** another device syncs, **Then** that deletion is reflected on the other device rather than reappearing.
6. **Given** automatic sync is enabled, **When** the configured interval elapses, **Then** a full reconciliation runs without manual action and reports its outcome.
7. **Given** the cloud is unreachable, **When** a sync is attempted, **Then** it fails gracefully with a status message and the local data is left intact.

---

### Edge Cases

- What happens when a child has overlapping or duplicate selections of the same service? (Each service may be enrolled at most once per child; a duplicate selection is rejected or merged.)
- What happens when a child is enrolled in multiple services and one service is later deactivated at the center level? (Existing enrollment and history remain; no new lines are generated for the inactive service.)
- How is a child's combined status shown when one service is fully paid and another is unpaid? (The child shows a derived roll-up: "paid" only when all service lines are paid, "partial" when some are paid/owed, "unpaid" when none are paid; each service line keeps its own status.)
- What happens when the same record is edited on two offline devices and both sync later? (The configured conflict strategy resolves to a single surviving version on all devices.)
- What happens when a large local database is synced for the first time to a fresh device? (The full data set transfers and the device converges to the complete state; progress/outcome is reported.)
- How does the system handle a sync interrupted partway (connection drops mid-transfer)? (The data set converges on the next successful sync; no partial state is treated as final.)
- What happens when a record exists in the cloud but its referenced parent (e.g., a service line whose child) has not yet arrived locally? (Relationships are preserved so dependent records are applied consistently, not orphaned.)
- What happens when an imported Dashboard or Account Statement row (a stored aggregate) disagrees with values recomputed from children/payments? (The imported rows are persisted and synced as-is; recomputed views remain the live source for display, and the stored import is treated as a snapshot, not overriding live calculations.)
- What happens when the workbook contains a sheet or row that cannot be mapped to a table? (The import surfaces a specific reason for that row/sheet rather than silently skipping it, so the zero-row-error target is verifiable.)

## Requirements *(mandatory)*

### Functional Requirements

**Multi-Service Enrollment**

- **FR-001**: System MUST allow a child to be enrolled in one or more services at the same time.
- **FR-002**: System MUST allow each of a child's enrolled services to carry its own billing unit, quantity basis, and price, independent of the child's other services.
- **FR-003**: System MUST prevent the same service from being enrolled more than once for a single child.
- **FR-004**: System MUST generate a distinct payment line per enrolled service for each active child when a month's payment sheet is created.
- **FR-005**: System MUST track paid amount, balance, and status independently for each per-service payment line.
- **FR-006**: System MUST present a child's combined monthly total and combined balance as the sum across all of that child's service lines.
- **FR-006a**: System MUST derive a child's overall monthly status as a roll-up of its service-line statuses — "paid" only when every service line is paid, "partial" when some lines are paid or owed, and "unpaid" when no line is paid — while each service line retains its own independent status.
- **FR-007**: System MUST allow administrators to add a service to, or remove a service from, an existing child. Removing a service MUST hard-delete that enrollment (propagating the deletion to other devices via a tombstone) while retaining payment records already recorded for it in prior months.
- **FR-008**: System MUST include every enrolled service per month in a child's account statement and reflect the combined totals.
- **FR-009**: System MUST reflect multi-service children correctly in dashboard revenue-by-service figures, attributing each service line to its own service.
- **FR-010**: System MUST include all of a child's services in exports (full export, single month, and child statement).
- **FR-011**: System MUST allow searching and filtering children by service such that a child appears under every service they are enrolled in.

**Full-Database Synchronization**

- **FR-012**: System MUST, on a sync, reconcile the entire local database across all data types (children, service enrollments, payments, salaries and salary payments, expenses, settings, users, targets, dashboard records, and account-statement records) rather than a partial subset.
- **FR-013**: System MUST upload all local changes since the last successful sync to the cloud when an administrator pushes or an automatic sync runs.
- **FR-014**: System MUST apply all cloud changes to the local database when a device syncs, so the device converges to the complete, current data set.
- **FR-015**: System MUST ensure that any two devices which have each completed a sync converge to the same complete set of records for every data type.
- **FR-015a**: System MUST reconcile at the record level (per-record merge), comparing each record by its version/last-modified marker so that concurrent changes made to *different* records on different devices are all preserved after sync.
- **FR-016**: System MUST propagate deletions across devices using tombstones so a record deleted on one device does not reappear on another after sync.
- **FR-017**: System MUST resolve conflicting concurrent changes to the *same* record using a configurable strategy, defaulting to most-recent-change-wins, and apply the result deterministically on every device.
- **FR-018**: System MUST preserve referential relationships during sync so dependent records (e.g., a child's service lines and payments) remain consistent and are not orphaned.
- **FR-019**: System MUST support automatic synchronization on a configurable interval that performs the same full reconciliation as a manual sync.
- **FR-020**: System MUST present sync status including connection state, last successful sync time, and pending/applied counts.
- **FR-021**: System MUST fail synchronization gracefully when the cloud is unreachable, leaving local data intact and reporting the failure.
- **FR-022**: System MUST restrict synchronization controls to administrators.

**Full-Workbook Import & Backup Round-Trip**

- **FR-023**: System MUST import **every** sheet of the reference workbook `Nursery_V4_Final_5.xlsx`, including the sheets previously ignored — 📊 داشبورد (Dashboard), ⚙️ الإعدادات (Settings), 📄 كشف حساب (Account Statement), and 🎯 تخطيط التارجت (Target Planning) — and persist each as stored records rather than skipping them.
- **FR-024**: System MUST import Target Planning (🎯 تخطيط التارجت) rows into the existing targets table/module, reusing its schema and validation rather than introducing a parallel structure.
- **FR-025**: System MUST import Settings (⚙️ الإعدادات) into the settings store, and Dashboard (📊 داشبورد) and Account Statement (📄 كشف حساب) into dedicated storage so their imported rows are retained.
- **FR-026**: System MUST complete an import of `Nursery_V4_Final_5.xlsx` with **zero row errors** across all sheets; any row that cannot be applied MUST surface a specific, actionable reason rather than being silently dropped.
- **FR-027**: System MUST include the newly imported data types (settings, targets, dashboard, account statement) in the full-database synchronization (FR-012) so they push, pull, resolve conflicts, and propagate deletions via tombstones identically to the other entities.
- **FR-028**: System MUST ensure a local backup captures all data tables and that restoring that backup reproduces every table identically (a verifiable round-trip), with the full system — including the newly imported sheets — usable after restore.

### Key Entities *(include if feature involves data)*

- **Child**: An enrolled child (as defined in the base system) now associated with one or more service enrollments instead of a single service. Core attributes unchanged: name, guardian, contact details, national ID, registration date, notes, active flag.
- **Service Enrollment**: A link between a child and a single service the child attends, carrying the per-service billing details (service, unit, quantity basis, price, active flag). A child has one or more of these; each is unique per service for that child.
- **Payment Line**: A monthly billing record now scoped to a child's specific service enrollment rather than the child as a whole. Attributes: associated child, associated service enrollment, month, year, unit, quantity, price, total, paid, balance, status. The child's monthly figures aggregate these lines.
- **Sync State**: Per-record synchronization metadata used to drive full reconciliation: change/version marker, last-modified time, deletion marker, and applied/pending status. Spans every synced data type.
- **Target Plan**: A target-planning record imported from the 🎯 تخطيط التارجت sheet into the existing targets table; carries the center's planning/target figures and is service- and period-aware as defined by the existing targets module.
- **Settings Record**: A configuration key/value imported from the ⚙️ الإعدادات sheet into the settings store (e.g., pricing defaults), synced across devices.
- **Dashboard Record / Account-Statement Record**: Imported rows from the 📊 داشبورد and 📄 كشف حساب sheets, persisted as stored records and included in sync and backup round-trips.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can enroll a child in at least two services and the month's payment sheet shows one correctly priced line per service for that child.
- **SC-002**: For a multi-service child, the displayed combined monthly total equals the exact sum of that child's per-service line totals in 100% of cases.
- **SC-003**: Removing a service from a child stops new billing for that service while every previously recorded payment for it remains visible in history.
- **SC-004**: After Device A syncs and then Device B syncs, Device B contains every change made on Device A across all data types, verified by comparing record counts and contents.
- **SC-005**: Two devices that have each completed a sync hold identical record counts for every data type, verifiable by comparison.
- **SC-006**: A record deleted on one device is absent on every other device after they sync, in 100% of cases.
- **SC-007**: A first-time sync of a database containing on the order of 100 children with multiple services completes and leaves the receiving device with the complete data set, with its outcome reported to the user.
- **SC-008**: When the cloud is unreachable, an attempted sync reports a failure and leaves local data unchanged in 100% of cases.
- **SC-009**: Importing `Nursery_V4_Final_5.xlsx` completes with zero row errors across all sheets — including 📊 داشبورد، ⚙️ الإعدادات، 📄 كشف حساب، 🎯 تخطيط التارجت — and every sheet's data is persisted.
- **SC-010**: After importing the workbook, creating a local backup and then restoring it yields identical record counts and contents for every table (verified round-trip), and the full system is usable afterward.
- **SC-011**: Imported settings, targets, dashboard, and account-statement data propagate to other devices via push/pull and converge identically, the same as children and payments.

## Assumptions

- This feature extends the existing Nursery & Autism Center Management System (feature 001); all base behaviors not changed here continue to apply.
- The local data store remains an SQL database on each device (as in the base system), and the cloud reconciliation point remains the existing MongoDB-based cloud sync target.
- "All devices" refers to devices configured by the administrator against the same cloud sync target; provisioning the cloud account and connecting each device are administrator responsibilities, as in the base system.
- Per-service pricing defaults follow the existing settings-driven pricing, with per-enrollment overrides allowed, mirroring the base system's single-service behavior.
- Existing single-service children are treated as children with exactly one service enrollment, so historical data remains valid without manual rework.
- The default conflict-resolution strategy is most-recent-change-wins, consistent with the base system, and remains configurable.
- Sync is an administrator-only, eventually-consistent reconciliation; real-time simultaneous multi-user editing of one database is out of scope.

## Dependencies

- The existing cloud sync target (MongoDB) and an administrator-provided connection for each participating device.
- The existing local SQL database, payments, statements, dashboard, and export modules of the base system, which this feature modifies to be service-aware.
- A reliable last-modified/version and deletion marker on synced records to drive deterministic full reconciliation.
