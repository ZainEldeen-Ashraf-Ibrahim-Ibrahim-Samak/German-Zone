# Phase 0 Research: Child Enrollment Enhancements

All decisions below resolve the Technical Context for the six spec items. There are no remaining NEEDS CLARIFICATION markers (the five spec-level ambiguities were closed in `/speckit-clarify`, Session 2026-06-10).

## R1 — Cloudinary upload path (renderer vs. main process)

- **Decision**: Upload from the **main process** via a new `storage:uploadPhoto` IPC handler. The renderer captures/selects the image and sends its bytes (data URL / base64) over the bridge; main uploads to Cloudinary and returns `{ url, publicId }`.
- **Rationale**: Project convention (CLAUDE.md, prior plans) keeps all secrets and external network calls in the main process; the renderer never holds the Cloudinary API secret. A **signed** upload (computed in main) is required precisely because the secret must not reach the renderer. Mirrors how mongoose sync and exports are main-only.
- **Alternatives considered**: (a) Unsigned direct-from-renderer upload preset — rejected: still exposes the cloud name/preset broadly and bypasses the main-process secret boundary, and offers no server-side validation hook. (b) Adding the `cloudinary` npm SDK — rejected as unnecessary weight; the REST upload endpoint plus an HMAC-SHA1 signature using Node's built-in `crypto` and global `fetch` (available in Electron 42 / Node 20+) is sufficient.

## R2 — Cloudinary signature & request shape

- **Decision**: `POST https://api.cloudinary.com/v1_1/<cloud_name>/image/upload` as `multipart/form-data` with fields `file` (data URI), `api_key`, `timestamp`, `folder` (e.g. `nursery/children`), and `signature = sha1(sorted_params + api_secret)`. Implemented in `electron/services/cloudinaryService.ts`; credentials read through `env.ts` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optionally parse `CLOUDINARY_URL`).
- **Rationale**: Signed uploads are the documented secure server-side method and need no SDK. Storing only `secure_url` + `public_id` keeps the local DB small and lets a future cleanup delete by `public_id`.
- **Alternatives considered**: Storing the raw image as a base64 blob in SQLite — rejected: bloats the DB and the Mongo mirror, and the user explicitly chose Cloudinary.

## R3 — Camera capture & device selection in the renderer

- **Decision**: Use `navigator.mediaDevices.enumerateDevices()` to list `videoinput` devices in a dropdown, `getUserMedia({ video: { deviceId } })` to stream into a `<video>`, and draw a frame to a `<canvas>` → `toDataURL('image/jpeg')` on capture. A parallel `<input type="file" accept="image/*">` covers upload. Both produce a data URL handed to `storage:uploadPhoto`.
- **Rationale**: These Web APIs are available in the Electron renderer (Chromium) with contextIsolation on; no native module needed. Device enumeration satisfies "select the devices"; file input satisfies "upload a photo".
- **Alternatives considered**: A native camera module — rejected as overkill and cross-platform fragile. Capturing in main via a headless lib — rejected: cameras belong to the UI layer.

## R4 — Offline / failure behavior for photos

- **Decision**: The renderer attempts upload **before** calling `children:add`/`children:update`. On upload success it passes the returned `photo_url`/`photo_public_id`; on failure (offline, timeout, Cloudinary error) it shows a non-blocking message and proceeds to save the child **without** a photo. Photo can be added later via edit. `children:*` treat photo fields as optional.
- **Rationale**: Directly implements the clarified decision (photo optional; offline still saves) and the spec's offline edge case; preserves the offline-capable constraint.
- **Alternatives considered**: Queue the image for later background upload — rejected as out of scope; deferred manual re-add is sufficient and simpler.

## R5 — Teacher source & access (employees are admin-only today)

- **Decision**: Teachers are existing **Employees**. Because `employees:get` is `requireAdmin()` (salaries module is admin-only), add a new **auth-level** `teachers:list` handler (new file `electron/ipc/teachersIPC.ts`) returning a minimal `{ id, name, role }` for active employees, so an employee user can pick a teacher without gaining payroll access. The form may filter to roles matching teacher (`teacher`/`مدرس`/`معلم`).
- **Rationale**: Reuses the Employees data per the clarification while respecting least-privilege — employees see only id/name/role, not salary figures. Keeps the admin-only `salariesIPC.ts` untouched.
- **Alternatives considered**: Relaxing `employees:get` to all users — rejected: would leak salary fields to employees. A separate `teachers` table — rejected: contradicts the clarified "existing Employees list."

## R6 — Lesson schedule, session count & fee model

- **Decision**: Persist on `children`: `teacher_id`, `lesson_days` (JSON array of weekday integers, JS `getDay` convention 0=Sun…6=Sat), `sessions_baseline` (default **8**, fixed regardless of month length per clarification), `extra_lessons` (default 0), `session_price`, and `monthly_fee`. Fee is computed server-side: `monthly_fee = (sessions_baseline + extra_lessons) * session_price`, recomputed on add/update and stored as a snapshot for display/sync.
- **Rationale**: Clarification fixed the baseline at 8 with variation handled by manual extras, so no calendar arithmetic is needed for billing — `lesson_days` is stored for display/reference (FR-007, FR-013). Storing the computed fee keeps the child record self-describing and syncable.
- **Alternatives considered**: Deriving sessions from actual weekday occurrences in the month — rejected by clarification (Option B). Modeling lessons as a new `child_services` "session" enrollment that feeds `payments:generate` — deferred: out of scope; the spec requires compute + display, not automatic billing generation.

## R7 — "Missing inputs" on the Target Planning calculator

- **Decision**: Audit of `target:calc` shows its outputs depend on: the per-service `distribution` (already an input), the reference `month`/`year` (already passed), the per-service `pricing` (from settings), and **`target_profit_pct`** (read from settings, with no field on the screen). The missing user-facing input is **target profit %**. Add an editable "Target Profit %" field to the Service Distribution Calculator card, defaulting to the saved `target_profit_pct` setting, and pass it as an optional `targetProfitPct` arg to `target:calc`. When provided it is used in place of the settings lookup; the formulas (`calcRequiredRevenue`, `projectedRevenue`, `coveragePct`, `unitsNeeded`) are unchanged.
- **Rationale**: Satisfies FR-014 (add the missing input every output depends on) and FR-015 (outputs unchanged — same formulas, same results when the input equals the prior settings value). Lets users simulate margin scenarios that previously required editing global settings.
- **Alternatives considered**: Adding per-service unit selectors (month/day/hour) — noted as a possible secondary gap but **deferred**: the calculator's pricing keys are fixed (`nursery_monthly`/`hosting_monthly`/`session_hourly`) and changing them would alter outputs, violating FR-015. Target profit % is the clean, output-preserving addition.

## R8 — Guardian phone validation

- **Decision**: Replace the current `^\+?[0-9\s-]{8,15}$` guardian-phone rule with **`^01[0-9]{9}$`** (exactly 11 digits, digits only, starts `01`). Enforce in the renderer (`maxLength={11}`, digit-only filtering, inline error) **and** re-validate in `children:add`/`children:update`. The optional child-phone field keeps its existing validation.
- **Rationale**: Implements the clarified Egyptian-mobile rule; server-side re-validation matches the project's defense-in-depth convention.
- **Alternatives considered**: Max-11 without prefix — rejected by clarification (Option A chosen).

## R9 — Employee permission to add children

- **Decision**: Change `children:add` from `requireAdmin()` to the authenticated-user check (`checkAuth()`). Leave `children:update` and `children:deactivate` as `requireAdmin()` (spec only requires *adding*). Ensure the renderer exposes the "Add Child" action/route to employee role.
- **Rationale**: Minimal, spec-exact change (FR-012) with the smallest blast radius; editing/deactivating remain admin operations until a future need arises.
- **Alternatives considered**: Relaxing update/deactivate too — rejected: not requested; keeps destructive operations admin-gated.

## R10 — Sync of new child columns

- **Decision**: Extend `childSchema` in `mongoSync.ts` with `photo_url`, `photo_public_id`, `teacher_id`, `lesson_days`, `sessions_baseline`, `extra_lessons`, `session_price`, `monthly_fee`. New columns are additive; last-write-wins on `updated_at` is unchanged.
- **Rationale**: The child Mongoose schema enumerates fields explicitly, so new columns must be declared to round-trip through admin sync. Additive fields carry no migration risk for existing mirror documents.
- **Alternatives considered**: Leaving them local-only — rejected: admin sync would silently drop the new enrollment data.

## R11 — Migration strategy

- **Decision**: Add migration `011_child_photo_teacher_lessons` performing guarded `ALTER TABLE children ADD COLUMN …` for each new column (try/catch-per-column pattern already used by migrations 003/007/008), with sensible defaults (`sessions_baseline` default 8, `extra_lessons` default 0). No table rebuild needed.
- **Rationale**: All additions are nullable/defaulted columns — `ALTER TABLE ADD COLUMN` is safe and idempotent with the existing guard pattern; avoids the heavier copy-rebuild used when changing constraints.
- **Alternatives considered**: Full table rebuild (as in migration 005) — unnecessary here since no constraint/uniqueness changes are required.
