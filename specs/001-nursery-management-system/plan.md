# Implementation Plan: Nursery & Autism Center Management System

**Branch**: `001-nursery-management-system` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-nursery-management-system/spec.md`

## Summary

A bilingual (Arabic RTL / English LTR) offline-first **desktop application** for a nursery & autism center to manage children records, monthly payment collection, employee salaries, operational expenses, a financial dashboard, target planning, per-child account statements, white-label branding, Excel/PDF export matching the original workbook, and optional cloud synchronization for administrators.

**Technical approach**: An Electron application with a React + TypeScript renderer (Vite, Tailwind) and a Node main process that owns all data and heavy work. All persistent data lives in a local SQLite database (`better-sqlite3`) accessed **only** from the main process and exposed to the renderer through a typed, context-isolated IPC bridge (`contextBridge` in `preload`). Spreadsheet generation (ExcelJS) and PDF generation run in the main process. Role-based access (admin/employee) is enforced in the renderer for UX and re-validated in IPC handlers for security. Cloud sync to MongoDB Atlas (mongoose) is an admin-only, manual/auto push-pull with most-recent-change-wins conflict resolution.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 20.x (Electron 28 main process); React 18 renderer.

**Primary Dependencies**: Electron 28, React 18 + react-router-dom 6, Vite 5 + vite-plugin-electron, Tailwind CSS 3, Zustand 4 (state), better-sqlite3 9 (local DB, main process), ExcelJS 4 (spreadsheet export, main process), pdfmake (PDF export with embedded Cairo font for Arabic — see research), mongoose 8 (MongoDB sync, main process), bcryptjs (password hashing), jsonwebtoken (session token), recharts 2 (charts), react-i18next + i18next 23 (localization), date-fns 2, clsx, electron-builder 24 (packaging).

**Storage**: SQLite local file (`better-sqlite3`) as the system of record; MongoDB Atlas as optional cloud mirror. Uploaded branding assets stored on disk under the app's user-data directory.

**Testing**: Vitest for unit/business-logic tests (calculations, sync conflict, status logic); Playwright for Electron end-to-end smoke tests of critical flows (login, record payment, export). Contract tests validate the IPC channel surface against typed contracts.

**Target Platform**: Windows 11 primary (developer environment); cross-platform packaging for Windows (.exe), macOS (.dmg), Linux via electron-builder.

**Project Type**: Desktop application (Electron) — main process + renderer, single repository.

**Performance Goals**: Record/refresh a 100-child month sheet without UI freeze (SC-001); dashboard reflects current month within 2 seconds (SC-002); search results under 5 seconds (SC-003). 60fps interaction target for normal navigation.

**Constraints**: Fully offline-capable for all non-sync features (SC-008). No sensitive data in volatile/browser storage — SQLite only (FR-045). `contextIsolation: true`, `nodeIntegration: false`; renderer never imports `better-sqlite3`/ExcelJS/mongoose directly. RTL/LTR must switch live.

**Scale/Scope**: ~100–150 children, ~11 employees, 12 months × multiple years of payment rows, ~11 pages/screens, single concurrent user per machine.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an **unpopulated template** — it contains placeholder principles only and has not been ratified. There are therefore **no binding constitutional gates** to evaluate.

Self-imposed engineering guardrails adopted in lieu of a ratified constitution (carried from the source plan's "Important Notes"):
- **Process isolation**: data/IO heavy libraries (SQLite, ExcelJS, mongoose, PDF) run in the main process only; renderer talks to them solely via IPC.
- **No volatile storage**: all persistent data in SQLite, never `localStorage`.
- **Security defaults**: context isolation on, node integration off; passwords hashed (bcrypt); IPC handlers re-check role.
- **Simplicity / YAGNI**: single repo, single branch/organization scope; multi-branch and multi-currency explicitly deferred.

**Gate result**: PASS (no violations; Complexity Tracking left empty).

## Project Structure

### Documentation (this feature)

```text
specs/001-nursery-management-system/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (IPC channel contracts)
│   └── ipc-contracts.md
├── checklists/
│   └── requirements.md  # Created by /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
electron/
├── main.ts                  # BrowserWindow, app lifecycle, RTL, asset:// protocol, icon
├── preload.ts               # contextBridge → typed window.api surface
├── db/
│   ├── connection.ts        # better-sqlite3 instance + pragmas
│   ├── migrations/          # schema migrations (versioned)
│   └── seed.ts              # default admin user + default settings/branding
└── ipc/
    ├── authIPC.ts           # login, logout, current, user CRUD (admin)
    ├── childrenIPC.ts
    ├── paymentsIPC.ts       # get/update/generate-month
    ├── salariesIPC.ts       # employees + salary_payments
    ├── expensesIPC.ts
    ├── settingsIPC.ts       # pricing/target/capacity
    ├── brandingIPC.ts       # get/save/upload-logo/upload-icon/reset/apply-icon
    ├── exportIPC.ts         # excel + pdf, full/partial
    ├── storageIPC.ts        # stats/backup/restore/import/clear/audit
    └── syncIPC.ts           # push/pull/status

src/                         # React renderer
├── main.tsx
├── App.tsx                  # Router + i18n + useBranding bootstrap
├── i18n/{ar.json,en.json}
├── components/{ui,layout,charts}/
├── pages/                   # Login, Dashboard, Children, Payments, Salaries,
│                            # Expenses, Target, Settings, Storage, Sync, Users
├── store/                   # Zustand stores (auth, children, payments, ...)
├── hooks/                   # useBranding, useDashboard, useExport, useSync, ...
├── services/                # renderer-side wrappers over window.api + calc helpers
└── types/                   # shared TS types (child, payment, salary, expense, settings, user)

assets/
├── branding/                # live, user-editable logo/icon
└── default-branding/        # immutable defaults for reset

tests/
├── unit/                    # vitest: calculations, status, sync conflict
├── contract/                # vitest: IPC contract shape checks
└── e2e/                     # playwright: login, payment, export smoke flows

electron-builder.yml, vite.config.ts, tailwind.config.js, package.json, .env
```

**Structure Decision**: Electron desktop layout split into `electron/` (main process: DB, IPC, export, sync) and `src/` (React renderer). This mirrors the source plan and enforces the process-isolation guardrail — the renderer has no direct database or file-system access. Shared TypeScript types live in `src/types/` and are imported by both sides where the bundler allows, with the IPC contract documented in `contracts/ipc-contracts.md`.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
