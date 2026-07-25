# Phase 0 Research: Transactions Timeline, Child Diary & Staff Calendar

All Technical Context items were resolvable from the existing codebase and the spec's Clarifications session; no items remain marked NEEDS CLARIFICATION.

## 1. Source of "Transactions" data after Daily Billing removal

- **Decision**: Transactions are read from the existing `payments` table (joined to `child_services` and `children`), not from a new ledger table. Each `payments` row already represents a charge/payment event tied to a child + service + date.
- **Rationale**: The spec's Transactions tab must show "what happened" financially per period; the codebase already records every payment event in `payments` with `created_at`/`payment_date` columns. Introducing a second, redundant transactions table would duplicate data and create a second source of truth.
- **Alternatives considered**: A dedicated `transactions` table populated by triggers/hooks on every payment write — rejected as unnecessary duplication for a read-mostly filtering feature; a plain SQL `WHERE date BETWEEN` query against `payments` satisfies the range-filter requirement directly.

## 2. Week boundary definition

- **Decision**: A "week" is Saturday through Friday, matching the nursery's existing operating-week convention (already assumed/used elsewhere in reporting features, per Assumptions in spec.md).
- **Rationale**: Consistency with existing week-based reports in `006-salary-attendance-reports` avoids confusing staff with two different week definitions in the same app.
- **Alternatives considered**: ISO Monday–Sunday week — rejected, doesn't match regional/business convention already assumed elsewhere in the app.

## 3. Media storage for the child activity diary

- **Decision**: Reuse `electron/services/cloudinaryService.ts`. Extend it with an `uploadVideo` function using Cloudinary's signed-upload pattern with `resource_type: 'video'`, mirroring the existing `uploadImage` function exactly (same signature scheme, same folder-based organization, e.g. `nursery/children/{childId}/activities`).
- **Rationale**: Cloudinary is already configured and used in production for child photos (`uploadImage`); the user confirmed during clarification that this existing Cloudinary integration should be reused rather than adding a new provider.
- **Alternatives considered**: Storing media as local files - rejected, doesn't support cross-device access consistent with the rest of the app's Mongo-synced, multi-device model; a different cloud SDK - rejected, no need to add a new dependency when the existing signed-REST-call pattern already supports arbitrary `resource_type`.

## 4. Child timetable source

- **Decision**: Build the timetable view from existing `child_services` columns (`teacher_id`, `lesson_days`, `service` name) joined with `service_teachers` for services with multiple assigned teachers, rather than creating a new timetable table.
- **Rationale**: `child_services` already stores per-enrollment teacher assignment and lesson days (added in migration `024_child_services_teacher_days`); no new schema is needed to answer "which days/teacher/service is this child scheduled for."
- **Alternatives considered**: A dedicated `child_timetable` table — rejected as redundant with data already captured on `child_services`.

## 5. Illness case vs. activity diary toggle

- **Decision**: Introduce a new `child_activities` table (note, optional media URL/type, `activity_date`, `child_id`, `synced`). The child details page queries for an "open" illness case (a concept that does not exist yet in the schema, so a minimal `child_illness_cases` table is added alongside `child_activities` with a `status` of `open`/`resolved`); when no `open` row exists for the child, the UI shows "Add Activity" instead of the illness form.
- **Rationale**: Spec explicitly separates the "illness case" concept from the new "activity" concept and says activity entry is only offered when illness is empty — this requires a first-class illness-case status the app can query, since no such entity currently exists in the codebase.
- **Alternatives considered**: Overloading `child_activities` with an `is_illness` flag — rejected as it conflates two independently-lifecycled concepts (a case that opens/closes vs. a diary entry that's just a point-in-time note) and would complicate the "if empty" empty-state check.

## 6. Calendar aggregation

- **Decision**: `calendarIPC.ts` computes a read-only aggregation on demand (no new persisted table) by combining `child_services` (lesson_days/teacher) and `scheduled_sessions`/`session_teachers` for a given month, grouped by day. Drill-down for a specific day filters that same in-memory/query result set.
- **Rationale**: All underlying schedule data already exists across `child_services` and `scheduled_sessions`/`session_teachers`; a materialized calendar table would need constant invalidation as schedules change. A query-time aggregation avoids a second source of truth and stays consistent by construction.
- **Alternatives considered**: Persisting a denormalized `calendar_entries` table refreshed on every schedule change — rejected as added complexity or staleness risk with no offsetting performance need at this scale (≤300 children, ≤30 staff).

## 7. Paid vs. remaining balance display

- **Decision**: Compute `remaining = total_due - total_paid` from existing `payments`/`child_services` price data at read time in the IPC handlers that already return payment summaries (extending existing summary handlers rather than adding new ones), and add a `remaining_due` field to their response payloads.
- **Rationale**: `total_paid` is already computed in the existing payments summary logic; only the additional subtraction and field are new.
- **Alternatives considered**: Storing a precomputed `remaining_due` column — rejected, would need to be kept in sync on every payment write; a derived read-time value is always correct with negligible cost at this data scale.
