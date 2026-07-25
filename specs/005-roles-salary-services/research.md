# Phase 0 Research: Dynamic Roles, Salary Configuration & Service Enhancements

All decisions resolved through spec clarification session (2026-06-26) and codebase inspection.

---

## R1 — Session Scheduling Model

**Decision**: Sessions are individually pre-created records with a specific date, linked service, and assigned teacher(s). Attendance is recorded per-child per-session.

**Rationale**: Required for accurate pro-rating (count remaining sessions from reg_date) and attendance-based salary (exclude excused absences). A simple "sessions per month count" cannot distinguish which sessions fall before vs after a mid-month enrollment date.

**Alternatives considered**: Monthly session count with ratio-based pro-rating — rejected because it produces inaccurate results when sessions are distributed unevenly across the month.

---

## R2 — Salary Type Resolution

**Decision**: Each `employee_role` stores a default `salary_type_id`. Individual employees may override it with their own `salary_type_id`. Resolution at calculation time: employee override if set, otherwise role default.

**Rationale**: Most employees in a role share the same salary structure. Per-employee override handles exceptions (e.g., a senior therapist on a different rate) without creating a new role.

**Alternatives considered**: (A) Per-employee only — too much admin work for large rosters. (B) Per-role only — too inflexible for individual exceptions.

---

## R3 — Role Migration Strategy

**Decision**: Migration `014` automatically scans `employees.role` for all unique string values, inserts each as a row in the new `employee_roles` table, then sets `employees.role_id` to the matching new row. The migration is idempotent (`INSERT OR IGNORE`). Migrated roles have `salary_type_id = NULL` and are flagged in the UI until the admin assigns a salary type.

**Rationale**: Zero-downtime migration with no data loss and no admin action required. The original `employees.role` TEXT column is kept (read-only fallback) so existing queries don't break until explicitly updated.

**Alternatives considered**: (B) Clear and reassign — unacceptable; leaves the system unusable until admin manually fixes every employee. (C) Legacy read-only field — creates dual-state complexity indefinitely.

---

## R4 — Pro-Rated Amount Override

**Decision**: The system calculates the pro-rated first payment as `(count of scheduled_sessions WHERE session_date >= child.reg_date AND session_date <= last day of billing period) × per-session price`. This value is shown to the admin in a confirmation step before the payment is saved. The admin can edit the displayed amount. Both the system-calculated value (`prorated_calculated`) and the admin-confirmed value (`price` in the payment) are stored for audit.

**Rationale**: Nursery centres frequently apply negotiated goodwill discounts for new families. Showing the calculated amount as a starting point prevents mistakes while allowing flexibility.

**Alternatives considered**: (B) Confirmation-only, non-editable — rejected as too rigid; requires the admin to cancel, edit the enrollment date, and retry to work around edge cases.

---

## R5 — Attendance Conflict Resolution

**Decision**: Last-write-wins by `updated_at` ISO timestamp. Any sync operation that overwrites a previously-synced `attendance_records` row creates a row in `attendance_conflicts` (stores both old and new values, users, timestamps). Admin views a conflict review list and may manually correct the final status.

**Rationale**: Full manual-merge UI is expensive to build and rarely needed in practice (two people recording attendance for the same child in the same session simultaneously is an edge case). The conflict log provides auditability and recovery without blocking sync.

**Alternatives considered**: (A) Silent last-write-wins — rejected; no recovery path if an incorrect value overwrites a correct one. (C) Manual merge required — blocks sync completion; unacceptable for offline-first workflow.

---

## R6 — Service Definitions Storage

**Decision**: A new `service_definitions` table becomes the single source of truth for all service pricing (built-in and custom). Migration `015` seeds built-in services (Nursery, Hosting, Session) from the current `settings` key-value pairs. `PricingSettings.tsx` is updated to read/write built-in service prices through the new `serviceDefinitions:*` IPC channels. The legacy `settings` keys (`nursery_monthly`, etc.) are kept as a fallback for read-only backward compat during the transition but are no longer written.

**Rationale**: The key-value settings table cannot represent per-service named records with three independent price fields. A dedicated table is required for custom service management, and unifying built-ins into the same table avoids dual-source-of-truth.

**Alternatives considered**: Store custom services in settings as JSON blobs under a new key — rejected; unstructured, unsyncable as discrete records, hard to query.

---

## R7 — Photo Upload Bug Root Cause

**Decision**: The `storage:uploadPhoto` IPC handler (added in feature 004) is implemented correctly in `electron/ipc/storageIPC.ts`. The bug is in `src/pages/Children/ChildForm.tsx`: the upload is either not awaited before `children:add`/`children:update` is called, or the returned `{ url, publicId }` is not wired back into the child payload. Fix: ensure `storage:uploadPhoto` is awaited, and its result's `url` and `publicId` are passed as `photo_url` and `photo_public_id` in the child save call.

**Rationale**: The IPC handler exists and is typed; the form preview works (confirming the file is selected); the child record saves without the URL (confirming the URL isn't passed). The failure must be in the form's save sequence.

---

## R8 — Enrollment Form 0-Price Bug

**Decision**: When the admin selects a service and billing period (monthly/daily/hourly) in the child enrollment form, the price field should auto-populate from `service_definitions`. Currently the price is not re-fetched on type/service change — it either stays at its last value or defaults to 0.

**Fix**: `ChildForm.tsx` should maintain local state of loaded `service_definitions` (fetched once on mount via `serviceDefinitions:list`). When service or billing type changes, derive the correct price from the local cache and set it into the price field immediately.

---

## R9 — Additional Classes Display Bug

**Decision**: Currently `monthly_fee = sessions_baseline × session_price + extra_lessons × session_price` is displayed as a single number. The display should be broken into labeled lines: base service subscription amount (from `child_services.price`) + additional classes line (`extra_lessons × session_price`) = total.

**Fix**: The enrollment summary component should receive both the base service price and the additional class parameters separately and render them as a two-line breakdown.
