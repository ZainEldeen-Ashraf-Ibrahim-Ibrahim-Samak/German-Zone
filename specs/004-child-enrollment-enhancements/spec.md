# Feature Specification: Child Enrollment Enhancements

**Feature Branch**: `004-child-enrollment-enhancements`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "when add a child make the phone number of parent max size 11 number; add a photo for the child (open the camera / select device / upload a photo) stored on Cloudinary; show a number index for every child; when adding a new child choose his teacher and the days of his lessons to compute total sessions for the month and calculate his fees, accounting for months of 28/30/31 days (default 8 sessions = 2 days per week, with the ability to add extra lessons); allow the employee to add children; fix the missing inputs in the service calculator while keeping its outputs correct."

## Clarifications

### Session 2026-06-10

- Q: Where should the list of selectable teachers come from when assigning a teacher to a child? → A: Select from the existing Employees list (optionally filtered to those whose role is "teacher").
- Q: How should the system determine the number of billable sessions in a month from the chosen lesson days? → A: Default is always 8 sessions (2 days/week) regardless of month length; only manually added extra lessons change the total.
- Q: Which calculator does the "missing inputs" fix refer to? → A: The Service Distribution Calculator on the Target Planning screen (per-service monthly counts → projected revenue / coverage % / suggested units).
- Q: What exact rule should the guardian phone field enforce? → A: Exactly 11 digits, digits only, must start with "01" (Egyptian mobile); the optional child phone field keeps its current validation.
- Q: Is a child photo mandatory, and how should saving behave when the cloud image service is unreachable? → A: Photo is optional; if upload fails or the service is offline, save the child anyway and allow adding the photo later.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Schedule a child's lessons and auto-calculate monthly fees (Priority: P1)

When enrolling a child, a staff member assigns a teacher and selects the weekday(s) the child attends lessons. The system applies the standard plan of 8 sessions per month (2 days per week) as the default for every month regardless of whether the month has 28, 29, 30, or 31 days, lets the staff member add extra lessons when the month or attendance warrants it, and computes the monthly fee from the resulting session count.

**Why this priority**: This is the core billing-accuracy capability. Today fees are entered as flat service prices; tying fees to an actual lesson schedule and calendar-aware session count is the highest-value change because it directly affects what guardians are charged.

**Independent Test**: Create a child, assign a teacher and two weekly lesson days, pick a month, and confirm the system shows the correct number of sessions for that month and a fee equal to sessions × per-session price; add an extra lesson and confirm the count and fee both increase.

**Acceptance Scenarios**:

1. **Given** a new child is being added, **When** the staff member selects a teacher and two lesson days per week, **Then** the system displays a default of 8 sessions and the corresponding monthly fee.
2. **Given** a child on the standard 8-session plan, **When** the selected month is 28, 29, 30, or 31 days, **Then** the default session count remains 8 unless the staff member adds extra lessons.
3. **Given** a child's standard schedule, **When** the staff member adds one or more extra lessons, **Then** the total session count and the calculated fee increase accordingly.
4. **Given** a child with an assigned teacher, **When** the child record is viewed, **Then** the assigned teacher and lesson days are shown.

---

### User Story 2 - Add a child photo via camera or upload (Priority: P2)

When adding (or editing) a child, a staff member can attach a photo of the child by taking a picture with a connected camera, choosing a camera/capture device, or uploading an existing image file. The photo is stored in the cloud image service (Cloudinary) and shown on the child's record and in the children list.

**Why this priority**: Photos make identification fast and reduce mismatched records, but enrollment and billing work without them, so this ranks below the fee scheduling capability.

**Independent Test**: Add a child, capture or upload a photo, save, and confirm the photo appears on the child's record and persists after reopening the app.

**Acceptance Scenarios**:

1. **Given** the add-child form, **When** the staff member chooses to use the camera, **Then** the system lets them select an available capture device and take a photo.
2. **Given** the add-child form, **When** the staff member uploads an image file, **Then** the chosen image is attached to the child.
3. **Given** a photo has been captured or uploaded, **When** the child is saved, **Then** the photo is stored in the cloud image service and the child's record displays it.
4. **Given** a child with no photo, **When** the record is viewed, **Then** a neutral placeholder is shown instead of a broken image.

---

### User Story 3 - Employees can add children (Priority: P1)

An employee (not only an administrator) can create new child records.

**Why this priority**: This unblocks day-to-day front-desk work; if employees cannot enroll children, the rest of the enrollment improvements have limited reach. It is small in scope but high in operational impact.

**Independent Test**: Sign in as an employee, open the add-child form, create a child, and confirm the record is saved and visible.

**Acceptance Scenarios**:

1. **Given** a signed-in employee, **When** they open the children area, **Then** the "add child" action is available to them.
2. **Given** a signed-in employee, **When** they submit a valid new child, **Then** the child is saved successfully.

---

### User Story 4 - Validated guardian phone number (Priority: P2)

When adding or editing a child, the guardian's phone number must be exactly 11 digits (digits only, starting with `01`), matching the Egyptian mobile-number format.

**Why this priority**: Prevents data-entry errors in a field used to contact guardians, but it is a refinement of an existing field rather than new capability.

**Acceptance Scenarios**:

1. **Given** the add-child form, **When** the staff member types a guardian phone number, **Then** they cannot enter more than 11 digits and only digits are accepted.
2. **Given** a guardian phone number that is not exactly 11 digits or does not start with `01`, **When** the staff member tries to save, **Then** the system shows a validation message and does not save.

---

### User Story 5 - Sequential index number per child (Priority: P3)

Each child is shown with a clear sequential index number in the children list so staff can refer to children by position/number at a glance.

**Why this priority**: A usability convenience; valuable for quick reference but not blocking any workflow.

**Acceptance Scenarios**:

1. **Given** the children list, **When** it is displayed, **Then** every row shows a sequential index number starting at 1.
2. **Given** the list is filtered or sorted, **When** it re-renders, **Then** the index numbers remain consecutive for the rows shown.

---

### User Story 6 - Complete the service calculator inputs (Priority: P3)

The Service Distribution Calculator on the Target Planning screen currently has one or more missing input fields; those inputs are added so every value the calculator's outputs depend on can be entered, while its existing (correct) output calculations (projected revenue, coverage %, suggested units) are preserved unchanged.

**Why this priority**: Improves an existing tool's usability; the outputs already work, so this is a correctness/completeness fix rather than new value.

**Acceptance Scenarios**:

1. **Given** the service calculator, **When** it is opened, **Then** all inputs required to produce its outputs are present and editable.
2. **Given** valid inputs are entered, **When** the calculator runs, **Then** the outputs match the values produced before this change (no regression in calculation results).

---

### Edge Cases

- **Varying month length**: For 28-, 29-, 30-, or 31-day months the baseline stays at 8 sessions; any additional sessions are entered as extra lessons.
- **Mid-month enrollment**: When a child is registered partway through a month, the baseline remains 8 sessions; the staff member adjusts via extra lessons if a partial month should be billed differently.
- **No lesson days selected**: If no lesson days are chosen, the system falls back to the default 8-session plan or prompts the staff member.
- **Offline photo capture**: When the cloud image service is unreachable, the system informs the staff member and allows the child to be saved without a photo (photo can be added later) rather than failing the whole save.
- **Camera unavailable / permission denied**: The form remains usable via file upload when no camera device is accessible.
- **Phone shorter than expected**: A guardian phone with fewer than the required digits is rejected with a clear message.
- **Teacher removed/deactivated**: A child previously assigned to a now-inactive teacher still displays its historical assignment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require the guardian phone number on the add/edit-child form to be exactly 11 digits, digits only, beginning with "01" (Egyptian mobile), and MUST reject any value that does not match; the optional child phone field retains its existing validation.
- **FR-002**: System MUST allow a staff member to attach a child photo by capturing it from a connected camera, by selecting among available capture devices, or by uploading an existing image file.
- **FR-003**: System MUST store child photos in the cloud image service (Cloudinary) and associate the stored image with the child's record.
- **FR-004**: System MUST display the child's photo on the child's record and in the children list, showing a neutral placeholder when no photo exists.
- **FR-004a**: System MUST treat the child photo as optional; when the cloud image service is unreachable or the upload fails, the system MUST still save the child record and allow the photo to be added later.
- **FR-005**: System MUST display a sequential index number for every child in the children list.
- **FR-006**: System MUST allow a staff member to assign a teacher to a child when adding or editing the child, selecting the teacher from the existing Employees list (able to filter to employees whose role is "teacher").
- **FR-007**: System MUST allow a staff member to select the weekday(s) on which the child attends lessons.
- **FR-008**: System MUST default the monthly session count to 8 sessions (equivalent to 2 lesson days per week) for every month regardless of whether the month has 28, 29, 30, or 31 days.
- **FR-009**: System MUST treat any variation caused by month length or attendance as manually added extra lessons rather than auto-recomputing the baseline from the calendar.
- **FR-010**: System MUST allow a staff member to add extra lessons beyond the scheduled sessions, and MUST include those extra lessons in the session count and fee.
- **FR-011**: System MUST calculate the child's monthly fee from the resulting session count and the applicable per-session price.
- **FR-012**: System MUST allow users with the employee role (in addition to admins) to create new child records.
- **FR-013**: System MUST present the assigned teacher and lesson schedule when viewing a child's record.
- **FR-014**: System MUST add the missing input field(s) to the Target Planning Service Distribution Calculator so every value its outputs depend on can be entered by the user.
- **FR-015**: System MUST preserve the Service Distribution Calculator's existing output calculations — projected revenue, coverage %, and suggested units — unchanged (no regression) after the missing inputs are added.
- **FR-016**: System MUST keep all enrollment data (photo reference, teacher, lesson days, session count, fee) consistent with the existing child record and reflected wherever child data is shown.

### Key Entities *(include if feature involves data)*

- **Child**: An enrolled child. Gains a photo reference (cloud image identifier/URL), an assigned teacher, a set of lesson days, a computed monthly session count, and a fee derived from that count. Retains existing attributes (name, guardian, guardian phone, services, registration date).
- **Teacher**: An existing Employee (from the Employees module) who delivers a child's lessons and to whom a child is assigned; the selection list is drawn from employees, optionally filtered to those with the "teacher" role.
- **Lesson Schedule**: The set of weekdays a child attends, plus any extra lessons, used to derive the monthly session count and fee for a specific month.
- **Child Photo**: An image of the child stored in the cloud image service, referenced from the child record.
- **Service Calculator Inputs**: The set of values a staff member enters into the Target Planning Service Distribution Calculator (per-service counts and the reference month) to produce its outputs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any child on the standard plan, the displayed monthly session count equals 8 plus any extra lessons entered, for 100% of months tested (including 28-, 29-, 30-, and 31-day months).
- **SC-002**: The calculated monthly fee equals session count × per-session price (plus any extra lessons) with zero discrepancies in verification testing.
- **SC-003**: A staff member can complete an enrollment that includes a teacher, lesson days, and a photo in under 3 minutes.
- **SC-004**: 100% of guardian phone numbers saved through the form are exactly 11 digits, contain only digits, and start with `01`.
- **SC-005**: Employees can successfully add a child without an administrator, with a 100% success rate for valid submissions.
- **SC-006**: Every child shown in the list carries a unique, consecutive index number with no gaps or duplicates among the displayed rows.
- **SC-007**: The service calculator produces output values identical to the pre-change results for the same scenarios (no calculation regressions).

## Assumptions

- "Cloudinary" in the description refers to the cloud image service used to store child photos; credentials/configuration are available to the application.
- Because the application is offline-capable, photo upload requires connectivity; when offline the child can still be saved and the photo added later (see Edge Cases).
- Guardian phone must be exactly 11 digits beginning with `01` (Egyptian mobile). The existing child phone field keeps its current validation.
- The "default 8 sessions" (2 lesson days per week) is the fixed baseline for every month regardless of length; months that should bill more are handled by manually adding extra lessons.
- Per-session price is derived from existing service/settings pricing already in the system.
- The index number is a display-order reference in the children list, not a stored permanent identifier.
- "Service calculator" refers to the Service Distribution Calculator on the Target Planning screen; only missing inputs are added and outputs are left functionally unchanged.
- Existing role checks are reused; granting employees the ability to add children does not grant other admin-only capabilities.
