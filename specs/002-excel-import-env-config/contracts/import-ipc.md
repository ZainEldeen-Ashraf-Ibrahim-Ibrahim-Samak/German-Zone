# Contract: Import IPC

Reuses the existing channel `storage:import` (registered in `electron/ipc/storageIPC.ts`, exposed as `window.api.storage.import`). Admin-only; re-validated in the handler via `requireAdmin()`.

## Request

```ts
window.api.storage.import(args?: { path?: string }): Promise<ImportResult>
```

- `path` optional. If omitted, the main process opens a native file picker filtered to `.xlsx`/`.xls`.
- Caller MUST be an authenticated admin; otherwise the handler throws.

## Response

```ts
interface ImportResult {
  imported: ImportSummary
}

interface ImportSummary {
  children:       { imported: number; skipped: number }
  payments:       { imported: number; skipped: number }
  employees:      { imported: number; skipped: number }
  salaryPayments: { imported: number; skipped: number }
  expenses:       { imported: number; skipped: number }
  sheetsProcessed: string[]   // sheets that were read for data
  sheetsIgnored:   string[]   // dashboard/statement/target/settings, etc.
  year:            number     // resolved import year applied to payments/salaries
  rowErrors:       number     // count of rows skipped because uninterpretable
}
```

## Behavioral guarantees (map to FRs)

- **FR-002/FR-003**: All supported entities imported; each child created once; one payment per child per month present.
- **FR-004**: Idempotent — a second import of the same file adds 0 rows; previously-present rows counted in `skipped`.
- **FR-005**: Never overwrites existing rows or in-app edits.
- **FR-006/FR-006a**: Uninterpretable rows are skipped and counted in `rowErrors`; rows missing required fields are imported with placeholder defaults rather than skipped; a single bad row never aborts the import.
- **FR-007**: `ImportSummary` provides the per-category counts plus `sheetsProcessed`/`sheetsIgnored` for the post-import summary UI.
- **FR-009**: All inserted rows have `synced = 0` so existing cloud sync picks them up.
- **R6 (atomicity)**: Writes for each sheet run inside a transaction; a failure within a sheet rolls that sheet back without corrupting the DB.

## Renderer

`src/pages/Storage/StorageManager.tsx` consumes `ImportResult` and renders the summary (counts, ignored sheets, resolved year). No new IPC channel is added.
