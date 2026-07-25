# Phase 1 Contracts: IPC Surface Delta

Only **changes and additions** relative to the existing surface (004 delta + 003 delta). Every handler re-validates role server-side. Notation: `channel` → `args` ⇒ `result`. New `window.api` bridge entries are added in `electron/preload.ts`.

---

## Employee Roles (new handlers — `electron/ipc/rolesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `roles:list` | — | `EmployeeRole[]` | admin |
| `roles:add` | `{ name: string }` | `EmployeeRole` | admin |
| `roles:update` | `{ id, patch: { name?, salary_type_id? } }` | `EmployeeRole` | admin |
| `roles:delete` | `{ id }` | `{ ok }` or throws if role has active employees | admin |

- `roles:delete` checks `employees WHERE role_id = id AND is_active = 1`; throws a descriptive bilingual error if any exist.
- All write operations mark `synced = 0` and update `updated_at`.

---

## Salary Types (new handlers — `electron/ipc/salaryTypesIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `salaryTypes:list` | — | `SalaryType[]` | admin |
| `salaryTypes:add` | `SalaryTypeInput` | `SalaryType` | admin |
| `salaryTypes:update` | `{ id, patch }` | `SalaryType` | admin |
| `salaryTypes:delete` | `{ id }` | `{ ok }` or throws if referenced | admin |

`SalaryTypeInput`: `{ name, mode, monthly_rate?, session_rate?, session_pct? }`

- `salaryTypes:delete` checks both `employee_roles.salary_type_id` and `employees.salary_type_override_id`; throws if any reference exists.
- Mode-specific validation enforced server-side (see data-model.md rules).

---

## Service Definitions (new handlers — `electron/ipc/serviceDefinitionsIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `serviceDefinitions:list` | — | `ServiceDefinition[]` (built-in + custom) | all (authenticated) |
| `serviceDefinitions:add` | `ServiceDefinitionInput` | `ServiceDefinition` | admin |
| `serviceDefinitions:update` | `{ id, patch }` | `ServiceDefinition` | admin |
| `serviceDefinitions:delete` | `{ id }` | `{ ok }` or throws if enrolled children exist | admin |

`ServiceDefinitionInput`: `{ name, price_monthly?, price_daily?, price_hourly? }` — at least one price must be non-null.

- `serviceDefinitions:list` is auth-level (not admin-only) because the enrollment form (accessible to employees) needs it.
- `serviceDefinitions:delete` checks `child_services WHERE service = name` before deleting; throws with affected child count.
- Built-in services (`is_custom = 0`) cannot be deleted — throws with a descriptive message.
- **PricingSettings.tsx** is updated to save built-in service price edits via `serviceDefinitions:update` instead of `settings:update`. The `settings` price keys become read-only legacy.

---

## Scheduled Sessions (new handlers — `electron/ipc/sessionsIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `sessions:list` | `{ month, year }` | `ScheduledSession[]` with `teachers: Teacher[]` nested | all (authenticated) |
| `sessions:add` | `SessionInput` | `ScheduledSession` | admin |
| `sessions:update` | `{ id, patch }` | `ScheduledSession` | admin |
| `sessions:delete` | `{ id }` | `{ ok }` or throws if attendance exists | admin |
| `sessions:assignTeachers` | `{ session_id, employee_ids: number[] }` | `{ ok }` | admin |
| `sessions:proRateCalc` | `{ child_id, billing_month, billing_year }` | `{ session_count, calculated_amount, per_session_price }` | admin |

`SessionInput`: `{ session_date, service_id?, group_name?, notes?, employee_ids? }`

- `sessions:delete` checks `attendance_records WHERE session_id = id`; throws if any attendance is recorded.
- `sessions:proRateCalc` counts `scheduled_sessions WHERE session_date >= children.reg_date AND session_date between first/last day of billing_month/year`, then returns the count × the child's per-session price. Used to pre-populate the confirmation step (FR-023).

---

## Attendance (new handlers — `electron/ipc/attendanceIPC.ts`)

| Channel | Args | Result | Access |
|---------|------|--------|--------|
| `attendance:getSheet` | `{ session_id }` | `AttendanceRecord[]` for all enrolled children | admin + assigned teachers |
| `attendance:record` | `AttendanceInput[]` | `AttendanceRecord[]` | admin + assigned teachers |
| `attendance:getConflicts` | — | `AttendanceConflict[]` where `reviewed = 0` | admin |
| `attendance:resolveConflict` | `{ conflict_id, final_status }` | `{ ok }` | admin |
| `attendance:getSummary` | `{ employee_id, month, year }` | `AttendanceSummary` | admin |

`AttendanceInput`: `{ session_id, child_id, status, excuse_notes? }`

`AttendanceSummary`: `{ total_sessions, payable_sessions, excused_absences, unexcused_absences, breakdown: SessionLine[] }`

- `attendance:getSheet` access check: admin always allowed; teacher allowed only if `session_teachers.employee_id = current_user_employee_id`. IPC validates via `requireAdmin()` or `checkAuth()` + employee lookup.
- `attendance:record` is a bulk upsert — inserts or updates all records in the input array within a single transaction. Sets `updated_at = NOW()` for conflict resolution.
- `attendance:resolveConflict` updates `attendance_records.status` to `final_status`, marks the conflict `reviewed = 1`, and sets `synced = 0` on the attendance record.

---

## Employees (changed — `electron/ipc/salariesIPC.ts`)

| Channel | Args change | Result change | Access |
|---------|-------------|---------------|--------|
| `employees:add` | + `role_id: number`, + optional `salary_type_override_id` | `Employee` now includes `role_id`, `salary_type_override_id` | admin |
| `employees:update` | patch may include `role_id`, `salary_type_override_id` | same | admin |
| `employees:get` | unchanged | `Employee[]` — each now includes `role_id`, `salary_type_override_id`, `role_name` (joined) | admin |

- `employees:add` validates `role_id` exists in `employee_roles`; throws if not.
- `employees:update` syncs `employees.role` TEXT from `employee_roles.name` when `role_id` changes (keeps legacy column consistent).

---

## Salary (changed — `electron/ipc/salariesIPC.ts`)

| Channel | Change |
|---------|--------|
| `salary:get` | Result includes `salary_type_name`, `salary_type_mode`; `actual_paid` is now computed from the employee's effective salary type + payable session count instead of `net_salary` alone |
| `salary:update` | Accepts optional `override_amount` to directly set `actual_paid` regardless of formula (admin override for exceptional cases) |

- `salary:get` computes `effective_salary_type` from `employee.salary_type_override_id ?? employee_role.salary_type_id`.
- For session-based modes, `salary:get` calls `attendance:getSummary` internally to get `payable_sessions`.

---

## Children (changed — `electron/ipc/childrenIPC.ts`)

| Channel | Change |
|---------|--------|
| `children:add` | Photo upload must complete before child record is saved; `photo_url`/`photo_public_id` from `storage:uploadPhoto` result are now required to be passed in |
| `children:update` | Same photo fix |

- **Photo fix (FR-024/FR-025)**: `children:add` and `children:update` no longer accept a raw data URL. The renderer must call `storage:uploadPhoto` first and pass the resulting URL. If upload was skipped (no photo or failed), both fields are null.
- **Pro-rated first payment**: when `children:add` is called with `generate_first_payment: true`, the handler calls `sessions:proRateCalc` internally, stores `prorated_calculated` on the new payment, and uses the admin-confirmed `confirmed_first_amount` as `price`. If `confirmed_first_amount` is absent, the calculated amount is used.

---

## Payments (changed)

| Channel | Change |
|---------|--------|
| `payments:generate` | Result rows now include `prorated_calculated` field (null for full-period payments) |

---

## `window.api` bridge additions (`electron/preload.ts`)

```text
api.roles.list()                       → 'roles:list'
api.roles.add(args)                    → 'roles:add'
api.roles.update(args)                 → 'roles:update'
api.roles.delete(args)                 → 'roles:delete'

api.salaryTypes.list()                 → 'salaryTypes:list'
api.salaryTypes.add(args)              → 'salaryTypes:add'
api.salaryTypes.update(args)           → 'salaryTypes:update'
api.salaryTypes.delete(args)           → 'salaryTypes:delete'

api.serviceDefinitions.list()          → 'serviceDefinitions:list'
api.serviceDefinitions.add(args)       → 'serviceDefinitions:add'
api.serviceDefinitions.update(args)    → 'serviceDefinitions:update'
api.serviceDefinitions.delete(args)    → 'serviceDefinitions:delete'

api.sessions.list(args)                → 'sessions:list'
api.sessions.add(args)                 → 'sessions:add'
api.sessions.update(args)              → 'sessions:update'
api.sessions.delete(args)              → 'sessions:delete'
api.sessions.assignTeachers(args)      → 'sessions:assignTeachers'
api.sessions.proRateCalc(args)         → 'sessions:proRateCalc'

api.attendance.getSheet(args)          → 'attendance:getSheet'
api.attendance.record(args)            → 'attendance:record'
api.attendance.getConflicts()          → 'attendance:getConflicts'
api.attendance.resolveConflict(args)   → 'attendance:resolveConflict'
api.attendance.getSummary(args)        → 'attendance:getSummary'
```

---

## Type additions (`src/types/index.ts`)

```typescript
EmployeeRole:        { id, name, salary_type_id: number|null, created_at, updated_at }
SalaryType:          { id, name, mode, monthly_rate?, session_rate?, session_pct?, created_at, updated_at }
ServiceDefinition:   { id, name, is_custom, price_monthly?, price_daily?, price_hourly?, created_at, updated_at }
ScheduledSession:    { id, session_date, service_id?, group_name?, notes?, teachers?: Teacher[], created_at, updated_at }
AttendanceRecord:    { id, session_id, child_id, status, excuse_notes?, recorded_by?, recorded_at, updated_at }
AttendanceConflict:  { id, attendance_record_id, overwritten_status, overwritten_by?, overwritten_at,
                       winning_status, winning_by?, winning_at, reviewed, created_at }
AttendanceSummary:   { total_sessions, payable_sessions, excused_absences, unexcused_absences, breakdown }
Employee:            + role_id, salary_type_override_id (nullable), role_name (joined string)
Payment:             + prorated_calculated (nullable REAL)
```
