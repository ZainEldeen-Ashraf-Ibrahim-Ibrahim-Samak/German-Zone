# Phase 1 Contracts: IPC Surface Delta

Only the **changes** to the existing IPC surface are listed (full surface lives in `specs/001-nursery-management-system/contracts/ipc-contracts.md` and the 003 delta). Every handler re-validates role server-side. Notation: `channel` → `args` ⇒ `result`. Types reference `data-model.md`. New `window.api` bridge entries are added in `electron/preload.ts`.

## Children (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `children:get` | `{ search?, service?, activeOnly? }` | `Child[]` — each now includes new photo/teacher/lesson/fee fields | all (read) |
| `children:add` | `ChildInput` + optional `photo_url`, `photo_public_id`, `teacher_id`, `lesson_days` (int[]), `extra_lessons`, `session_price` | `Child` | **all (authenticated)** — relaxed from admin |
| `children:update` | `{ id, patch }` — `patch` may set the same new optional fields | `Child` | admin |
| `children:deactivate` | `{ id }` | `{ ok }` | admin |
| `children:statement` | `{ childId }` | statement object (now may surface teacher/photo) | all (read) |

- **`children:add` access change (FR-012)**: now requires only an authenticated user (`checkAuth()`), not admin. `children:update`/`deactivate` remain admin-only.
- **Server-side validation (FR-001)**: both `add` and `update` reject `guardian_phone` not matching `^01[0-9]{9}$`.
- **Fee computation (FR-011)**: when `session_price` is present, the handler computes and stores `monthly_fee = (sessions_baseline + extra_lessons) * session_price` (`sessions_baseline` default 8). `extra_lessons` defaults to 0 and must be a non-negative integer.
- **Photo optional (FR-004a)**: `photo_url`/`photo_public_id` are optional; absence saves the child with no photo.
- `lesson_days` is persisted as a JSON string of unique integers `0..6`.

## Storage (new handler)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `storage:uploadPhoto` | `{ dataUrl: string, folder?: string }` | `{ url: string, publicId: string }` | all (authenticated) |

- Uploads the image (data URL / base64) to Cloudinary via a **signed** REST request from the main process (`electron/services/cloudinaryService.ts`), using credentials from `env.getCloudinaryConfig()`. The renderer never receives the API secret.
- Throws a descriptive error when Cloudinary is unreachable/misconfigured; the renderer catches it and proceeds to save the child without a photo (offline behavior, FR-004a).
- Auth-level (not admin) because employees may add children with photos (FR-012).

## Teachers (new handler)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `teachers:list` | `{ role? }` (optional filter) | `Teacher[]` = `{ id, name, role }[]` (active employees only) | all (authenticated) |

- New file `electron/ipc/teachersIPC.ts`, registered in `electron/main.ts`. Returns a minimal projection over `employees` — **salary fields excluded** (least privilege). Lets an employee assign a teacher without payroll access (research R5). The admin-only `employees:get` is unchanged.

## Target (changed)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `target:get` | `{ year }` | per-month target rows + annual rollups | admin |
| `target:calc` | `{ distribution, month, year, targetProfitPct? }` | `{ projectedRevenue, targetRequired, coveragePct, unitsNeeded, pricing }` | admin |

- **New input (FR-014)**: `target:calc` accepts an optional `targetProfitPct`. When provided it is used in place of the `settings.target_profit_pct` lookup; when omitted, behavior is identical to today.
- **Outputs unchanged (FR-015)**: the formulas (`calcRequiredRevenue`, `projectedRevenue`, `coveragePct`, `unitsNeeded`) are byte-for-byte unchanged. Passing `targetProfitPct` equal to the stored setting reproduces the exact prior result (regression guard).

## `window.api` bridge additions (`electron/preload.ts`)

```text
api.storage.uploadPhoto(args)   → ipcRenderer.invoke('storage:uploadPhoto', args)
api.teachers.list(args?)        → ipcRenderer.invoke('teachers:list', args)
api.target.calc(args)           // unchanged signature; args now may include targetProfitPct
```

## Type changes (`src/types/index.ts`)

- `Child` gains: `photo_url?`, `photo_public_id?`, `teacher_id?`, `lesson_days?` (number[] | string), `sessions_baseline?`, `extra_lessons?`, `session_price?`, `monthly_fee?`.
- New `Teacher` type: `{ id: number; name: string; role: string }`.
- `WindowApi` (derived from preload) automatically reflects the new `storage.uploadPhoto` and `teachers.list` entries.
