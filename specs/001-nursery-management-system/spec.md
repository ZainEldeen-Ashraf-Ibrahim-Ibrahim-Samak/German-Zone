# Feature Specification: Nursery & Autism Center Management System

**Feature Branch**: `001-nursery-management-system`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Nursery & Autism Center Management System — a bilingual (Arabic RTL / English LTR) desktop application for managing children records, monthly payment tracking, employee salaries, operational expenses, a financial dashboard, target planning, per-child account statements, white-label branding, Excel export matching the original workbook, and cloud synchronization for administrators."

## Clarifications

### Session 2026-06-06

- Q: How are employee accounts created and managed? → A: Admins create, edit, and deactivate employee accounts from within the app (a user-management screen).
- Q: What currency is used for all financial figures? → A: Egyptian Pound (EGP / ج.م), a fixed single currency.
- Q: Which export formats must be supported? → A: Both Excel (.xlsx) and PDF available for every export type.
- Q: When does a login session expire? → A: It persists indefinitely until the user explicitly logs out.
- Q: How is an overpayment (paid > total) handled? → A: Allow it; record the negative balance as a credit and set status to "paid".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Children Records (Priority: P1)

A center administrator maintains the roster of enrolled children. They add a new child with guardian contact details, the chosen service (nursery, hosting, or session), the billing unit, and an agreed price. They can later search, filter, edit, or deactivate any child record.

**Why this priority**: The children roster is the foundation for every other module — payments, statements, and the dashboard all depend on having accurate child records. Without it, no financial tracking is possible.

**Independent Test**: Can be fully tested by adding several children, searching and filtering the list, editing a record, and deactivating one — delivering a usable registry on its own.

**Acceptance Scenarios**:

1. **Given** an empty roster, **When** an administrator submits a new child with a name, guardian, guardian phone, service, and price, **Then** the child appears in the list and is marked active.
2. **Given** a populated roster, **When** a user searches by child name, guardian name, phone, or national ID, **Then** only matching records are shown.
3. **Given** a populated roster, **When** a user filters by service type, **Then** only children of that service are displayed.
4. **Given** an existing child, **When** an administrator edits the price and saves, **Then** the updated price is persisted and shown.
5. **Given** an employee account, **When** they open the children list, **Then** they can view and search records but cannot add, edit, or delete them.

---

### User Story 2 - Track Monthly Payments (Priority: P1)

A staff member opens the payment sheet for a selected month and year. The system shows every active child with their service, unit, quantity, price, and computed total. The staff member records the amount paid per child; the system computes the remaining balance and assigns a payment status (paid, partial, or unpaid).

**Why this priority**: Recording collections is the core daily operation of the center and the primary source of all revenue figures. This is the main value driver of the system.

**Independent Test**: Can be fully tested by selecting a month, recording payments for several children, and confirming balances and statuses update — delivering working collections tracking.

**Acceptance Scenarios**:

1. **Given** a selected month with active children, **When** the payment sheet is opened for the first time, **Then** a payment row is generated for each active child based on their service and price.
2. **Given** a child's payment row, **When** a staff member enters a paid amount equal to the total, **Then** the balance becomes zero and the status shows "paid".
3. **Given** a child's payment row, **When** the paid amount is greater than zero but less than the total, **Then** the status shows "partial".
4. **Given** a child's payment row, **When** the paid amount is zero, **Then** the status shows "unpaid".
5. **Given** a payment sheet, **When** a user adjusts the quantity for a session-based child, **Then** the total recalculates as quantity × price.
6. **Given** a payment sheet, **When** the user views the summary bar, **Then** it shows total invoiced, total collected, and total arrears for the month.

---

### User Story 3 - Financial Dashboard (Priority: P1)

An administrator opens the dashboard and selects a month. They see key financial indicators: total invoiced, total collected, arrears, operational expenses, monthly salaries, and the collection rate. They also see a target calculator, revenue broken down by service, a 12-month summary, smart alerts, and charts.

**Why this priority**: The dashboard turns raw payment and expense data into the decision-making insight the owner needs to run the business. It is the primary reason an administrator opens the app.

**Independent Test**: Can be tested by entering payments and expenses for a month, opening the dashboard, and confirming the KPIs, summary table, and charts reflect the entered data.

**Acceptance Scenarios**:

1. **Given** recorded payments and expenses for a month, **When** the administrator selects that month, **Then** the KPI cards show the correct invoiced, collected, arrears, expenses, salary, and collection-rate values.
2. **Given** a target profit percentage in settings, **When** the dashboard loads, **Then** the target calculator shows the revenue required and the gap to target.
3. **Given** twelve months of data, **When** the dashboard loads, **Then** the 12-month summary table lists collected, expenses, net profit, and status per month.
4. **Given** collection below the target, **When** the dashboard loads, **Then** a smart alert highlights the shortfall.

---

### User Story 4 - Per-Child Account Statement (Priority: P2)

A staff member opens a single child's account statement showing a month-by-month breakdown from the registration date to the present, with totals paid, balances, and statuses, plus an overall summary. They can export the statement.

**Why this priority**: Statements are needed for guardian communication and dispute resolution, but they are derived from data captured in P1 stories, so they come after the core capture flows.

**Independent Test**: Can be tested by selecting a child with recorded payments and confirming the statement lists each month correctly with accurate totals.

**Acceptance Scenarios**:

1. **Given** a child registered several months ago with recorded payments, **When** their statement is opened, **Then** every month from registration to now is listed with service, quantity, price, total, paid, balance, and status.
2. **Given** a child statement, **When** it is displayed, **Then** the overall totals (active months, total paid, total outstanding) are shown.
3. **Given** a child statement, **When** the user exports it, **Then** a file containing the statement is produced.

---

### User Story 5 - Manage Salaries (Priority: P2)

An administrator manages the staff payroll: a list of employees each with base salary, housing and transport allowances, and a computed net salary. For each month they record bonuses, deductions, and the actual amount paid, with a monthly payroll total.

**Why this priority**: Payroll is essential to compute net profit on the dashboard but is administrator-only and less frequent than daily payment capture.

**Independent Test**: Can be tested by adding employees, recording a month's payroll with bonuses and deductions, and confirming net salaries and the monthly total compute correctly.

**Acceptance Scenarios**:

1. **Given** the payroll module, **When** an administrator adds an employee with base salary and allowances, **Then** the net salary is computed and the employee appears in the list.
2. **Given** an employee, **When** the administrator records a bonus and a deduction for a month, **Then** the actual paid amount reflects the adjustments.
3. **Given** an employee account, **When** they attempt to open the salaries module, **Then** access is denied.

---

### User Story 6 - Manage Operational Expenses (Priority: P2)

An administrator records operational expense items across the twelve months, each with a category and monthly amounts, and sees annual totals per item plus a combined total of expenses and salaries.

**Why this priority**: Expenses feed the net-profit and target calculations on the dashboard. Needed for accurate financials but administrator-only.

**Independent Test**: Can be tested by adding expense items with monthly amounts and confirming per-item annual totals and the grand total.

**Acceptance Scenarios**:

1. **Given** the expenses module, **When** an administrator enters a monthly amount for an expense item, **Then** the item's annual total updates.
2. **Given** recorded expenses and salaries, **When** the combined total is shown, **Then** it equals the sum of operational expenses plus salaries.
3. **Given** the expenses module, **When** an administrator adds a new expense item, **Then** it becomes available for monthly entry.

---

### User Story 7 - Target Planning (Priority: P3)

An administrator plans monthly targets: for each month the system shows expenses, the target profit percentage, the required revenue target, amount collected, the gap, and status. A calculator suggests how many units of each service are needed and lets the administrator model a custom distribution with a coverage percentage.

**Why this priority**: Forward-looking planning adds strategic value but depends on all the financial data captured earlier, making it lower priority than capture and reporting.

**Independent Test**: Can be tested by setting a target profit percentage and entering a custom distribution, then confirming the required target, gap, and coverage percentage compute correctly.

**Acceptance Scenarios**:

1. **Given** monthly expenses and a target profit percentage, **When** the planning page loads, **Then** the required revenue target and gap to collected are computed per month.
2. **Given** the custom distribution calculator, **When** the administrator enters counts per service, **Then** the projected revenue and coverage percentage are shown.

---

### User Story 8 - White-Label Branding (Priority: P3)

An administrator customizes the application's identity from within the app: application name, organization name, tagline, logo image, application icon, primary and accent colors, and contact details. Changes to name, colors, and logo apply immediately across the interface and on exports.

**Why this priority**: Branding is a differentiating convenience that lets the product be resold or rebranded, but it is not required for the core financial workflows.

**Independent Test**: Can be tested by changing the app name, colors, and logo in settings and confirming the interface and a generated export reflect the new branding.

**Acceptance Scenarios**:

1. **Given** the branding settings, **When** an administrator changes the primary color and saves, **Then** the interface color updates without restarting.
2. **Given** the branding settings, **When** an administrator uploads a logo, **Then** the new logo appears in the sidebar, login screen, and exports per the visibility toggles.
3. **Given** the branding settings, **When** an administrator uploads an application icon, **Then** the taskbar icon updates and the user is informed that the installer icon requires a rebuild.
4. **Given** customized branding, **When** an administrator chooses "restore defaults", **Then** the original branding is restored.
5. **Given** an employee account, **When** they open settings, **Then** the branding tab is not available to them.

---

### User Story 9 - Excel Export (Priority: P2)

A user exports data to a spreadsheet that matches the structure and styling of the original workbook — including a full multi-sheet export and partial exports (a single month, a child statement, salaries, or expenses). Exports carry the configured branding header and respect the chosen language for headers.

**Why this priority**: Export preserves continuity with the center's existing workbook-based workflow and is frequently requested, but it consumes data produced by the higher-priority capture stories.

**Independent Test**: Can be tested by exporting a month sheet and confirming the produced file opens with the expected sheet name, columns, totals, and branding header.

**Acceptance Scenarios**:

1. **Given** recorded data, **When** a user runs a full export, **Then** a workbook is produced with the expected sheets (dashboard, settings, children, salaries, expenses, statement, target, and twelve month sheets).
2. **Given** a selected month, **When** a user exports that month, **Then** a single-sheet file with that month's payment data and totals is produced.
3. **Given** configured branding, **When** any export is produced, **Then** the organization name and contact details appear in the export header.
4. **Given** an employee account, **When** they export a single child statement, **Then** the export succeeds (employees may export individual statements).

---

### User Story 10 - Authentication & Roles (Priority: P1)

A user logs in with a username and password. Administrators have full access; employees have a restricted set of capabilities. Sessions persist so that a returning user with a valid session is logged in automatically.

**Why this priority**: Access control gates every other capability and protects sensitive financial and payroll data; it must exist before the system can be safely used.

**Independent Test**: Can be tested by logging in as an administrator and as an employee and confirming each sees only the capabilities permitted for their role.

**Acceptance Scenarios**:

1. **Given** valid credentials, **When** a user logs in, **Then** they are granted access according to their role.
2. **Given** invalid credentials, **When** a user attempts to log in, **Then** access is denied with a clear message.
3. **Given** an employee session, **When** the employee navigates the app, **Then** salaries, sync, storage management, settings editing, and delete actions are unavailable.
4. **Given** a valid persisted session, **When** the user reopens the app, **Then** they are logged in automatically.

---

### User Story 11 - Backup, Restore & Import (Priority: P3)

An administrator manages local data: viewing database statistics, backing up the database to a file, restoring from a backup, importing data from the original workbook, and clearing data with confirmation. An audit log records recent operations.

**Why this priority**: Data safety and migration are important for trust and onboarding but are administrative utilities used occasionally rather than daily.

**Independent Test**: Can be tested by backing up the data to a file, then restoring it, and confirming the data is intact.

**Acceptance Scenarios**:

1. **Given** existing data, **When** an administrator creates a backup, **Then** a backup file is produced and recorded in the audit log.
2. **Given** a backup file, **When** an administrator restores it, **Then** the data matches the backed-up state.
3. **Given** the original workbook, **When** an administrator imports it, **Then** children, payments, salaries, and expenses are populated from the file.
4. **Given** a clear-data request, **When** an administrator confirms, **Then** the data is cleared and the action is logged.

---

### User Story 12 - Cloud Synchronization (Priority: P3)

An administrator synchronizes local data with a cloud database: pushing unsynced local records, pulling newer cloud records, viewing connection and sync status, and choosing a conflict-resolution strategy. Auto-sync can run on an interval.

**Why this priority**: Cloud sync enables multi-device and backup-to-cloud scenarios but is optional for a center operating from a single machine.

**Independent Test**: Can be tested by configuring a cloud connection, pushing local records, and confirming the sync status reports them as synced.

**Acceptance Scenarios**:

1. **Given** unsynced local records and a configured cloud connection, **When** the administrator pushes, **Then** those records are uploaded and marked synced.
2. **Given** newer cloud records, **When** the administrator pulls, **Then** the local data reflects the newer records.
3. **Given** a record changed in both places, **When** a sync runs, **Then** the configured conflict strategy (most recent change wins by default) determines the result.
4. **Given** an employee account, **When** they look for sync, **Then** it is unavailable to them.

---

### Edge Cases

- What happens when a payment sheet is opened for a month before any children were registered? (No rows generated; empty sheet with zero totals.)
- How does the system handle a child registered mid-year when generating their statement? (Statement starts at the registration month, not January.)
- What happens when a paid amount exceeds the total for a row? (Allowed; the negative balance is shown as a credit and the status is "paid".)
- How does the system behave when the cloud connection is unavailable during a sync? (Sync fails gracefully with a status message; local data is unaffected.)
- What happens when an uploaded logo or icon file is missing or corrupt at export/startup time? (System falls back to the default branding asset.)
- How does the system handle switching language while data is displayed? (Layout direction and labels update; numeric data is unchanged.)
- What happens when two records conflict during sync with identical change timestamps? (Deterministic tie-break per the configured strategy.)
- How does the system handle deactivating a child who has outstanding balances? (Child is hidden from new payment generation but historical records and statement remain.)

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Authorization**
- **FR-001**: System MUST authenticate users with a username and password and reject invalid credentials with a clear message.
- **FR-002**: System MUST support two roles, administrator and employee, and enforce role-based access on every capability.
- **FR-003**: System MUST restrict employees from viewing salaries, editing settings/prices, accessing sync and storage management, and deleting records.
- **FR-004**: System MUST persist a user's session indefinitely until the user explicitly logs out, so a returning user is logged in automatically on reopen with no time-based expiry.
- **FR-005**: System MUST store user passwords in a non-recoverable hashed form.
- **FR-005a**: System MUST allow administrators to create, edit, and deactivate employee accounts from an in-app user-management screen; this screen MUST be unavailable to employees.

**Children**
- **FR-006**: System MUST allow administrators to create, edit, and deactivate child records with name, guardian, guardian phone, optional child phone, optional national ID, service, unit, price, registration date, and notes.
- **FR-007**: System MUST default the billing unit and price based on the selected service and configured pricing, while allowing the price to be overridden.
- **FR-008**: Users MUST be able to search children by child name, guardian name, phone, or national ID, and filter by service.
- **FR-009**: System MUST allow employees to view and search children but not modify them.

**Payments**
- **FR-010**: System MUST generate a payment row for each active child for a given month based on the child's service and price.
- **FR-011**: System MUST compute each row's total as quantity × price and the balance as total − paid.
- **FR-012**: System MUST assign a status of paid, partial, or unpaid based on the paid amount relative to the total. A paid amount equal to or greater than the total is "paid"; an amount exceeding the total is permitted and recorded as a negative balance (credit).
- **FR-013**: Users MUST be able to edit only the quantity and the paid amount on a payment row; price derives from the child/settings.
- **FR-014**: System MUST display per-month summary totals for invoiced, collected, and arrears.
- **FR-015**: System MUST support recording a full payment for multiple selected children in one action.

**Dashboard**
- **FR-016**: System MUST present, for a selected month, KPIs for total invoiced, total collected, arrears, operational expenses, monthly salaries, and collection rate.
- **FR-017**: System MUST compute the required revenue target from expenses and the configured target profit percentage, and the gap to amount collected.
- **FR-018**: System MUST present a 12-month summary of collected, expenses, net profit, and status.
- **FR-019**: System MUST present revenue broken down by service and visual charts of collected versus expenses and revenue distribution.
- **FR-020**: System MUST surface smart alerts for target shortfalls, arrears, and low collection rate.

**Child Statement**
- **FR-021**: System MUST produce a per-child statement covering each month from the child's registration date to the present with service, quantity, price, total, paid, balance, and status, plus overall totals.

**Salaries**
- **FR-022**: System MUST allow administrators to create, edit, and deactivate employees with base salary, housing allowance, transport allowance, and computed net salary.
- **FR-023**: System MUST allow recording per-employee per-month bonuses, deductions, actual paid amount, and pay date, and display a monthly payroll total.

**Expenses**
- **FR-024**: System MUST allow administrators to record operational expense items with category and monthly amounts, compute per-item annual totals, and compute a combined total of expenses plus salaries.
- **FR-025**: System MUST allow adding and removing expense items.

**Target Planning**
- **FR-026**: System MUST compute, per month, the required revenue target and gap from expenses and the target profit percentage.
- **FR-027**: System MUST provide a calculator that suggests units needed per service and computes coverage percentage for a custom distribution of services.

**Settings & Branding**
- **FR-028**: System MUST allow administrators to configure service pricing (per applicable unit), target profit percentage, maximum capacity, and working days/hours.
- **FR-029**: System MUST allow administrators to customize application name, organization name, tagline, logo, application icon, primary and accent colors, and contact details.
- **FR-030**: System MUST apply changes to application name, colors, and logo immediately without requiring a restart.
- **FR-031**: System MUST update the taskbar/window icon immediately on icon upload and inform the user that the installer icon requires a rebuild.
- **FR-032**: System MUST include the configured organization name and contact details in export headers.
- **FR-033**: System MUST provide a restore-to-default option for branding.
- **FR-034**: System MUST restrict branding and security/sync settings to administrators.

**Export**
- **FR-035**: System MUST produce a full multi-sheet export whose sheet names, column structure, and styling match the original workbook.
- **FR-036**: System MUST produce partial exports for a single month, a single child statement, salaries, and expenses.
- **FR-036a**: System MUST offer both Excel (.xlsx) and PDF output for every export type (full export, single month, child statement, salaries, expenses).
- **FR-037**: System MUST let the user choose the export language for headers (Arabic or English).
- **FR-038**: System MUST allow employees to export an individual child statement.

**Localization**
- **FR-039**: System MUST support Arabic (right-to-left) and English (left-to-right) interfaces with a language switcher.
- **FR-040**: System MUST adjust layout direction and labels when the language changes, leaving numeric data unchanged.

**Storage & Data Management**
- **FR-041**: System MUST present database statistics (counts and size).
- **FR-042**: System MUST allow administrators to back up and restore the local database.
- **FR-043**: System MUST allow administrators to import data from the original workbook.
- **FR-044**: System MUST allow administrators to clear data behind a confirmation step and record an audit log of recent operations.
- **FR-045**: System MUST persist all application data locally (not in volatile browser storage) so it survives restarts and works offline.

**Synchronization**
- **FR-046**: System MUST allow administrators to push unsynced local records to the cloud and pull newer records from it.
- **FR-047**: System MUST track per-record sync state and present connection status, last sync time, and pending/synced counts.
- **FR-048**: System MUST resolve conflicts using a configurable strategy, defaulting to most-recent-change-wins.
- **FR-049**: System MUST support an optional automatic sync on a configurable interval.
- **FR-050**: System MUST fail synchronization gracefully when the cloud is unreachable, leaving local data intact.

### Key Entities *(include if feature involves data)*

- **Child**: An enrolled child. Attributes: name, guardian, guardian phone, child phone, national ID, service (nursery / hosting / session), unit (month / day / hour / session), price, registration date, notes, active flag.
- **Payment**: A monthly billing record for a child. Attributes: associated child, month, year, service, unit, quantity, price, total, paid, balance, status, notes. Related to Child.
- **Employee**: A staff member. Attributes: name, role, base salary, housing allowance, transport allowance, net salary, active flag.
- **Salary Payment**: A monthly payroll record for an employee. Attributes: associated employee, month, year, bonus, deductions, actual paid, pay date, notes. Related to Employee.
- **Expense**: An operational expense entry. Attributes: item name, month, year, amount, category, notes.
- **Setting**: A configuration key/value pair, including pricing, target, capacity, branding, security, and sync settings.
- **User**: An application account. Attributes: username, hashed password, role (admin / employee), name.
- **Sync Log**: A record of a synchronization action. Attributes: action, target entity type, record reference, status, error, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can record a month's payments for 100 children and see updated collection totals without the interface becoming unresponsive.
- **SC-002**: The dashboard reflects newly recorded payments and expenses for the selected month within 2 seconds of opening.
- **SC-003**: A user can locate any child by name, guardian, phone, or national ID in under 5 seconds.
- **SC-004**: A full export reproduces every expected sheet from the original workbook with matching sheet names and column layout, verifiable by opening the file.
- **SC-005**: An administrator can change the application name, colors, and logo and see the change reflected across the interface without restarting the application.
- **SC-006**: Role restrictions hold in 100% of attempts — employees never gain access to salaries, settings editing, sync, storage management, or delete actions.
- **SC-007**: A backup can be created and restored with zero data loss, verified by comparing record counts before and after.
- **SC-008**: The application functions fully offline for all non-sync features.
- **SC-009**: Switching between Arabic and English updates layout direction and labels across all screens with no untranslated primary navigation labels.
- **SC-010**: After a successful push, every previously unsynced record is reported as synced.

## Assumptions

- The application is a single-user-at-a-time desktop application installed per machine; concurrent multi-user editing on one database file is out of scope.
- Pricing in settings drives default child prices; per-child price overrides are allowed as stated in the plan.
- The default administrator credential is seeded for first use and is expected to be changed by the administrator after first login.
- Months are tracked using the Arabic month names used in the original workbook, with English equivalents provided for the English interface.
- A single organization/branch is supported in this version; multi-branch support is out of scope (noted as future in the plan).
- The cloud database connection details are provided and configured by the administrator; provisioning the cloud account is out of scope.
- Currency is the Egyptian Pound (EGP / ج.م), fixed for all financial figures and exports; multi-currency handling and conversion are out of scope.
- "Net profit" is computed as collected minus the sum of operational expenses and salaries for the period, per the plan's business logic.
- Standard desktop performance expectations apply (data volume on the order of ~100 children and ~11 employees as described).

## Dependencies

- Access to the original workbook file for the import feature.
- An administrator-provided cloud database connection for the synchronization feature.
- A writable local application directory for storing the database, backups, and uploaded branding assets.
