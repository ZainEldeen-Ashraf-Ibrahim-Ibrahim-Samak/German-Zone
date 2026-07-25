# Phase 1 Contracts: IPC Channel Surface

The renderer's only interface to data and OS capabilities is `window.api`, exposed by `preload.ts` via `contextBridge`. Each method maps 1:1 to an `ipcMain.handle(channel, …)` in the main process. **Every admin-only handler re-validates the caller's role server-side** (renderer guarding is UX only). Types reference entities in `data-model.md`.

Notation: `channel` → `args` ⇒ `result`. Errors reject with `{ code, message }`.

## Auth & Users
| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `auth:login` | `{ username, password }` | `{ user, token }` \| error | all |
| `auth:logout` | — | `{ ok: true }` | all |
| `auth:current` | — | `{ user } \| null` | all |
| `users:list` | — | `User[]` | admin |
| `users:create` | `{ username, password, role, name }` | `User` | admin |
| `users:update` | `{ id, patch }` | `User` | admin |
| `users:deactivate` | `{ id }` | `{ ok }` | admin |

- Session persists until `auth:logout` (clarification Q4). `auth:current` enables auto-login.

## Children
| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `children:get` | `{ search?, service?, activeOnly? }` | `Child[]` | all (read) |
| `children:add` | `ChildInput` | `Child` | admin |
| `children:update` | `{ id, patch }` | `Child` | admin |
| `children:deactivate` | `{ id }` | `{ ok }` | admin |

## Payments
| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `payments:get` | `{ month, year }` | `Payment[]` (+ summary) | all |
| `payments:generate` | `{ month, year }` | `{ created: number }` | all |
| `payments:update` | `{ id, quantity?, paid?, notes? }` | `Payment` | all |
| `payments:bulkPay` | `{ ids: number[] }` | `{ updated: number }` | all |

- `generate` is idempotent: creates one row per active child only if absent for (month, year).
- `update` recomputes total/balance/status server-side; price not accepted from client. Overpayment → negative balance, status `paid` (Q5).
- Summary payload: `{ totalInvoiced, totalCollected, arrears }`.

## Salaries (admin only)
| Channel | Args | Result |
|---------|------|--------|
| `employees:get` | — | `Employee[]` |
| `employees:add` | `EmployeeInput` | `Employee` |
| `employees:update` | `{ id, patch }` | `Employee` |
| `employees:deactivate` | `{ id }` | `{ ok }` |
| `salary:get` | `{ month, year }` | `SalaryPayment[]` |
| `salary:update` | `{ employee_id, month, year, bonus, deductions, paid_date?, notes? }` | `SalaryPayment` |

## Expenses (admin only for writes)
| Channel | Args | Result |
|---------|------|--------|
| `expenses:get` | `{ year }` | `Expense[]` |
| `expenses:update` | `{ item, month, year, amount, category? }` | `Expense` |
| `expenses:addItem` | `{ item, category? }` | `{ ok }` |
| `expenses:removeItem` | `{ item }` | `{ ok }` |

## Dashboard / Target
| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `dashboard:get` | `{ month, year }` | KPIs + 12-month summary + revenue-by-service + alerts | admin (full); employee sees permitted subset |
| `target:get` | `{ year }` | per-month target/gap/status | admin |
| `target:calc` | `{ distribution }` | `{ projectedRevenue, coveragePct, unitsNeeded }` | admin |

## Settings & Branding (admin only)
| Channel | Args | Result |
|---------|------|--------|
| `settings:get` | — | `Record<string,string>` |
| `settings:update` | `Record<string,string>` | `{ ok }` |
| `branding:get` | — | `Record<string,string>` (brand_*) |
| `branding:save` | `Record<string,string>` | `{ ok }` (updates window title live) |
| `branding:upload-logo` | — (opens dialog) | `{ path } \| null` |
| `branding:upload-icon` | — (opens dialog) | `{ path } \| null` (applies icon live) |
| `branding:reset` | — | `{ ok }` |

- `branding:get` is readable by all (renderer needs colors/logo); writes are admin-only.
- Uploaded images served to renderer via `asset://` protocol.

## Export (excel + pdf)
| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `export:full` | `{ year, format: 'xlsx'\|'pdf', lang }` | `{ path }` | admin |
| `export:month` | `{ month, year, format, lang }` | `{ path }` | all |
| `export:child` | `{ childId, format, lang }` | `{ path }` | all (employees may export statements, FR-038) |
| `export:salaries` | `{ month, year, format, lang }` | `{ path }` | admin |
| `export:expenses` | `{ year, format, lang }` | `{ path }` | admin |

- Every export embeds branding header (org name, contacts) and honors `lang` for headers. Both `xlsx` and `pdf` supported for all types (FR-036a).

## Storage (admin only)
| Channel | Args | Result |
|---------|------|--------|
| `storage:stats` | — | `{ counts, sizeBytes }` |
| `storage:backup` | — (save dialog) | `{ path }` |
| `storage:restore` | `{ path }` | `{ ok }` |
| `storage:import` | `{ path }` (original workbook) | `{ imported: {...} }` |
| `storage:clear` | `{ confirm: true }` | `{ ok }` |
| `storage:audit` | — | `AuditEntry[]` (last 50) |

## Sync (admin only)
| Channel | Args | Result |
|---------|------|--------|
| `sync:push` | — | `{ pushed, errors }` |
| `sync:pull` | — | `{ pulled, errors }` |
| `sync:status` | — | `{ connected, lastSync, pending: Record<table,number> }` |

- Conflict: most-recent `updated_at` wins (clarification default), tie-break by id.
- Cloud unreachable → result reports error, local data untouched (FR-050).

## Contract test expectations

- Every channel above exists on `window.api` and rejects with `{ code, message }` on failure.
- Admin-only channels reject for an employee session with `code = 'FORBIDDEN'`.
- `payments:update` ignores any client-supplied `price`/`total`/`balance`/`status` and recomputes them.
