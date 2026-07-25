# Feature Specification: Attendance-Based Teacher Payment System

**Feature Branch**: `006-salary-attendance-reports`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Teacher Payment System (Attendance-Based) — redesign teacher salary calculation to be driven by attendance rather than child-assignment counts, with per-teacher session rates, multi-teacher services, automatic payment generation with duplicate protection, a payroll report, and a strategy-based architecture that can support other salary models in the future."

## Clarifications

### Session 2026-07-02

- Q: Can a child have multiple teachers concurrently active for the same service, or only one active teacher per service at a time? → A: One active teacher per child per service at a time; reassigning replaces the prior teacher going forward (past attendance/payments remain tied to whoever held them).
- Q: When an attendance edit makes a previously-generated payment no longer qualify, what happens to that payment record? → A: The record is kept but marked Void/Invalid, excluded from payroll totals while remaining visible for audit.
- Q: What are the valid values for a Teacher Payment's Payment Status field? → A: Pending, Paid, Void — payments are created Pending, an admin marks them Paid during payroll settlement, and disqualifying edits set them to Void.
- Q: Can attendance be recorded for a teacher/child pair with no active assignment on record, or must an assignment already exist? → A: An active assignment between that child and teacher for the service must already exist before attendance can be recorded for them.
- Q: Who can view teacher payment records and the payroll report — admins only, or can employees see their own? → A: Admin-only; employees cannot view payroll totals or any teacher's payment records (including their own) through this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assign a child to a teacher without draining session balance (Priority: P1)

An admin assigns a child to a teacher for a service. Today this incorrectly reduces the teacher's/employee's available session balance just because an assignment happened. The admin needs assignment to be a neutral, informational action — teacher earnings must come only from actual attendance later on.

**Why this priority**: This is the core behavior change the whole feature depends on. If assignment still drains a balance, every other rule (attendance-based pay, previews, payroll totals) will be wrong from day one.

**Independent Test**: Assign several children to a teacher and confirm the teacher's session/employee balance is unchanged immediately after assignment, before any attendance is recorded.

**Acceptance Scenarios**:

1. **Given** a teacher with an existing session balance, **When** an admin assigns a new child to that teacher, **Then** the teacher's session balance remains exactly what it was before the assignment.
2. **Given** a child already assigned to a teacher, **When** the admin views the teacher's balance/session count, **Then** the count reflects only attendance-driven activity, never the number of assigned children.

---

### User Story 2 - Preview expected cost when assigning a child (Priority: P1)

While assigning a child to a teacher for a service, the admin wants to immediately see how many scheduled sessions remain in the current month for that teacher's weekly schedule, and what the expected cost will be at that teacher's per-session rate, so they can make an informed assignment decision.

**Why this priority**: This preview is the main new piece of visible functionality admins interact with directly, and it depends on the remaining-sessions calculation that other parts of the system (payroll estimates) will reuse conceptually.

**Independent Test**: Pick a teacher with a known weekly schedule and per-session rate, assign a child mid-month, and verify the displayed remaining-session count and expected cost match a manual calculation of remaining scheduled weekdays multiplied by the rate.

**Acceptance Scenarios**:

1. **Given** a teacher scheduled for specific weekdays and a known per-session cost, **When** an admin begins assigning a child to that teacher partway through a month, **Then** the system displays the count of remaining scheduled sessions between today and the end of the current month, and the resulting expected cost (remaining sessions × rate).
2. **Given** the last scheduled weekday of the month has already passed, **When** an admin assigns a child near month-end, **Then** the system shows zero remaining sessions and zero expected cost for the current month without error.
3. **Given** this is a preview, **When** the admin completes or cancels the assignment, **Then** no payment record or balance change is created purely from viewing or confirming the preview — only the assignment itself is saved.

---

### User Story 3 - Configure a per-teacher session rate (Priority: P1)

An admin sets each teacher's own "per session cost" in that teacher's settings, since different teachers are paid different amounts per session.

**Why this priority**: Every cost preview, payment amount, and payroll total depends on this per-teacher rate existing and being used consistently.

**Independent Test**: Set two different per-session rates on two teachers, generate attendance-based payments for both, and confirm each payment uses its own teacher's rate.

**Acceptance Scenarios**:

1. **Given** a teacher's settings screen, **When** an admin enters or updates the per-session cost, **Then** the new rate is saved and used for all subsequent expected-cost previews and payment calculations for that teacher.
2. **Given** two teachers with different per-session rates assigned to the same service, **When** a child attends sessions with each, **Then** each generated payment uses the rate belonging to the teacher who actually held that session.

---

### User Story 4 - Assign any of several teachers offering the same service (Priority: P2)

A service (e.g., Speech Therapy) can be delivered by multiple teachers. When creating or editing a child's enrollment, the admin picks which of those teachers is assigned, and that teacher's own rate applies.

**Why this priority**: Needed for services with more than one qualified teacher, but the single-teacher-per-service case already works once User Stories 1-3 are done; this extends flexibility rather than being foundational.

**Independent Test**: Configure a service with three teachers attached, assign a child to each of two different teachers for that same service (either concurrently for different children, or by reassignment for the same child), and confirm each assignment correctly reflects the chosen teacher and rate.

**Acceptance Scenarios**:

1. **Given** a service with multiple teachers configured, **When** an admin creates or edits a child's enrollment in that service, **Then** the admin can choose any of the service's teachers.
2. **Given** a child assigned to Teacher A for a service, **When** the admin changes the assignment to Teacher B for the same service, **Then** future previews and payments use Teacher B's rate, and past attendance/payment records tied to Teacher A remain unchanged.

---

### User Story 5 - Record attendance and generate teacher payments automatically (Priority: P1)

Whenever an admin/staff member records attendance for a child's session (teacher status and child status, plus excuse type if the child was absent), the system automatically determines whether the teacher earned a payment for that session and creates the payment record with no extra manual step.

**Why this priority**: This is the payment engine's core trigger and the primary value of the whole feature — correct, automatic, fair payment generation from real attendance.

**Independent Test**: Record each of the five attendance combinations (teacher present/child present, teacher present/child absent-unexcused, teacher present/child absent-excused, teacher absent/child present, teacher absent/child absent) and confirm a payment is generated only for the first two cases, at the correct per-session amount, and never for the other three.

**Acceptance Scenarios**:

1. **Given** teacher present and child present, **When** attendance is saved, **Then** a teacher payment equal to that teacher's per-session rate is generated for that date/child/teacher.
2. **Given** teacher present and child absent without an excuse, **When** attendance is saved, **Then** a teacher payment is generated for that date/child/teacher.
3. **Given** teacher present and child absent with an excused absence, **When** attendance is saved, **Then** no teacher payment is generated.
4. **Given** teacher absent (regardless of child status), **When** attendance is saved, **Then** no teacher payment is generated.
5. **Given** attendance is saved, **When** the payment engine runs, **Then** the resulting record shows whether a payment was generated and, if so, the amount, without requiring any admin action beyond saving attendance.

---

### User Story 6 - Prevent duplicate payments on attendance edits (Priority: P1)

If an admin edits an already-saved attendance record (e.g., corrects a status), the system must never end up with more than one payment for the same teacher, child, and date — edits should re-evaluate the single payment for that combination, not create a second one.

**Why this priority**: Without this guarantee, correcting a mistake in attendance could silently duplicate teacher pay, which is a direct financial-integrity risk — it must ship alongside automatic generation, not after.

**Independent Test**: Save an attendance record that generates a payment, edit that same attendance record multiple times (including toggling between qualifying and non-qualifying states), and confirm at most one payment ever exists for that teacher/child/date combination, with its status reflecting the latest qualifying edit.

**Acceptance Scenarios**:

1. **Given** an attendance record that already generated a payment, **When** the admin edits that attendance record and it still qualifies for payment, **Then** the existing payment for that teacher/child/date is reused or updated — a second payment is never created.
2. **Given** an attendance record that generated a payment, **When** the admin edits it so it no longer qualifies (e.g., changes to an excused absence), **Then** the previously generated payment for that teacher/child/date no longer counts toward payroll totals.
3. **Given** an attendance record that did not qualify for payment, **When** the admin edits it so it now qualifies, **Then** exactly one payment is created for that teacher/child/date.

---

### User Story 7 - Review attendance history per child and per session (Priority: P2)

Admins and staff can see, at a glance, the full attendance/payment picture: an attendance list showing teacher status, child status, absence type, whether a payment was generated, and its amount, plus a per-child profile page listing that child's complete attendance history with the same detail.

**Why this priority**: Important for transparency and dispute resolution, but it is a read-only view built on data already produced by Stories 5-6, so it can follow the core payment engine.

**Independent Test**: After generating a mix of qualifying and non-qualifying attendance records for a child, open the attendance screen and the child's profile and confirm both display matching teacher/child status, absence type, payment-generated flag, and amount for every record.

**Acceptance Scenarios**:

1. **Given** attendance records exist for a date range, **When** an admin opens the attendance screen, **Then** each row shows child, teacher, date, teacher status, child status, absence type, whether a payment was generated, and the payment amount.
2. **Given** a child has an attendance history, **When** an admin opens that child's profile, **Then** a complete history is shown with attendance date, assigned teacher, teacher status, child status, excused/not, payment generated, and session cost.

---

### User Story 8 - Generate a monthly payroll report (Priority: P2)

At the end of the month, an admin generates a payroll report summarizing, per teacher, the total number of sessions paid, that teacher's session cost, and the resulting total salary for the period.

**Why this priority**: This is the payoff view for admins running payroll, but it is a rollup of data produced by Stories 5-6 and can be delivered once those are stable.

**Independent Test**: Generate a month's worth of attendance producing a known number of paid sessions for a teacher at a known rate, run the payroll report for that month, and confirm the reported sessions-paid count and total salary match the expected values.

**Acceptance Scenarios**:

1. **Given** a month with a mix of qualifying and non-qualifying attendance across several teachers, **When** an admin generates the payroll report for that month, **Then** each teacher's row shows their name, total sessions paid, their session cost, and total salary (sessions paid × session cost).
2. **Given** a teacher with no qualifying sessions in the selected month, **When** the payroll report is generated, **Then** that teacher appears with zero sessions paid and zero salary (or is clearly excluded, per the report's stated scope).

---

### Edge Cases

- What happens when a teacher's per-session rate is changed after payments for the current month have already been generated? (Existing generated payments should keep the rate that was in effect when they were generated; only future payments use the new rate.)
- What happens when a child is assigned to a teacher whose weekly schedule has zero occurrences left in the current month (e.g., assigned on the last scheduled day, after it has passed)? (Preview shows zero remaining sessions / zero expected cost.)
- What happens when someone attempts to record attendance for a teacher/child pair with no active assignment on record? (The system MUST reject it and require an active assignment to exist first, since the assignment is what determines which teacher's rate applies.)
- What happens when an attendance record is deleted entirely rather than edited? (Any payment tied to that teacher/child/date is marked Void, consistent with the disqualifying-edit behavior, rather than being deleted.)
- What happens at a month boundary for the payroll report — is a session attributed to the month of the attendance date? (Yes, sessions are attributed to the calendar month of the attendance date.)
- What happens when two different children see the same teacher on the same date — are these separate payments? (Yes; duplicate protection is scoped to teacher + child + date, not teacher + date alone, since each child's session is a separate payable event.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT decrease a teacher's/employee's session balance as a result of assigning a child to that teacher; assignment MUST be balance-neutral.
- **FR-002**: When an admin assigns a child to a teacher, the system MUST automatically calculate the number of that teacher's scheduled weekly sessions remaining between the current date and the end of the current calendar month.
- **FR-003**: The system MUST calculate and display an expected cost (remaining sessions × the teacher's per-session rate) at the moment of assignment, for preview purposes only, without persisting this calculation as a payment or balance change.
- **FR-004**: The system MUST allow an admin to set and update a per-session cost value independently for each teacher, stored in that teacher's settings.
- **FR-005**: The system MUST use each teacher's own current per-session rate whenever calculating a preview or generating a payment for sessions held by that teacher.
- **FR-006**: The system MUST allow a service to have more than one teacher associated with it.
- **FR-007**: When creating or editing a child's enrollment in a service, the admin MUST be able to choose which of the service's associated teachers is assigned; a child MUST have exactly one active teacher per service at a time, and choosing a different teacher replaces the prior one going forward without altering past attendance/payment records.
- **FR-008**: The system MUST generate a teacher payment for a session when the teacher's attendance status is Present and the child's attendance status is Present.
- **FR-009**: The system MUST generate a teacher payment for a session when the teacher's attendance status is Present and the child's attendance status is Absent with no excuse (unexcused).
- **FR-010**: The system MUST NOT generate a teacher payment for a session when the teacher's attendance status is Present and the child's attendance status is Absent with an excused absence.
- **FR-011**: The system MUST NOT generate a teacher payment for a session when the teacher's attendance status is Absent, regardless of the child's attendance status.
- **FR-012**: Each attendance record MUST capture: child, teacher, date, teacher status (Present/Absent), child status (Present/Absent), absence type (None/Excused/Unexcused), whether a payment was generated, and the payment amount.
- **FR-012a**: The system MUST reject attempts to record attendance for a child/teacher pair that has no active assignment for the relevant service.
- **FR-013**: The system MUST automatically evaluate the payment rules and create a teacher payment record immediately whenever an attendance record is saved, with no separate manual trigger required.
- **FR-014**: Each generated teacher payment record MUST capture: teacher, child, attendance date, session cost (rate at time of generation), payment status (Pending, Paid, or Void), and creation timestamp.
- **FR-015**: The system MUST ensure at most one payment record ever exists for a given combination of teacher, child, and attendance date, even when the underlying attendance record is edited multiple times.
- **FR-016**: When an edited attendance record no longer meets the payment-eligibility rules, the system MUST mark the previously generated payment for that teacher/child/date as Void/Invalid — excluding it from payroll totals while keeping the record visible for audit — rather than deleting it.
- **FR-017**: When an edited attendance record newly meets the payment-eligibility rules (having not qualified before), the system MUST generate exactly one payment for that teacher/child/date.
- **FR-018**: The system MUST provide an attendance screen listing records with child, teacher, date, teacher status, child status, absence type, payment-generated flag, and payment amount.
- **FR-019**: Each child's profile MUST display a complete attendance history including attendance date, assigned teacher, teacher status, child status, excused/not indicator, payment-generated flag, and session cost.
- **FR-020**: The system MUST provide a monthly payroll report listing, per teacher: teacher name, total sessions paid, session cost, and total salary for the selected month.
- **FR-021**: The payment calculation logic MUST be structured so that additional salary calculation methods (e.g., fixed monthly, per-child, hourly, percentage-based, bonuses/deductions) can be added later without modifying the existing per-session calculation logic.
- **FR-022**: Access to teacher settings (per-session rate), attendance recording, teacher payment records, and payroll reports MUST be restricted to the admin role; employees (including teachers) MUST NOT be able to view payroll totals or any payment records, including their own, through this feature.

### Key Entities

- **Teacher (Employee)**: A staff member who delivers sessions; has a weekly schedule (which weekdays they hold sessions), a per-session cost/rate, and services they can teach. Session/attendance balance is no longer decremented by child assignment.
- **Service**: A type of session offered (e.g., Speech Therapy) that can be associated with one or more Teachers, each with their own independent rate.
- **Child Enrollment / Assignment**: The link between a Child and the Teacher assigned to deliver a given Service to them; changeable over time without retroactively altering past attendance or payment records.
- **Attendance Record**: One dated occurrence of a child's session with a specific teacher, capturing teacher status, child status, absence type, whether a payment was generated, and the payment amount.
- **Teacher Payment**: A financial record representing money owed to a teacher for one attendance occurrence, uniquely keyed by teacher + child + attendance date, carrying the session cost applied, payment status, and creation timestamp.
- **Payroll Report**: A monthly, per-teacher summary aggregating total sessions paid, session cost, and total salary from Teacher Payment records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After assigning any number of children to a teacher, that teacher's session/employee balance is unaffected — a before/after comparison shows 0 change purely from assignment.
- **SC-002**: When assigning a child to a teacher, the remaining-sessions and expected-cost preview appears immediately (no separate step or page load) and matches a manual calculation in 100% of tested scenarios.
- **SC-003**: 100% of generated teacher payments match the expected outcome for their attendance case (paid for Case 1 and Case 2, unpaid for Cases 3-5) across a full test sweep of the five defined attendance combinations.
- **SC-004**: Editing an attendance record any number of times never results in more than one payment existing for the same teacher/child/date combination.
- **SC-005**: A generated monthly payroll report's total-sessions-paid and total-salary figures for each teacher match a manual recount of that teacher's qualifying attendance records for the same month, with zero discrepancies.
- **SC-006**: Admins can view a child's complete attendance/payment history from that child's profile without navigating to a separate module.
- **SC-007**: A new salary calculation method can be introduced in the future without requiring changes to already-shipped per-session payment records or logic (validated by the payment engine's modular design, not by building the new method now).

## Assumptions

- "End of the current month" means the last calendar day of the month in which the child is being assigned, using the system's local/organization time zone.
- A teacher's weekly schedule (which weekdays they hold sessions) already exists or is captured as part of teacher setup; this feature relies on that schedule but does not redefine how it is entered.
- The five attendance-based payment cases described are exhaustive for the per-session strategy; no additional attendance states (e.g., "late," "partial") are in scope for this feature.
- The payroll report scope is a single calendar month at a time, selected by the admin; cross-month or custom date-range payroll reporting is out of scope for this feature.
- Existing historical payments/balances created under the old assignment-based deduction system are not retroactively recalculated; this feature governs behavior going forward.
