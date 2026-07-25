# Quickstart: Attendance-Based Teacher Payment System

Manual verification steps once implementation is complete. Assumes the dev app is running (`npm run dev`)
against a local SQLite DB that has run migrations through `029_teacher_payments`.

## 1. Configure a teacher's per-session rate

1. Sign in as admin → Employees → open a teacher (e.g., "Ahmed") → set **Per Session Cost** to `150` → Save.
2. Repeat for a second teacher ("Sara") with `250`.
3. Confirm `employees:get` (via UI) shows both rates persisted after a reload.

## 2. Attach multiple teachers to a service

1. Settings → Service Definitions → open "Speech Therapy" (or any service) → assign teachers Ahmed, Sara,
   Mohamed via the new teacher-list control.
2. Confirm `serviceTeachers:list` for that service returns all three.

## 3. Assign a child and see the live preview

1. Children → open/create a child → Enrollment: pick the service from step 2, choose Ahmed as the teacher,
   set lesson days to e.g. Saturday + Monday.
2. Confirm a preview appears immediately showing remaining sessions until end of month and expected cost
   (`remaining_sessions × 150`), without saving anything yet.
3. Save the enrollment. Confirm no employee/session balance anywhere decreased because of this action.

## 4. Record attendance and verify the five payment cases

For the same child/teacher pair, record attendance on five different dates (or edit repeatedly) covering:

| Teacher | Child | Expected |
|---|---|---|
| Present | Present | Payment generated, amount = teacher's rate |
| Present | Absent, no excuse | Payment generated |
| Present | Absent, excused | No payment |
| Absent | Present | No payment |
| Absent | Absent | No payment |

Confirm the attendance screen row shows the correct "Generated Payment" flag and amount for each.

## 5. Edit attendance — duplicate protection

1. Take the "Present/Present" record from step 4 and re-save it unchanged three times.
2. Query `teacherPayments:list({ teacher_id, child_id })` — confirm exactly one row exists for that date.
3. Edit it to "Present/Absent, excused" → confirm the existing row's status becomes `void` (not deleted,
   not duplicated).
4. Edit it back to "Present/Present" → confirm exactly one row exists again, now `pending`.

## 6. Child profile attendance history

1. Open the child's profile → Attendance History tab.
2. Confirm every attendance date from steps 4–5 appears with teacher, teacher status, child status,
   excused/not, payment-generated flag, and session cost.

## 7. Payroll report

1. Generate enough attendance across the month to reach a known number of qualifying sessions for Ahmed.
2. Settings/Salaries → Payroll Report → select the current month.
3. Confirm Ahmed's row shows `sessions_paid`, `session_cost` (150), and `total_salary = sessions_paid × 150`
   matching a manual count.

## 8. Access control

1. Sign in as a non-admin employee.
2. Confirm the Payroll Report and Teacher Payments views are not accessible, and `payroll:report` /
   `teacherPayments:list` throw an authorization error if invoked directly.
