<!-- SPECKIT START -->
Active feature plan: `specs/009-transactions-diary-calendar/plan.md`
(see also: spec.md, research.md, data-model.md, contracts/ipc-contracts.md, quickstart.md in the same directory)
Prior features: `specs/008-daily-billing/plan.md`, `specs/007-printing-export-attendance-approval/plan.md`, `specs/006-salary-attendance-reports/plan.md`, `specs/005-roles-salary-services/plan.md`, `specs/004-child-enrollment-enhancements/plan.md`, `specs/003-multi-service-full-sync/plan.md`, `specs/002-excel-import-env-config/plan.md`, `specs/001-nursery-management-system/plan.md`

Stack: Electron 28 + React 18 + TypeScript (Vite, Tailwind, Zustand). Local data in SQLite
(Node's built-in `node:sqlite` via the `Db` wrapper in `electron/db/connection.ts`, main process only — not
better-sqlite3); ExcelJS + pdfmake export and mongoose sync also main-process only.
Renderer talks to the main process exclusively through the typed `window.api` IPC bridge
(contextIsolation on, nodeIntegration off). Roles: admin/employee, re-validated in IPC handlers.
Bilingual Arabic (RTL) / English (LTR). Currency: EGP. For technologies, structure, and conventions,
read the current plan.
<!-- SPECKIT END -->
