# Feature Specification: Dynamic Roles, Salary Configuration & Service Enhancements

**Feature Branch**: `005-roles-salary-services`

**Created**: 2026-06-25

**Status**: Draft

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dynamic Employee Role Management (Priority: P1)

An admin currently cannot customize employee roles — they are locked to a fixed list. The admin needs to define roles specific to their organization (e.g., "Speech Therapist", "Shadow Teacher") and assign those roles when adding or editing an employee. New roles must persist in local storage and sync to the cloud database.

**Why this priority**: Roles affect salary rules; all other salary configuration depends on this being dynamic first.

**Independent Test**: Admin can open "Add Employee", see a role dropdown, type a new role name, save it, and find it available the next time any employee form is opened.

**Acceptance Scenarios**:

1. **Given** the admin opens the Add Employee form, **When** they view the role field, **Then** they see a searchable dropdown populated from the stored roles list, with a clearly labeled "Add new role" button.
2. **Given** the admin clicks "Add new role" and types "Speech Therapist", **When** they confirm, **Then** the role is saved to both local and cloud databases and immediately available in the dropdown.
3. **Given** a role exists, **When** the admin assigns it to an employee and saves, **Then** the employee record shows that role in both local and cloud databases.
4. **Given** the app is offline when a new role is created, **When** connectivity is restored, **Then** the new role syncs to the cloud without duplicates.

---

### User Story 2 — Salary Configuration per Employee Type (Priority: P1)

An admin needs to define how each employee earns their salary. Currently the system has no flexible salary model. The admin must be able to configure — per role or per individual — whether salary is: a fixed monthly amount, a percentage of sessions they were involved in, a fixed amount per session, or a combination. These configurations are set in the Settings screen and applied automatically when calculating salaries.

**Why this priority**: Core payroll correctness — without this, salary calculations are wrong for any non-fixed-salary employee.

**Independent Test**: Admin sets a "per session percentage" rule in Settings, assigns it to an employee, runs salary calculation for a month, and the result matches the expected formula.

**Acceptance Scenarios**:

1. **Given** the admin is in Settings, **When** they open Salary Configuration, **Then** they can define salary types: Fixed Monthly, Per-Session Fixed Amount, Per-Session Percentage of Session Revenue, Monthly + Per-Session Percentage.
2. **Given** a salary type "Per-Session 15%" is defined, **When** the admin assigns it to an employee and 20 sessions are recorded for that employee in a month at 100 EGP each, **Then** the calculated salary is 300 EGP (20 × 100 × 15%).
3. **Given** a salary type "Fixed Monthly 5000 EGP" is defined, **When** the month-end calculation runs, **Then** that employee always shows 5000 EGP regardless of session count.
4. **Given** the admin saves a salary configuration, **When** the page reloads or the app restarts, **Then** all salary types and their assignments are preserved in both databases.

---

### User Story 3 — Custom Service Types with Flexible Pricing (Priority: P2)

Admins can currently only use the built-in services (Nursery, Autism Hosting, Sessions). They need to create additional service types — such as "Occupational Therapy" or "Speech Program" — each with its own pricing by day, month, and/or hour, mirroring how built-in services work. These services must be available when enrolling a child.

**Why this priority**: Directly impacts revenue tracking and child enrollment correctness; needed before enrollment form improvements make sense.

**Independent Test**: Admin creates a new service "OT Program" with a monthly price, navigates to a child enrollment form, adds that service, and the correct monthly price is reflected in the payment due total.

**Acceptance Scenarios**:

1. **Given** the admin opens Settings → Services, **When** they click "Add Service", **Then** they can enter a service name and set prices per day, per month, and per hour independently.
2. **Given** a custom service "OT Program (monthly: 1500 EGP)" is saved, **When** an admin enrolls a child and selects "OT Program", **Then** the monthly amount 1500 EGP appears in the child's payment schedule.
3. **Given** a custom service is created, **When** the app syncs, **Then** the service exists in both local and cloud databases and is visible across devices.
4. **Given** a custom service is deleted, **When** existing children have that service, **Then** the system warns the admin before deletion and preserves historical payment records.

---

### User Story 4 — Fix Payment Display on Child Enrollment Form (Priority: P2)

When adding or editing a child, selecting a service type (e.g., Nursery → Monthly) shows 0 EGP as the amount due. The correct price should display immediately when a service and billing period are selected, and toggle correctly if the admin switches between billing periods.

**Why this priority**: Causes incorrect payment records and admin confusion on every enrollment.

**Independent Test**: Open Add Child form, select "Nursery" + "Monthly", and the configured monthly nursery price appears instantly in the amount field without requiring any extra interaction.

**Acceptance Scenarios**:

1. **Given** a child form is open with no service selected, **When** the admin selects "Nursery" as service and "Monthly" as type, **Then** the amount field auto-populates with the configured monthly nursery price (not 0).
2. **Given** "Nursery Monthly" is already selected showing a price, **When** the admin switches to "Daily", **Then** the amount updates to the daily price immediately.
3. **Given** the admin switches back to "Monthly", **Then** the monthly price is restored correctly.
4. **Given** a custom service with a defined monthly price is selected, **Then** it also auto-populates the correct price.

---

### User Story 5 — Fix Additional Classes Display in Child Enrollment (Priority: P2)

When a child has a service subscription plus additional classes, the system currently shows only the count of classes (e.g., "8") multiplied by price as if a separate subtotal — instead of showing the base service total plus the additional classes total as one combined readable figure.

**Why this priority**: Creates billing confusion and leads to incorrect amounts being charged.

**Independent Test**: Enroll a child in "Nursery Monthly 2500 EGP" + "3 extra classes at 100 EGP each". The display should show 2500 + 300 = 2800 EGP total, not ambiguous partial numbers.

**Acceptance Scenarios**:

1. **Given** a child has a monthly service at 2500 EGP and 3 additional classes at 100 EGP each, **When** the enrollment summary is displayed, **Then** it shows: Service: 2500 + Additional Classes: 300 = Total: 2800 EGP.
2. **Given** no additional classes are added, **When** the summary is displayed, **Then** only the base service amount is shown with no additional classes line.
3. **Given** additional classes are removed, **When** the summary updates, **Then** the total drops accordingly.

---

### User Story 6 — Pro-Rated Payment for Mid-Month Enrollments (Priority: P2)

A child who enrolls on June 20 should not pay the same amount as a child enrolled on June 1. The system must calculate the payment based on remaining scheduled sessions from the enrollment date to end of the billing period.

**Why this priority**: Overcharging new enrollees damages trust and requires manual correction every time.

**Independent Test**: Enroll a child on the 20th of a month. The scheduled session calendar shows 3 sessions remain from that date. The system calculates and shows payment for exactly those 3 sessions.

**Acceptance Scenarios**:

1. **Given** a month has 8 scheduled sessions and a child enrolls on the date of the 6th session, **When** the first payment is generated, **Then** the child is charged for 3 sessions (sessions 6, 7, 8) not all 8.
2. **Given** a child enrolls on the first day of a billing period, **When** payment is generated, **Then** full period price applies with no pro-rating.
3. **Given** a child enrolls on the last day of a billing period with no remaining sessions, **When** payment is generated, **Then** the amount is 0 and the system moves enrollment to the next billing period.
4. **Given** daily billing is used, **When** a child enrolls mid-month, **Then** the charge is for remaining calendar days only.

---

### User Story 7 — Fix Child Photo Upload (Priority: P3)

When an admin adds or edits a child and attaches a photo, the photo appears in the form preview but is never actually uploaded to cloud storage. After saving, the child record has no photo. The photo must be uploaded and persisted correctly.

**Why this priority**: Data integrity issue, but does not block core operations; photo is supplementary.

**Independent Test**: Add a child with a photo, save, close the form, reopen the child record — the photo appears.

**Acceptance Scenarios**:

1. **Given** an admin attaches a photo while adding a child, **When** they save the form, **Then** the photo is uploaded to cloud storage and the child record stores the photo URL.
2. **Given** an admin edits a child and replaces the photo, **When** they save, **Then** the new photo is uploaded and the old one is no longer shown.
3. **Given** cloud storage is unavailable during save, **When** the upload fails, **Then** the admin sees a clear error message and the child is saved without a photo (non-blocking).
4. **Given** a child was saved without a photo due to a past bug, **When** the admin edits and attaches a photo now, **Then** the photo uploads successfully.

---

### User Story 8 — Attendance Tracking with Excuse Management (Priority: P1)

The admin or teacher needs to record attendance for each scheduled session — marking each child as attended, absent with a valid excuse, or absent without excuse. These records must sync between both databases and directly feed into teacher salary calculations: a teacher is paid for sessions a child attended or was absent without excuse, but not for sessions where a child had a valid excuse (since that session is treated as canceled from a payroll standpoint).

**Why this priority**: Attendance records are the foundation for both correct pro-rating (User Story 6) and session-based salary calculation (User Story 2). Without it, all session-dependent calculations are manual estimates.

**Independent Test**: For a scheduled session, mark two children as attended and one as absent with excuse. Run salary calculation for the teacher — the payment reflects two sessions, not three.

**Acceptance Scenarios**:

1. **Given** a scheduled session exists, **When** the admin or teacher opens the attendance view for that session, **Then** they see all enrolled children listed with attendance status controls (attended / absent-excused / absent-unexcused).
2. **Given** a child is marked "absent with valid excuse", **When** salary is calculated for the teacher of that session, **Then** that session is excluded from the teacher's payable session count.
3. **Given** a child is marked "absent without excuse", **When** salary is calculated, **Then** that session is included in the teacher's payable session count (teacher is paid regardless).
4. **Given** a child is marked "attended", **When** salary is calculated, **Then** that session is included in the teacher's payable session count.
5. **Given** attendance is recorded offline, **When** connectivity is restored, **Then** all attendance records sync to the cloud database without conflicts or data loss.
6. **Given** attendance records exist, **When** the admin generates a salary report for a teacher, **Then** the report breaks down paid sessions vs. excused-absence sessions for transparency.

---

### Edge Cases

- What happens when an admin deletes a role that is currently assigned to active employees?
- How does salary calculation handle a month where an employee has zero payable sessions but has a minimum guaranteed monthly floor?
- What happens when a custom service price is changed mid-month and children are already enrolled in it?
- What happens when a child's enrollment date is in the future (pre-enrollment)?
- How does the system behave when both local and cloud databases have conflicting role lists after an offline period?
- What happens when attendance for a session is recorded by two different users simultaneously (conflict)?
- What happens when a session is deleted after attendance has already been recorded?
- Can an excuse status be changed after salary has already been calculated for that period?
- What is shown in the attendance view for a session with no enrolled children?

---

## Clarifications

### Session 2026-06-25

- Q: Are sessions individually scheduled with specific dates, or only tracked as a monthly count? → A: Sessions are individually scheduled with specific dates. The system will also implement an attendance system synced between both databases. Teacher salaries are calculated from attendance: the teacher is paid for sessions where the student attended, or was absent without a valid excuse; the teacher is not paid when the student had a valid excuse, since that session is treated as canceled for payroll purposes.
- Q: Is salary type assigned at the role level, per individual employee, or both? → A: Option C — the role defines a default salary type; the admin can override it per individual employee.
- Q: When transitioning from hard-coded roles to dynamic roles, how should existing employee records be handled? → A: Option A — auto-migrate: existing hard-coded role strings become entries in the new roles table on first launch after the update; all employee assignments are preserved automatically with no admin action required.
- Q: Can the admin manually edit the calculated pro-rated amount before saving, or is it confirmation-only? → A: Option A — the admin sees the calculated pro-rated amount and can manually adjust it before confirming. The calculated value is the default starting point.
- Q: When two offline devices record conflicting attendance statuses for the same child in the same session, how should sync resolve it? → A: Option B — last write wins by timestamp, but any overwrite of a previously-synced record is logged and surfaced to the admin in a conflict review list.

---

## Requirements *(mandatory)*

### Functional Requirements

**Employee Roles**

- **FR-001**: The system MUST replace all hard-coded employee role values with a dynamic list stored in the database.
- **FR-002**: The Add/Edit Employee form MUST present roles as a searchable dropdown.
- **FR-003**: The employee form MUST include an "Add new role" control that creates and immediately persists a new role.
- **FR-004**: All role create/update operations MUST be reflected in both local and cloud databases and survive a sync cycle without duplication.
- **FR-005**: Deleting a role that is in use MUST be blocked with a clear explanation, or the admin must be shown which employees are affected and given the option to reassign first.

**Salary Configuration**

- **FR-006**: The Settings screen MUST include a Salary Configuration section where admins define named salary types.
- **FR-007**: Each salary type MUST support at least these modes: Fixed Monthly Amount, Fixed Per-Session Amount, Percentage of Session Revenue Per Session, and Monthly Fixed + Per-Session Percentage.
- **FR-008**: Each employee role MUST have a default salary type assigned; individual employee records MAY override their role's default with a different salary type. If no per-employee override is set, the role's default applies.
- **FR-009**: Monthly salary calculations for session-based salary types MUST count only sessions where the child attended OR was absent without a valid excuse; sessions where the child was absent with a valid excuse MUST be excluded from the teacher's payable session count for that period.
- **FR-010**: Salary types MUST sync to both databases; changes to a salary type MUST re-reflect on next calculation without retroactively altering past payslips.

**Custom Services**

- **FR-011**: The Settings screen MUST allow admins to add, edit, and delete custom service types beyond the built-in defaults.
- **FR-012**: Each custom service MUST support independent pricing by day, month, and hour (any or all can be set).
- **FR-013**: Custom services MUST appear in the child enrollment service selector alongside built-in services.
- **FR-014**: Custom service definitions MUST sync to both databases.
- **FR-015**: Deleting a custom service that has enrolled children MUST warn the admin and preserve all historical payment records.

**Enrollment Form Fixes**

- **FR-016**: Selecting a service type and billing period on the child enrollment form MUST immediately display the configured price in the amount field.
- **FR-017**: Switching billing period (monthly ↔ daily ↔ hourly) MUST update the displayed amount in real time.
- **FR-018**: The additional classes summary MUST display: base service amount + (number of additional classes × class price) = total, as separate labeled lines.
- **FR-019**: The total amount shown on the enrollment form MUST always equal the sum of all service charges for the selected billing configuration.

**Pro-Rated Payments**

- **FR-020**: When a child enrolls after the start of a billing period, the first payment MUST be calculated using only the scheduled sessions that fall on or after the enrollment date.
- **FR-021**: Pro-rating logic MUST apply to all billing types: session-based (count remaining scheduled sessions) and daily (count remaining calendar days).
- **FR-022**: Full-period pricing MUST apply when enrollment date equals the period start date.
- **FR-023**: The system MUST display the calculated pro-rated amount to the admin before saving; the admin MUST be able to manually adjust this amount before confirming. The system-calculated value is the default; any manual override is stored alongside the original calculated value for audit purposes.

**Photo Upload**

- **FR-024**: Saving a child record with an attached photo MUST trigger the upload to cloud storage before the save completes.
- **FR-025**: The child record MUST store the resulting cloud photo URL, not a local blob reference.
- **FR-026**: If the photo upload fails, the system MUST inform the admin and allow saving the child record without a photo.

**Attendance System**

- **FR-027**: The system MUST maintain a scheduled session calendar with individual session dates for each service/group.
- **FR-028**: Each scheduled session MUST be linkable to one or more teachers (employees) who deliver it.
- **FR-029**: For each scheduled session, the system MUST allow recording per-child attendance with one of three statuses: Attended, Absent with Valid Excuse, Absent without Excuse.
- **FR-030**: Attendance records MUST sync to both local and cloud databases using last-write-wins by timestamp. Any sync operation that overwrites a previously-synced attendance record MUST create a conflict log entry. The admin MUST be able to view a conflict review list showing the overwritten value, the winning value, the timestamp of each, and the recording user; the admin MAY manually correct the final value from this list.
- **FR-031**: The salary calculation engine MUST reference attendance records to determine each teacher's payable session count per billing period, applying the excuse-exclusion rule from FR-009.
- **FR-032**: The attendance view for a session MUST be accessible to both admins and teachers (with teachers limited to sessions they are assigned to).
- **FR-033**: Once a salary period is finalized (payslip issued), retroactive changes to attendance excuse status for that period MUST require admin confirmation and trigger a recalculation warning.
- **FR-034**: The system MUST provide a per-teacher attendance summary report showing: total scheduled sessions, sessions attended by at least one child, excused absences, unexcused absences, and resulting payable session count.

**Role Migration**

- **FR-035**: On first launch after the update, the system MUST automatically scan all existing employee records for hard-coded role values, create a corresponding entry in the dynamic roles table for each unique value found, and re-link every employee to their new dynamic role record.
- **FR-036**: The migration in FR-035 MUST be idempotent — running it more than once MUST NOT create duplicate role entries.
- **FR-037**: If a migrated role has no salary type defined (because it pre-dates the salary configuration feature), it MUST be flagged in the UI so the admin can assign a default salary type before the next payroll calculation.

### Key Entities

- **EmployeeRole**: Name (unique), creation date, created-by user, default salary type reference (required); referenced by Employee records.
- **SalaryType**: Name, mode (fixed-monthly / per-session-fixed / per-session-percentage / hybrid), rate value(s) — for hybrid: monthly base + per-session rate; referenced by EmployeeRole (default) and optionally by individual Employee records (override).
- **Employee** (updated): salary type field is optional override — resolved at calculation time as: employee's own salary type if set, otherwise the salary type of their assigned role.
- **ServiceDefinition**: Name, is-custom flag, price-per-day, price-per-month, price-per-hour; referenced by child enrollment records.
- **ScheduledSession**: Date, time, service/group reference, list of assigned teacher(s); determines pro-rating boundaries and links to attendance.
- **AttendanceRecord**: Scheduled session reference, child reference, status (attended / absent-excused / absent-unexcused), excuse notes (optional), recorded-by user, recorded-at timestamp.
- **ChildEnrollment**: Child reference, service reference, billing type, enrollment date, first-period pro-rated amount, recurring amount.
- **ChildPhoto**: Cloud storage URL attached to a Child record after successful upload.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can create a new employee role and have it available for assignment in under 30 seconds.
- **SC-002**: Salary calculations for a full employee roster complete without manual correction for 100% of employees with assigned salary types.
- **SC-003**: Admins can add a custom service and enroll a child in it within the same session without a page reload.
- **SC-004**: The payment amount field on the enrollment form reflects the correct price within 1 second of selecting a service + billing period, with 0 occurrences of displaying "0" when a valid price is configured.
- **SC-005**: Pro-rated first payments differ from full-period payments for all children enrolled after the period start date, with the amount matching the count of remaining scheduled sessions × per-session price.
- **SC-006**: Child photos are visible in the child record immediately after saving, with 0 cases of photo loss on first save.
- **SC-007**: All role, salary type, custom service, and attendance data is present in both databases after a full sync cycle with no duplicates.
- **SC-008**: Teacher salary reports correctly exclude excused-absence sessions, with the reported payable count matching the attendance log for 100% of calculated payslips.

---

## Assumptions

- The existing settings infrastructure (Settings screen, local + cloud sync) will be extended rather than replaced.
- Existing hard-coded role values (e.g., "teacher", "therapist") are known finite strings in the current codebase; all unique values will be discovered and migrated automatically on first post-update launch.
- Scheduled sessions are pre-created by the admin or teacher before attendance can be recorded against them.
- Cloud storage (Cloudinary) is already wired for photo uploads; the bug is in the upload trigger, not in the storage configuration.
- Built-in services (Nursery, Hosting, Sessions) remain unchanged; custom services are additive.
- Salary calculation currently runs manually (admin-triggered); this feature does not change the trigger mechanism.
- A salary type, once assigned to an employee, can be changed; but past payslips remain unaffected.
- The roles list is shared across all employees (not per-branch or per-location).
- Pro-rating applies only to the first billing period; subsequent periods are charged at full price.
- Daily billing pro-rates by remaining calendar days; session-based billing pro-rates by remaining scheduled sessions.
- A teacher can be assigned to multiple sessions per day; each session is independently tracked for attendance.
- Attendance recording is done by the admin or the assigned teacher; other employees cannot record attendance for sessions they are not assigned to.
