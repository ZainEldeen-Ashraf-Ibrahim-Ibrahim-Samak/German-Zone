# Phase 0 Research: Printing & Export System + Attendance Edit Approval Workflow

No `NEEDS CLARIFICATION` markers remained in the Technical Context — all choices below were resolved by
inspecting existing code rather than needing new library/pattern research, since this feature deliberately
extends infrastructure that already exists in this codebase.

## 1. Reuse the existing export engine instead of building a new one

**Decision**: Extend `electron/services/exportService.ts` (ExcelJS) and `electron/services/pdfService.ts`
(pdfmake) with new sheet/document builders for the Payroll Report and Financial Transactions Report
shapes, rather than introducing a second export library or a client-side (renderer) export path.

**Rationale**: `exportService.ts`/`pdfService.ts`/`exportHeader.ts`/`exportIPC.ts` already implement
exactly what the spec requires structurally — branded header (logo, org name), generation timestamp,
totals rows, month/year and child-scoped queries, Arabic/English rendering, and a native save-file dialog
flow. They are simply never called from any page yet (`grep` across `src/` for `window.api.export` and
`window.print` returned zero hits). Building a second system would recreate the branding/logo/timestamp
logic the spec requires and risks the exact kind of drift the project has already been actively removing
(see prior session: consolidating a duplicate settings-table pricing system into `service_definitions`).

**Alternatives considered**:
- *Client-side export (renderer generates PDF/Excel via a browser library)*: rejected — main process
  already has direct SQLite access and the existing engine, so client-side generation would need to
  duplicate all report-shaping logic and re-implement branding.
- *A generic "export any table" utility taking arbitrary rows/columns*: appealing for reuse, but rejected
  for v1 because each of the four reports has bespoke shape requirements (multi-section Child Report,
  totals placement, RTL/LTR column order) that the existing sheet builders already model per-report; a
  generic utility would need per-report configuration anyway with little net simplification. Revisit if a
  fifth report shows up.

## 2. "Print" = branded HTML/PDF preview via the OS print dialog, not a new dependency

**Decision**: Implement Print as: build the same document-definition data already used for PDF export,
render it to a preview (new `printService.ts` thin wrapper), and hand off to the browser/Electron print
dialog (`window.print()` on a dedicated print-preview view, or pdfmake's existing `.open()`/print-preview
capability). No new native printing library.

**Rationale**: pdfmake already produces a paginated, styled document object; Electron's `BrowserWindow`
and the renderer's `window.print()` are sufficient to turn that into a physical/virtual print job. Adding
a separate print-only rendering path (e.g., pure CSS print stylesheets duplicating the PDF layout) would
mean maintaining two visual definitions of the same report and letting them drift.

**Alternatives considered**:
- *CSS `@media print` stylesheet on the live report table*: simpler for very small reports, but rejected
  because it can't guarantee the branding/logo/timestamp placement or totals footer the spec requires
  consistently across four different report shapes, and pagination of long tables via CSS print is
  unreliable across OSes.

## 3. CSV export via plain string-building, not a new dependency

**Decision**: New `electron/services/csvService.ts` builds CSV text directly (escaping per RFC 4180) from
the same row-shaping functions used for Excel, no new npm package.

**Rationale**: CSV is explicitly optional/lower-priority per the spec, and it's flat tabular data with no
styling/branding requirement beyond a header row with the filter/date-range/generated-at as leading
comment-like rows — trivial to hand-write and keeps the dependency surface unchanged.

**Alternatives considered**: A CSV library (e.g., `csv-stringify`) — rejected as unnecessary weight for
what is a handful of `join(',')` calls with a shared escaping helper.

## 4. Attendance lock is a derived state, not a new column

**Decision**: "Locked" = an `attendance_records` row already exists for that
`(session_id, child_id, teacher_id)` triple. `attendance:record` checks for an existing row before
writing; if found and the caller is not an admin, the write is rejected in favor of directing the caller
to submit an `attendance_edit_requests` row instead. No new `locked` boolean/column on
`attendance_records`.

**Rationale**: Every attendance row that exists today was, by definition, already saved once — so it must
already be treated as locked the moment this feature ships, with zero migration/backfill risk of getting
that state wrong. Adding a `locked` column would require backfilling it as `true` for 100% of existing
rows anyway, which is exactly what "row exists" already expresses for free.

**Alternatives considered**: An explicit `locked_at` timestamp column — rejected as redundant; the
existing `created_at`/`updated_at` on `attendance_records` (from feature 006) already answer "when was
this first saved," and the lock check doesn't need a separate flag to express "this row exists."

## 5. Payment recalculation on approval reuses feature 006's engine

**Decision**: `attendance:decideEditRequest` (approve path) and the admin-direct-edit path both call into
the same internal payment-eligibility/void/regenerate logic that already lives inside `attendance:record`
(feature 006, spec.md FR-008…FR-011, `isPaymentEligible()`), rather than re-deriving payment rules for the
approval flow.

**Rationale**: Feature 006 already built and unit-tested the exact "recompute payment for a
child/teacher/date combination, void the stale one, regenerate if applicable" logic this spec's FR-017
needs. Duplicating it for edit-request approval would create two payment engines that could silently
diverge — the same class of bug already fixed once in this codebase (duplicate service-pricing sources).

**Alternatives considered**: A dedicated `recalculateAttendancePayment()` copy scoped to the approval
path — rejected for the duplication risk above; instead the shared logic is extracted into one reusable
function called by both the direct-write path and the approval path.

## 6. Notifications are a minimal in-app table, not a new integration

**Decision**: New `notifications` table (`user_id`, `type`, `payload`, `read_at`, `created_at`) plus
`notifications:list`/`notifications:markRead` IPC and a small `useNotificationsStore`. No email/SMS/push
integration.

**Rationale**: Per spec Assumptions, the app has no existing outbound-messaging integration, and the spec
only requires the recipient to be informed within the app. This matches the pattern already used for
other lightweight cross-cutting concerns in this codebase (small dedicated tables + Zustand store + IPC
pair, e.g., `attendance_conflicts`).

**Alternatives considered**: Piggybacking on a generic "activity log" instead of a dedicated
notifications table — rejected because the spec requires per-recipient read/unread semantics
(SC-007: "no missed notifications"), which a shared activity log doesn't cleanly express without an extra
per-user read-state join anyway.
