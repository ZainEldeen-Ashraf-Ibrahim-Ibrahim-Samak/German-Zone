# Implementation Plan: Excel Data Import & Environment-Based Configuration

**Branch**: `002-excel-import-env-config` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-excel-import-env-config/spec.md`

## Summary

Two related capabilities for the existing Nursery management desktop app:

1. **Workbook import** — Reliably import all operational data (children, monthly payments, employees, salary payments, expenses) from the real `Nursery_V4_Final_5.xlsx` into the local SQLite database. The existing `importService.ts` is non-functional against the actual workbook layout and the current DB schema; this feature rewrites the importer to read the correct sheets/columns, unwrap Excel formula cells, be idempotent and non-destructive, and auto-fill required fields the workbook lacks.
2. **Environment-based configuration & seeding** — Remove hardcoded secrets and seed values. Load a `.env` at startup, source the JWT signing secret, initial admin credentials, and Mongo URI from the environment, keep non-sensitive seed defaults in code but `.env`-overridable, hard-fail a production launch when no signing secret is configured, and ship a complete `.env.example`.

## Technical Context

**Language/Version**: TypeScript 5, Node (Electron 28 main process), React 18 (renderer)

**Primary Dependencies**: Electron 28, ExcelJS (workbook reading, main process only), `node:sqlite` via the project `Db` wrapper, `dotenv` (new), bcryptjs, jsonwebtoken

**Storage**: Local SQLite (better-sqlite3-compatible `Db` wrapper over `node:sqlite`), main process only

**Testing**: Vitest (contract/unit), Playwright (e2e) — existing harness

**Target Platform**: Windows desktop (Electron), packaged via electron-builder

**Project Type**: Desktop application (Electron main + React renderer, IPC bridge)

**Performance Goals**: Import a full-year workbook (~100 children × 12 months + salaries + expenses) without freezing the UI; complete within a few seconds.

**Constraints**: Renderer ↔ main only via typed `window.api` IPC (contextIsolation on, nodeIntegration off); admin-only operations re-validated in handlers; offline-capable; bilingual AR(RTL)/EN; currency EGP. Secrets must never be committed.

**Scale/Scope**: Single-tenant local install; workbook ~19 sheets, ~100 children, 11 employees, ~20 expense items.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unratified template with placeholder principles — there are no concrete, enforceable gates defined. Proceeding under the project's de-facto conventions captured in `CLAUDE.md` (typed IPC bridge, main-process-only data/secret access, role re-validation in handlers, no secrets in source). No violations to justify; **Complexity Tracking left empty**.

Self-imposed checks applied during design:
- No new secret or credential added to source (FR-016, SC-004). ✅ by design
- Import remains main-process only and admin-guarded (FR-008). ✅ reuses existing `storage:import` guard
- No schema-breaking change to satisfy import (children fields stay required; importer fills placeholders per FR-006a). ✅

## Project Structure

### Documentation (this feature)

```text
specs/002-excel-import-env-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (env vars + IPC import contract)
│   ├── env-vars.md
│   └── import-ipc.md
└── checklists/
    └── requirements.md  # Created by /speckit-specify
```

### Source Code (repository root)

```text
electron/
├── env.ts                       # NEW: load .env (dotenv) + validate required secrets; imported FIRST in main.ts
├── main.ts                      # MODIFY: import ./env.js before all IPC modules; remove implicit defaults
├── db/
│   └── seed.ts                  # MODIFY: read admin creds + setting overrides from env; first-run only
├── ipc/
│   ├── authIPC.ts               # MODIFY: lazy getJwtSecret() (no hardcoded fallback in prod)
│   └── storageIPC.ts            # (unchanged) already wires storage:import → importFromWorkbook
└── services/
    └── importService.ts         # REWRITE: correct sheet/column/row mapping, formula unwrap,
                                  #         schema-correct inserts, placeholder fill, atomic per sheet

.env.example                     # MODIFY: enumerate every supported key with placeholder + comment
.env                             # (local only, gitignored) operator-provided values

src/pages/Storage/StorageManager.tsx   # (verify) surfaces import result summary; minor copy if needed

tests/
├── contract/
│   └── import.test.ts           # NEW: importer maps fixture workbook → correct rows, idempotent
└── unit/
    └── env-config.test.ts       # NEW: env resolution + production secret hard-fail
```

**Structure Decision**: Single Electron desktop project (no frontend/backend split). All import and configuration logic lives in the Electron **main** process (`electron/`), consistent with the constraint that SQLite, ExcelJS, and secrets are main-process only. The renderer change is limited to displaying the import summary that `storage:import` already returns.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
