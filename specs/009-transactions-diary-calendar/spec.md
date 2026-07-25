# Feature Specification: Transactions Timeline, Child Diary & Staff Calendar

**Feature Branch**: `009-transactions-diary-calendar`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "the daily not that i want t dlete it from here and mongo sync and the dialy trnasations but iwant new tap called that support days , waek , motnht or speiecfc days or from that to that that show what tractions hhapnded in this days , although in child deitls page show the child time taple and rleted teachers of srvicses , and case illnse case if embty make can add activite tha t child do well use note and phto or video with media serivce clound nairy that wel have , reiaming money that must payed and lthough the total mondey already payed make clandel page for all role that show all titme taple for all users and on clikc show user rlted to this days and the srrvicses teacher relted"

## Clarifications

### Session 2026-07-08

- Q: Should the existing historical Daily Billing records be migrated into the new Transaction entity when the Daily Billing table/collection is removed? → A: Discard entirely — old daily billing records are deleted with the feature, no migration or export.
- Q: Which cloud media storage approach should host the child diary's photos/videos? → A: The nursery already has a Cloudinary media service in place; diary photos/videos are uploaded to and served from that existing Cloudinary integration.
- Q: On the shared Calendar page, should employees see every user's/child's schedule, or only ones tied to their own assigned services? → A: Everyone sees everything — both admin and employee roles see the full aggregated calendar for all staff and children.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Remove the Daily Billing tab and replace it with a Transactions timeline (Priority: P1)

The nursery admin no longer wants the standalone "Daily Billing" tab and its MongoDB sync collection. In its place, they want a "Transactions" tab that lets any user pick a day, a week, a month, or a custom date range ("from this date to that date") and see every financial transaction (payments, charges, refunds) that occurred within that window, across all children and services.

**Why this priority**: This is the primary, explicit ask — remove one page and replace it with a more flexible reporting view. Every other story builds on top of having a working transactions dataset.

**Independent Test**: Can be fully tested by confirming the "Daily Billing" navigation entry and page are gone, then opening the new "Transactions" tab, selecting each range mode (day/week/month/custom) in turn, and verifying the listed transactions match only what occurred in the selected window.

**Acceptance Scenarios**:

1. **Given** the app has been updated, **When** a user looks at the main navigation, **Then** there is no "Daily Billing" entry and no daily billing page is reachable.
2. **Given** existing daily billing data in the local database and in MongoDB, **When** the update is applied, **Then** the daily billing table and its MongoDB sync collection are removed and no longer participate in push/pull sync, and any historical daily-billing records are permanently discarded (not migrated into Transactions).
3. **Given** the new "Transactions" tab, **When** the user selects "Day" and picks a specific date, **Then** only transactions dated that day are listed.
4. **Given** the new "Transactions" tab, **When** the user selects "Week" and picks a date within that week, **Then** all transactions from that Saturday-to-Friday (nursery's operating week) are listed.
5. **Given** the new "Transactions" tab, **When** the user selects "Month" and picks a month, **Then** all transactions within that calendar month are listed.
6. **Given** the new "Transactions" tab, **When** the user selects "Custom range" and picks a start and end date, **Then** all transactions between those two dates (inclusive) are listed.
7. **Given** a list of transactions is displayed, **When** the user reviews a row, **Then** it shows the child, the service, the amount, the transaction type (charge/payment/refund), and the date.

---

### User Story 2 — Child details page shows timetable, assigned teachers, and services (Priority: P1)

On a child's details page, staff can see the child's weekly time table (which days/times the child attends) alongside the teachers and services associated with each of those slots, without navigating away.

**Why this priority**: Staff need a single place to answer "when does this child come in, and who takes care of them" — this is core daily-operations information.

**Independent Test**: Can be fully tested by opening a child with active service enrollments and confirming the timetable section lists each attendance slot with its assigned teacher and service name.

**Acceptance Scenarios**:

1. **Given** a child enrolled in one or more services with defined schedules, **When** the admin opens the child's details page, **Then** a timetable section shows each day/time slot together with the service and the teacher assigned to it.
2. **Given** a child with no scheduled services, **When** the admin opens the child's details page, **Then** the timetable section shows an empty state instead of an error.
3. **Given** a teacher reassignment for a service, **When** the admin views the child's timetable afterward, **Then** it reflects the newly assigned teacher.

---

### User Story 3 — Child health/illness log with an optional activity + media diary (Priority: P2)

The child details page has a health/illness case section. When there is no active illness case, staff can instead log a daily activity entry for the child — a short note plus an attached photo or video — building a visual diary of the child's day.

**Why this priority**: Extends child-details usefulness for parents/staff communication, but depends on User Story 2's page layout being in place first.

**Independent Test**: Can be fully tested by opening a child with no open illness case, adding an activity entry with a note and a photo, and confirming it appears in the child's diary list with the media viewable.

**Acceptance Scenarios**:

1. **Given** a child has no open illness/case entry, **When** staff opens the health section, **Then** they see an "Add Activity" option instead of an illness form.
2. **Given** staff fills in a note and attaches a photo or video, **When** they save the activity, **Then** it is stored and displayed in the child's diary with the note text and a preview/player for the media.
3. **Given** a child has an open illness case, **When** staff opens the health section, **Then** the illness case is shown instead of the "Add Activity" option, and illness case entry continues to work as before.
4. **Given** an activity entry with a video attached, **When** a user opens it later, **Then** the video can be played back on demand.

---

### User Story 4 — Remaining balance shown next to amount already paid (Priority: P2)

Wherever a child's payment totals are shown (billing pages, child details), staff can see both the total amount already paid and the remaining amount still owed, side by side.

**Why this priority**: Directly requested; important for day-to-day collections but independent of the calendar/diary work.

**Independent Test**: Can be fully tested by viewing a child with partially paid services and confirming both "Paid" and "Remaining" figures are displayed and sum to the total due.

**Acceptance Scenarios**:

1. **Given** a child owes money across one or more billed services, **When** staff view the child's payment summary, **Then** both "Total Paid" and "Remaining Due" are shown.
2. **Given** a child has paid everything in full, **When** staff view the payment summary, **Then** "Remaining Due" shows zero.

---

### User Story 5 — Shared Calendar page for every role (Priority: P3)

A "Calendar" page, reachable by both admin and employee roles, shows the combined time table of all users (staff and/or children) across days. Clicking a specific day/user cell shows which users are involved that day along with the related service and teacher.

**Why this priority**: A cross-cutting scheduling view that is valuable once the underlying timetable and services data (User Story 2) exists.

**Independent Test**: Can be fully tested by logging in as an employee, opening the Calendar page, seeing entries across several days, clicking one day, and confirming it lists the users scheduled that day with their service and teacher.

**Acceptance Scenarios**:

1. **Given** a logged-in admin or employee, **When** they open the Calendar page, **Then** they see a monthly/weekly view populated with every user's scheduled time slots.
2. **Given** the Calendar page is displayed, **When** the user clicks on a specific day, **Then** a detail view lists every person scheduled that day along with the associated service and teacher.
3. **Given** no one is scheduled on a given day, **When** the user clicks that day, **Then** the detail view shows an empty state.

---

### Edge Cases

- What happens to historical daily-billing records when the feature is removed? They are permanently discarded along with the removed table/collection; the new Transactions view starts fresh and does not include past daily-billing history.
- What happens when a child has both an open illness case and existing activity/diary entries from before the case was opened? (Existing diary entries remain visible in history; only new entries are blocked while a case is open.)
- What happens when a custom transaction date range spans more than a year? (System still returns results but may take longer; no hard cap imposed for v1.)
- What happens if a media file (photo/video) fails to upload? (The activity note is still saved; the media attachment is marked failed and can be retried.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST remove the standalone "Daily Billing" navigation entry, page, and underlying data table/collection, including its MongoDB sync collection; existing historical daily-billing records MUST be permanently discarded, not migrated.
- **FR-002**: System MUST provide a "Transactions" tab that lists financial transactions (charges, payments, refunds) across all children and services.
- **FR-003**: The Transactions tab MUST support filtering by Day, Week, Month, and a custom "from date – to date" range.
- **FR-004**: Each transaction row MUST show the child, service, amount, transaction type, and date.
- **FR-005**: The child details page MUST display a timetable section showing the child's scheduled days/times, each paired with its service and assigned teacher.
- **FR-006**: The child details page MUST show an empty state when a child has no scheduled services.
- **FR-007**: The child details page MUST show an illness/case section; when there is no currently open illness case for the child, it MUST offer an "Add Activity" action instead.
- **FR-008**: An activity entry MUST support a text note and an attached photo or video, uploaded to the nursery's existing Cloudinary media service.
- **FR-009**: Saved activity entries MUST be viewable later, streaming/displaying media directly from Cloudinary, including playback of attached video and display of attached photos.
- **FR-010**: System MUST display, for each child, the total amount already paid and the remaining amount still due, wherever payment totals are shown.
- **FR-011**: System MUST provide a "Calendar" page accessible to both admin and employee roles.
- **FR-012**: The Calendar page MUST show the combined schedule ("time table") of all users across days, with no per-role restriction — both admin and employee roles see the full aggregated schedule for every staff member and child.
- **FR-013**: Clicking a day (or a scheduled entry) on the Calendar page MUST show the users scheduled that day along with their related service and teacher.
- **FR-014**: System MUST continue to support existing illness case workflows unchanged when a case is open for a child.

### Key Entities *(include if feature involves data)*

- **Transaction**: A financial event (charge, payment, or refund) tied to a child, a service, an amount, a type, and a date; the unit shown in the new Transactions tab.
- **Child Timetable Slot**: A scheduled day/time for a child, linked to one service and one assigned teacher.
- **Activity/Diary Entry**: A dated note about a child's day, optionally with one attached photo or video hosted on Cloudinary, shown only when the child has no open illness case.
- **Illness Case**: An existing entity representing an open health issue for a child; its presence suppresses the "Add Activity" option.
- **Calendar Entry**: A scheduled slot for any user (staff/child) on a given day, with associated service and teacher, aggregated for the shared Calendar page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view all transactions for any day, week, month, or custom range in under 5 seconds from opening the Transactions tab.
- **SC-002**: No trace of the "Daily Billing" page or its data remains reachable in the UI or in MongoDB sync after the change ships.
- **SC-003**: Staff can find a child's full timetable (days, services, teachers) on the child details page without leaving that page.
- **SC-004**: 100% of activity diary entries with attached media can be replayed/viewed successfully after saving (excluding failed uploads, which are clearly marked).
- **SC-005**: Staff can see both "paid" and "remaining" amounts for any child in one glance, with the two values always summing to the total due.
- **SC-006**: Any admin or employee can open the Calendar page and identify who is scheduled on a given day, and with which teacher/service, within two clicks.

## Assumptions

- Historical daily-billing records are permanently discarded (not migrated or exported) when the Daily Billing table/collection is removed; the Transactions view starts with no backfilled daily-billing history.
- Photo/video diary media is stored using the nursery's existing Cloudinary media service integration; no new cloud storage provider needs to be introduced. Size/retention limits follow whatever the existing Cloudinary plan/configuration already imposes.
- The Calendar page shows the same fully-aggregated schedule to every role — both admin and employee accounts see all staff and children's time slots, with no per-role filtering of Calendar data.
- "Week" filtering follows the nursery's existing operating week definition already used elsewhere in the app (Saturday–Friday, per regional convention) rather than the ISO Monday–Sunday week.
- Transaction amount/date data is derived from existing payment and billing entities already present in the system (monthly billing, service payments) plus the newly-added activity/diary and timetable data — no new external payment gateway is introduced.
