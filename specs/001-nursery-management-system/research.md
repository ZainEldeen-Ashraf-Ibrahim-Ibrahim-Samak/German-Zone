# Phase 0 Research: Nursery & Autism Center Management System

All technology choices were largely fixed by the source plan; the items below record the decisions, rationale, and rejected alternatives, and resolve the few areas the spec/clarifications left open (PDF for Arabic, asset serving, icon update, sync conflict).

## 1. Desktop shell & build tooling

- **Decision**: Electron 28 + Vite 5 (`vite-plugin-electron`) with a React 18 + TypeScript renderer; package with electron-builder 24.
- **Rationale**: Cross-platform desktop with web UI; Vite gives fast HMR for the renderer and a clean main/preload build. Matches the source plan exactly.
- **Alternatives considered**: Tauri (smaller binary, Rust core) — rejected because the plan, dependencies, and contributor familiarity are JS/TS; better-sqlite3 + ExcelJS + mongoose ecosystem is Node-native.

## 2. Local persistence

- **Decision**: `better-sqlite3` opened **only in the main process**, single DB file under `app.getPath('userData')`. Versioned migrations run at startup; `seed.ts` inserts the default admin and default settings/branding on first launch.
- **Rationale**: Synchronous, fast, transactional; ideal for an offline single-user desktop app. Storing under userData keeps the DB writable after install (not inside the read-only app bundle).
- **Alternatives**: LowDB/JSON (no relational integrity, weak querying) — rejected; SQL via async drivers — unnecessary overhead for synchronous main-process use.
- **Resolves**: FR-045 (no volatile storage), SC-007/SC-008 (backup, offline).

## 3. Process isolation & IPC surface

- **Decision**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox` where feasible. `preload.ts` exposes a typed `window.api` via `contextBridge`; every channel maps to an `ipcMain.handle`. Heavy/native modules (better-sqlite3, ExcelJS, mongoose, PDF) are imported in the main process only.
- **Rationale**: Security best practice; prevents the renderer from touching the filesystem/DB directly. Re-validating role inside handlers prevents a tampered renderer from escalating privilege.
- **Alternatives**: `nodeIntegration: true` for convenience — rejected (insecure, breaks the plan's guardrails).
- **Resolves**: FR-002/FR-003 role enforcement, source-plan notes 1–3.

## 4. State management & data fetching

- **Decision**: Zustand stores per domain (auth, children, payments, salaries, expenses, settings, branding, sync). Light caching done in stores; optional React Query deferred (YAGNI).
- **Rationale**: Minimal boilerplate, fits the plan; IPC calls are local and fast so an elaborate cache layer is unwarranted.

## 5. Localization & RTL/LTR

- **Decision**: react-i18next with `ar.json`/`en.json`; set `document.documentElement.dir` to `rtl`/`ltr` on language change. Tailwind `rtl:` variants for directional spacing. Fonts: Cairo (Arabic), Inter (English).
- **Rationale**: Standard, well-supported; live direction switch satisfies SC-009/FR-039/FR-040.
- **Note**: Arabic month names are the canonical keys; English labels map from them.

## 6. Excel export (parity with original workbook)

- **Decision**: ExcelJS in the main process. A small "workbook builder" module reproduces the original sheet names (Arabic + emoji), column order, number format `#,##0.00`, status colors, RTL sheet views, and a branding header row. Triggered via IPC + `dialog.showSaveDialog`.
- **Rationale**: ExcelJS supports styling, RTL views, embedded images (logo) and per-cell formats required for parity (FR-035, SC-004).
- **Alternatives**: SheetJS/xlsx (styling in community build is limited) — rejected for parity needs.

## 7. PDF export with Arabic (RTL) — clarification follow-up

- **Decision**: Use **pdfmake** with an embedded **Cairo** TTF font (vfs) for every export type (FR-036a). Apply RTL alignment and, where shaping is imperfect, pre-shape Arabic strings.
- **Rationale**: pdfmake runs in Node (main process), supports custom embedded fonts and table layouts, and avoids bundling a headless browser. Arabic requires an embedded Unicode font — the default Roboto cannot render Arabic.
- **Alternatives**: Puppeteer/Chromium HTML-to-PDF (heavy, large dependency, slow startup) — rejected for a desktop app; pdfkit (more manual layout for tables) — pdfmake's declarative tables fit the statement/report layouts better.
- **Risk/follow-up**: Complex Arabic ligature shaping in pdfmake can be imperfect; if QA finds shaping defects on statements, fall back to an HTML→PDF path via the existing Chromium (`webContents.printToPDF`) for the statement only. Tracked as an implementation risk, not a blocker.

## 8. Serving local branding images in the renderer

- **Decision**: Register a custom `asset://` protocol in the main process (`protocol.registerFileProtocol`) mapping to the branding directory; the renderer references `asset://...` URLs for logos.
- **Rationale**: `contextIsolation` + no `file://` access means uploaded images can't be loaded directly; a scoped custom protocol is the safe, standard approach (source-plan note 11).

## 9. Live branding application (colors, name, icon)

- **Decision**: Branding stored in `settings` (keys prefixed `brand_`). On startup and after save, `useBranding()` writes colors to CSS variables (`--color-primary`, `--color-accent`) and updates `document.title`; window title via `win.setTitle`. Icon: `win.setIcon(path)` (Windows/Linux) and `app.dock.setIcon(path)` (macOS) apply immediately; installer icon is build-time only (electron-builder.yml) and requires a rebuild — user is warned.
- **Rationale**: Satisfies FR-030/FR-031/SC-005 without restart; documents the one limitation (installer icon).

## 10. Authentication & session

- **Decision**: Local accounts in `users` (bcrypt-hashed passwords). On login, main process issues a signed JWT persisted in the DB/userData; session **persists until explicit logout** (clarification Q4) — no idle/absolute expiry. Auto-login on launch when a valid token exists. Default admin seeded (username/password) and the user is prompted to change it.
- **Rationale**: Matches single-machine trusted-staff usage; physical access is the real control. Re-validation of role happens server-side (main) per handler.
- **Resolves**: FR-001/FR-004/FR-005, clarification Q4.

## 11. MongoDB sync & conflict resolution

- **Decision**: mongoose in the main process. Each syncable row carries `synced` (0/1) and `updated_at`. Push: upsert rows where `synced = 0`, then set `synced = 1`. Pull: fetch cloud docs with `updated_at > last_sync`. **Conflict: most-recent `updated_at` wins** (clarification default); deterministic tie-break by record id. Auto-sync optional on an interval. Failures are caught and surfaced as status without mutating local data.
- **Rationale**: Simple, robust last-write-wins fits a low-conflict single-operator scenario; admin-only (FR-046–FR-050).
- **Alternatives**: Operational-transform/CRDT — vastly over-engineered for this scale (YAGNI).

## 12. Currency & formatting

- **Decision**: Fixed Egyptian Pound (EGP / ج.م) display label (clarification Q2); number format `#,##0.00` with the currency label appended in UI and exports. No conversion.

## 13. Overpayment handling

- **Decision**: Allow paid > total; balance becomes negative and is shown as a **credit**, status = "paid" (clarification Q5). Calculation helpers and unit tests encode this.

## 14. Testing strategy

- **Decision**: Vitest for pure business logic (dashboard math, target calculator, statement builder, status/overpayment, sync conflict resolver) — these are the highest-value, fully deterministic units. Playwright (Electron) for a thin layer of e2e smoke tests (login → record payment → export). IPC contract shape tests validate the `window.api` surface against `contracts/ipc-contracts.md`.
- **Rationale**: Concentrates automated testing on the financial logic where correctness matters most, with lightweight e2e coverage of critical journeys.

## Outstanding NEEDS CLARIFICATION

None. All spec clarifications resolved in the Session 2026-06-06 block; PDF/Arabic approach decided with a documented fallback.
