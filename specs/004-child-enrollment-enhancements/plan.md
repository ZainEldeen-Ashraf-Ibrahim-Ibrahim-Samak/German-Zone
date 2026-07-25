# Implementation Plan: Child Enrollment Enhancements

**Branch**: `004-child-enrollment-enhancements` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-child-enrollment-enhancements/spec.md`

## Summary

Six brownfield enhancements to the existing child-enrollment flow and the Target Planning calculator:

1. Guardian phone validated as exactly 11 digits beginning `01` (renderer + IPC).
2. Child photo capture (camera / device selection / file upload) uploaded to Cloudinary from the main process; the returned secure URL is stored on the child and shown in the list and record. Photo is optional and a failed/offline upload still saves the child.
3. A 1-based sequential index column in the children list (renderer-only).
4. Teacher assignment (chosen from existing Employees) plus selected lesson weekdays, a fixed 8-session monthly baseline with manual extra lessons, and a computed monthly fee persisted on the child.
5. Employees (not only admins) can create children — relax `children:add` from `requireAdmin()` to authenticated.
6. Surface the missing `target_profit_pct` input on the Target Planning Service Distribution Calculator while leaving every output formula byte-for-byte unchanged.

Technical approach: additive SQLite migration (`011`) adding columns to `children`; one new main-process upload handler (`storage:uploadPhoto`) and one new read handler (`teachers:list`); changed `children:add`/`children:update` and `target:calc` argument contracts; corresponding `window.api` bridge entries; `childSchema` extended in `mongoSync.ts`; renderer changes in `ChildForm.tsx`, `ChildrenList.tsx`, and `TargetPlanning.tsx`. No new heavy runtime dependency — Cloudinary upload uses Node's global `fetch` + `crypto` for the signed request.

## Technical Context

**Language/Version**: TypeScript ~6.0, Node 20+ (Electron 42 runtime), React 19

**Primary Dependencies**: Electron 42, React 19 + react-router 7, Zustand 5, Tailwind 4, i18next; main-process: `node:sqlite` via the `Db` wrapper, mongoose 9 (sync), exceljs/pdfmake (export). Cloudinary accessed via REST (global `fetch`) — no new dependency.

**Storage**: Local SQLite (system of record, main process only) at `userData/nursery.db`; MongoDB Atlas mirror via admin sync. Child photos stored in Cloudinary; only the `secure_url`/`public_id` persist locally.

**Testing**: Vitest (unit: phone validation, fee calculation, Cloudinary signing, calc formula parity), Playwright (e2e: enrollment with photo, employee-adds-child, calculator inputs).

**Target Platform**: Electron desktop app (Windows/macOS), bilingual Arabic (RTL) / English (LTR), currency EGP.

**Project Type**: Single-repo Electron desktop app — `electron/` main process, `src/` React renderer, `window.api` typed IPC bridge (contextIsolation on, nodeIntegration off).

**Performance Goals**: UI interactions remain instant; photo upload bounded by network and shown with a progress/pending state; calculator recompute is synchronous and sub-second.

**Constraints**: Offline-capable — enrollment must succeed without connectivity (photo deferred). Secrets (Cloudinary credentials, JWT) live only in the main process / `.env`; the renderer never holds them. All role checks re-validated server-side in IPC handlers.

**Scale/Scope**: Hundreds–low thousands of children; single-tenant local install. Scope is the six items above; wiring the computed monthly fee into automatic `payments:generate` is explicitly out of scope (the fee is computed, displayed, and persisted on the child).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unratified template containing only placeholder principles — there are no concrete, enforceable gates. **Status: PASS (no applicable gates).** The plan nonetheless follows the established project conventions captured in CLAUDE.md and prior feature plans (main-process-only data/secret access, typed `window.api` bridge, server-side role re-validation, additive migrations, last-write-wins sync). No complexity deviations to record.

## Project Structure

### Documentation (this feature)

```text
specs/004-child-enrollment-enhancements/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-contracts.md # Phase 1 output (IPC surface delta)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify + /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
electron/
├── env.ts                      # + getCloudinaryConfig() reading CLOUDINARY_* from process.env
├── preload.ts                  # + storage.uploadPhoto, + teachers.list bridge entries
├── db/
│   └── migrations/index.ts     # + migration 011_child_photo_teacher_lessons (additive ALTERs)
├── ipc/
│   ├── _guard.ts               # unchanged (requireAdmin); add note: checkAuth pattern reused
│   ├── childrenIPC.ts          # children:add → checkAuth; validate phone; persist photo/teacher/lessons/fee
│   ├── storageIPC.ts           # + storage:uploadPhoto (Cloudinary signed REST upload, auth-only)
│   ├── salariesIPC.ts          # unchanged; teachers list NOT added here (admin-only file)
│   ├── teachersIPC.ts          # NEW: teachers:list (auth-only, returns {id,name,role} from employees)
│   └── targetIPC.ts            # target:calc accepts optional targetProfitPct; formulas unchanged
├── services/
│   ├── mongoSync.ts            # extend childSchema with new columns
│   └── cloudinaryService.ts    # NEW: signed upload helper (fetch + crypto), used by storageIPC
└── main.ts                     # register teachersIPC import

src/
├── pages/Children/
│   ├── ChildForm.tsx           # phone rule, photo capture/upload UI, teacher + lesson-days + fee
│   ├── ChildrenList.tsx        # 1-based index column + photo thumbnail/placeholder
│   └── ChildStatement.tsx      # show teacher + photo (read-only) if present
├── pages/Target/
│   └── TargetPlanning.tsx      # target profit % input wired into target:calc
├── components/                 # reuse Input/Select/Button; optional PhotoCapture component
├── store/useChildrenStore.ts   # pass-through new fields (no shape assumptions broken)
└── types/index.ts              # extend Child type; add Teacher, photo/lesson fields

tests/
├── unit/                       # phone regex, fee calc, cloudinary signature, calc parity
└── e2e/                        # enrollment+photo, employee-add-child, calculator input
```

**Structure Decision**: Reuse the existing single-repo Electron layout — no new top-level structure. Main-process logic (DB, Cloudinary upload, role checks) stays in `electron/`; all renderer changes stay in `src/` and reach the main process only through the `window.api` bridge. New files are limited to `electron/ipc/teachersIPC.ts`, `electron/services/cloudinaryService.ts`, and an optional `PhotoCapture` renderer component; everything else is an additive edit to an existing file.

## Complexity Tracking

> No constitution violations — section intentionally empty.
