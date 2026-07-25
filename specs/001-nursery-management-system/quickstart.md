# Quickstart: Nursery & Autism Center Management System

Developer setup and the smoke path that proves the system works.

## Prerequisites

- Node.js 20.x and npm
- Windows 11 (primary), macOS, or Linux
- Build tools for native modules (`better-sqlite3`): on Windows, the "Desktop development with C++" workload or `windows-build-tools`.

## 1. Install

```bash
npm install
```

Key dependencies (see `package.json`): electron, react, react-router-dom, zustand, better-sqlite3, exceljs, pdfmake, mongoose, bcryptjs, jsonwebtoken, recharts, react-i18next, i18next, date-fns, clsx; dev: vite, vite-plugin-electron, tailwindcss, electron-builder, typescript.

## 2. Configure

Create `.env`:

```
JWT_SECRET=<random-secret>
MONGO_URI=            # optional; set later from Settings → Security for sync
```

Branding/icon defaults live in `assets/default-branding/`. Do not edit those; the live copies in `assets/branding/` are managed from the app.

## 3. Run (dev)

```bash
npm run dev      # Vite renderer + Electron main with HMR
```

On first launch the DB is created under the OS user-data directory, migrations run, and a **default admin** is seeded. Log in and change the password when prompted.

## 4. Smoke test (critical path)

1. **Login** as the default admin → dashboard opens.
2. **Add a child** (Children → Add): name, guardian, guardian phone, service = حضانة, price auto-fills from settings. Save → appears in list. Search by name returns it.
3. **Generate the month** (Payments → select month/year → it auto-generates a row per active child). Record `paid` = full amount → status flips to `paid`, balance 0. Enter `paid` > total → balance negative (credit), status still `paid`.
4. **Dashboard** (select same month): KPIs reflect the payment within ~2s; collection rate and 12-month summary update.
5. **Export** the month as `.xlsx` and as `.pdf`: both download via the save dialog and carry the branding header.
6. **Branding** (Settings → Branding, admin): change primary color → UI updates live; upload a logo → shows in sidebar.
7. **Role check**: create an employee (Settings → Users), log out, log in as employee → Salaries/Sync/Storage and settings editing are hidden; child statement export still works.

## 5. Tests

```bash
npm run test          # vitest unit + contract (calculations, status/overpayment, sync conflict, IPC shape)
npm run test:e2e      # playwright electron smoke (login → payment → export)
```

## 6. Package

```bash
npm run build         # build renderer + main
npm run dist          # electron-builder → .exe / .dmg / AppImage
```

> Note: the **installer** icon is set at build time in `electron-builder.yml`. The in-app icon upload changes the running window/taskbar icon immediately but does not alter the installer icon without a rebuild.

## Definition of done for the smoke path

- All seven smoke steps pass.
- SC-001 (100-child month responsive), SC-002 (dashboard <2s), SC-004 (export parity), SC-005 (live branding), SC-006 (role restrictions), SC-008 (offline) demonstrably hold.
