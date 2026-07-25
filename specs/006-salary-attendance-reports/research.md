# Phase 0 Research: Attendance-Based Teacher Payment System

All items below were resolved by reading the existing codebase (migrations 001–025, `attendanceIPC.ts`,
`sessionsIPC.ts`, `salariesIPC.ts`, `salaryTypesIPC.ts`, `childServicesIPC.ts`, `teachersIPC.ts`,
`src/types/index.ts`) rather than left as open unknowns — this is a brownfield feature on a codebase that
already implements adjacent pieces (a session/attendance model, a strategy-shaped `salary_types` engine).
No NEEDS CLARIFICATION items remain.

## 1. Does the "session balance decreases on assignment" bug exist today?

**Decision**: No literal balance-decrement code path exists. `sessions_baseline` (children table) is the
*child's* monthly session count used only for the child's own billing (`monthly_fee` calc in
`childrenIPC.ts`); it has nothing to do with a teacher/employee balance. Teacher pay is already computed
in `salariesIPC.ts` from attendance (`payableSessions` = count of sessions where the employee is in
`session_teachers` and at least one attendance record is `attended`/`absent_unexcused`), not from how many
children are assigned to them.

**Rationale**: FR-001 ("assignment must not drain a balance") is therefore already structurally satisfied
by the current payroll engine. The real gap is elsewhere: today's `session_teachers` table has no
present/absent concept for the teacher — a teacher is either linked to a session or not, with no per-child
teacher-attendance signal, and no dedicated "Teacher Payment" record exists (payroll is calculated on the
fly, not stored per session).

**Alternatives considered**: Rewriting a "balance" concept that doesn't exist — rejected, would add
complexity chasing a non-existent bug. Instead this feature adds the missing pieces: teacher attendance
status, a per-teacher session rate, a dedicated `teacher_payments` ledger, and duplicate protection —
while leaving the existing `salary_types` monthly-payroll engine (fixed/per-session/hybrid) untouched, since
it already fulfills the general strategy-based salary requirement (FR-021) for non-per-session modes.

## 2. Where does per-session "teacher attendance" live?

**Decision**: Add `attended_teacher_id` and `teacher_status` columns directly on `attendance_records`,
captured at the moment attendance is saved for a child (snapshotting whichever teacher was actually
assigned to that child/service at that time via `child_services.teacher_id`). This decouples the payment
engine from the session-level `session_teachers` roster (which today is a simple "who touched this
session" list with no per-child granularity) and matches the spec's per (child, teacher, date) attendance
model exactly.

**Rationale**: A single `scheduled_sessions` row can be a group session covering several children who each
have their own assigned teacher (per FR-006/FR-007, and possibly different teachers for the same service).
The teacher's presence must be tracked per child's attendance row, not per session, or a group session with
one absent co-teacher would incorrectly zero out payment for every child in that session.

**Alternatives considered**: A separate `session_teacher_attendance` table keyed by (session_id,
employee_id) — rejected because it re-introduces the group-level ambiguity above when two teachers serve
different children in the same session slot.

## 3. Where does the per-teacher session rate live?

**Decision**: Add `employees.teacher_session_rate REAL` (nullable). This is a new, independent field shown
under "Teacher Settings" per FR-004, distinct from `salary_types.session_rate`.

**Rationale**: `salary_types.session_rate` belongs to a shared salary-type row (e.g., "Speech Therapist"
salary type) and drives the employee's *own monthly payroll total* via the existing
`fixed_monthly / per_session_fixed / per_session_pct / hybrid` engine. The new field is a distinct concept:
the rate a specific teacher earns *per child session actually taught*, feeding a separate
`teacher_payments` ledger described in the spec (Teacher, Child, Attendance Date, Session Cost, Payment
Status). Conflating the two would force every teacher onto a dedicated 1:1 salary type and break the
existing shared salary-type model used by non-teaching roles.

**Alternatives considered**: Reusing `salary_type_override_id` per teacher — rejected; too heavy for a
single numeric field and would entangle this feature's payments with the unrelated monthly-payroll engine.

## 4. How does a service support multiple teachers, with one active teacher per child?

**Decision**: New join table `service_teachers (service_id, employee_id)` lists which teachers may deliver
a given `service_definitions` row. `child_services.teacher_id` (already exists since migration 024)
continues to hold the *single currently active* teacher for that child's enrollment in that service,
constrained in the IPC layer to teachers present in `service_teachers` for that service (falls back to
"any active employee" if the service has no configured teacher list, to avoid breaking existing data).

**Rationale**: Matches the clarified answer (one active teacher per child per service; reassigning
replaces the prior one). `service_teachers` is the natural place to enumerate "who can teach Speech
Therapy" without touching the existing `child_services` structure.

## 5. How is "remaining sessions this month" calculated for the preview?

**Decision**: Reuse the weekday-matching approach already used by `sessions:childrenForDay` and the
`attendance:getSheet` day-of-week filter: parse `child_services`-scoped `lesson_days` (JSON array of
0–6 weekday numbers, already stored on `children`/`child_services`) and count matching calendar dates from
today (inclusive) through the last day of the current month. Expose as a new IPC
`childServices:previewTeacherCost({ teacher_id, lesson_days })` that returns
`{ remaining_sessions, expected_cost }` using `employees.teacher_session_rate`. Pure computation, no writes
— satisfies FR-003's "preview only" requirement.

**Rationale**: The exact date-counting logic (local-date parsing to avoid UTC shift, as already done in
`attendanceIPC.ts`) is proven in this codebase; reusing it avoids a second, possibly inconsistent
implementation of "which weekdays remain this month."

**Alternatives considered**: Extending `sessions:proRateCalc` (used for child billing pro-ration) —
rejected; that endpoint answers a different question (pro-rated child fee from `reg_date`), and overloading
it with a teacher-cost-preview responsibility would conflate two unrelated calculations.

## 6. Teacher Payment ledger shape and duplicate protection

**Decision**: New table `teacher_payments` with `UNIQUE(teacher_id, child_id, attendance_date)` — the
database itself is the duplicate-protection mechanism (FR-015), not application-level checks alone. Rows
are upserted (`INSERT ... ON CONFLICT DO UPDATE`) from inside the same transaction that
`attendance:record` already uses.

**Rationale**: A UNIQUE constraint is the strongest guarantee against duplicate payments surviving
concurrent edits or retried IPC calls; app-level "check then insert" logic is race-prone even in a
single-process SQLite app if attendance is ever recorded from multiple renderer windows.

## 7. Payment Status semantics (Pending / Paid / Void)

**Decision** (per clarification session): payments are created `pending`; an admin transitions a payment to
`paid` during payroll settlement (new `teacherPayments:markPaid` IPC, admin-only); an attendance edit that
disqualifies a previously-payable record flips its `teacher_payments` row to `void` **only if it is still
`pending`** — a `paid` row is left untouched by automatic re-evaluation (it must be reversed manually by an
admin) so a settled payroll run is never silently rewritten by a later attendance correction.

**Rationale**: Protects financial audit integrity (an admin who already paid a teacher should not have that
record silently vanish because someone edited attendance weeks later) while still satisfying "no manual
action required" for the common case (same-day corrections before payroll runs).

## 8. Payroll report aggregation

**Decision**: `payroll:report({ month, year })` sums `teacher_payments.session_cost` (the rate captured at
generation time, not the teacher's *current* rate) grouped by `teacher_id`, for `status IN ('pending',
'paid')` (Void rows excluded). The report's "Session Cost" column displays the teacher's current
`teacher_session_rate` for readability; "Total Salary" is the summed `session_cost` column so a mid-month
rate change is reflected correctly (per the spec's edge case).

**Rationale**: Matches SC-005 (report must reconcile with a manual recount of qualifying attendance) and
the edge case about rate changes not retroactively altering already-generated payments.

## 9. Access control

**Decision**: All new/changed teacher-payment and payroll endpoints (`teacherPayments:*`, `payroll:report`,
`employees:update` for `teacher_session_rate`, `serviceTeachers:*`) use the existing `requireAdmin()` guard
from `electron/ipc/_guard.ts`. `attendance:record`/`attendance:getSheet` keep their existing `checkAuth`
(teacher-scoped) behavior — recording attendance is unchanged in who may do it; only *viewing payment
amounts/payroll* is admin-only, per the clarification answer.

**Rationale**: Reuses the codebase's existing admin/employee guard pattern (`_guard.ts`) rather than
inventing a new authorization mechanism.

## 10. Migration numbering

**Decision**: Continue the existing sequential, additive, idempotent migration pattern
(`electron/db/migrations/index.ts`) starting at `026` (last existing is `025_child_services_drop_unique`).
New migrations: `026_service_teachers`, `027_teacher_session_rate`, `028_attendance_teacher_status`,
`029_teacher_payments`. All use guarded `ALTER TABLE ... ADD COLUMN` (try/catch) and `CREATE TABLE IF NOT
EXISTS`, consistent with every prior migration in this file.
