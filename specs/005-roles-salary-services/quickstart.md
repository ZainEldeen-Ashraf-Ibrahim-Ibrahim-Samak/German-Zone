# Developer Quickstart: Dynamic Roles, Salary Configuration & Service Enhancements

Branch: `005-roles-salary-services`

---

## What changed at a glance

| Area | Change type | Key files |
|------|-------------|-----------|
| DB schema | 5 new migrations (014–018) | `electron/db/migrations/index.ts` |
| Employee roles | New dynamic role system replacing hard-coded strings | `electron/ipc/rolesIPC.ts` (new) |
| Salary types | New salary calculation engine | `electron/ipc/salaryTypesIPC.ts` (new), `salariesIPC.ts` (modified) |
| Service definitions | New table replacing settings-based pricing | `electron/ipc/serviceDefinitionsIPC.ts` (new) |
| Sessions & attendance | New session calendar + attendance recording | `electron/ipc/sessionsIPC.ts` (new), `attendanceIPC.ts` (new) |
| Sync | 7 new Mongoose models + 2 updated | `electron/services/mongoSync.ts` |
| Renderer — Settings | New sub-pages: Service Definitions, Salary Types | `src/pages/Settings/` |
| Renderer — Sessions | New pages: Session Calendar, Attendance Sheet | `src/pages/Sessions/` |
| Renderer — Employees | Role dropdown with inline add-new | `src/pages/Employees/EmployeesList.tsx` |
| Renderer — Children | 3 bug fixes: photo upload, price display, additional classes | `src/pages/Children/ChildForm.tsx` |
| Renderer — Salaries | Attendance-based calculation display | `src/pages/SalariesList.tsx` |
| IPC bridge | 5 new API namespaces | `electron/preload.ts` |

---

## Running the app after this change

```bash
npm run dev
```

Migrations 014–018 run automatically on first launch. Existing employee records are auto-migrated to `employee_roles` (FR-035/FR-036). Migrated roles have no salary type assigned — the UI flags them with a warning badge.

---

## Testing a fresh installation

1. Launch app — migrations run, three built-in service definitions are seeded.
2. Go to Settings → Salary Types → add a "Fixed Monthly 5000 EGP" type.
3. Go to Settings → Employee Roles → assign the salary type to an existing role.
4. Go to Employees → add an employee — confirm role dropdown shows dynamic roles and "Add new role" button is present.
5. Go to Settings → Services → add a custom service "OT Program" with monthly price 1500 EGP.
6. Go to Children → add a child — confirm service dropdown includes "OT Program" and monthly price auto-populates.
7. Go to Sessions → add a session for today, assign a teacher, open Attendance — mark children.
8. Go to Salaries — run calculation for the current month and confirm session-based employees show correct payable session counts.

---

## Key implementation notes

### Migration 014 — role auto-migration

The migration scans `employees.role` for unique strings and inserts them into `employee_roles` using `INSERT OR IGNORE`. This means re-running the migration is safe. The original `employees.role` TEXT column is **not dropped** — it is kept in sync on every write so that any code still reading it directly doesn't break.

### Salary type resolution

Always resolve the effective salary type at calculation time:
```typescript
const effectiveSalaryTypeId = employee.salary_type_override_id ?? employeeRole.salary_type_id
```
Never cache this resolution on the employee record — it must re-evaluate when either the override or the role default changes.

### Photo upload fix

The renderer must call `storage:uploadPhoto` **before** calling `children:add` or `children:update`. The pattern:
```typescript
let photoUrl: string | null = null
let photoPublicId: string | null = null
if (selectedPhotoDataUrl) {
  const result = await window.api.storage.uploadPhoto({ dataUrl: selectedPhotoDataUrl })
  photoUrl = result.url
  photoPublicId = result.publicId
}
await window.api.children.add({ ...childData, photo_url: photoUrl, photo_public_id: photoPublicId })
```

### Pro-rating first payment

Call `sessions:proRateCalc` after enrollment date is confirmed. Display the result in a confirmation modal with an editable amount field. Pass `confirmed_first_amount` to `children:add` or the first `payments:generate` call.

### Attendance-based salary calculation

`salary:get` for session-based employees calls `attendance:getSummary` internally. The summary's `payable_sessions` count drives the formula. The salary list displays a breakdown badge showing paid vs excused sessions.

### Service definition lookup in enrollment form

Load service definitions once on `ChildForm` mount:
```typescript
const services = await window.api.serviceDefinitions.list()
```
On service or billing type change, derive price from the local cache:
```typescript
const svc = services.find(s => s.name === selectedService)
const price = billingType === 'monthly' ? svc?.price_monthly
            : billingType === 'daily'   ? svc?.price_daily
            :                             svc?.price_hourly
setPrice(price ?? 0)
```

### Additional classes display

Split the enrollment summary into two lines:
```typescript
const baseAmount = child_service.price           // from child_services
const additionalAmount = extra_lessons * session_price
const totalFee = baseAmount + additionalAmount
```
Render as: **Base service**: {baseAmount} EGP + **Additional classes** ({extra_lessons} × {session_price}): {additionalAmount} EGP = **Total**: {totalFee} EGP.

### Offline sync for attendance

When syncing `attendance_records`, the sync engine must detect overwrites:
1. Before upserting, read the existing cloud record's `updated_at`.
2. If cloud record has `synced = 1` and local `updated_at` > cloud `updated_at` and the status values differ → create an `attendance_conflicts` row locally before overwriting.
3. Mark the attendance record `synced = 0` after conflict creation so it pushes the conflict log on the next sync pass.

---

## New renderer pages to create

| Page | Path | Description |
|------|------|-------------|
| Session Calendar | `src/pages/Sessions/SessionCalendar.tsx` | Month-view list of scheduled sessions; add/edit/delete; teacher assignment |
| Attendance Sheet | `src/pages/Sessions/AttendanceSheet.tsx` | Per-session attendance recording; status per child |
| Attendance Conflicts | `src/pages/Sessions/AttendanceConflicts.tsx` | Admin conflict review list |
| Service Definitions | `src/pages/Settings/ServiceDefinitions.tsx` | Manage custom services (add/edit/delete) |
| Salary Types | `src/pages/Settings/SalaryTypes.tsx` | Manage salary type definitions |

Add routes in `App.tsx` and sidebar links in `Sidebar.tsx`.

---

## Sync entities added to `SYNC_ENTITIES`

```typescript
{ name: 'salary_types',          model: SalaryTypeModel,          table: 'salary_types' },
{ name: 'employee_roles',        model: EmployeeRoleModel,         table: 'employee_roles' },
{ name: 'service_definitions',   model: ServiceDefinitionModel,    table: 'service_definitions' },
{ name: 'scheduled_sessions',    model: ScheduledSessionModel,     table: 'scheduled_sessions' },
{ name: 'session_teachers',      model: SessionTeacherModel,       table: 'session_teachers' },
{ name: 'attendance_records',    model: AttendanceRecordModel,     table: 'attendance_records' },
{ name: 'attendance_conflicts',  model: AttendanceConflictModel,   table: 'attendance_conflicts' },
```
