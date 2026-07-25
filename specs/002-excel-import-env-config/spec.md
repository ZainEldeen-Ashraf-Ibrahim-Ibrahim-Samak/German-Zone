# Feature Specification: Excel Data Import & Environment-Based Configuration

**Feature Branch**: `002-excel-import-env-config`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "make this Nursery_V4_Final_5.xlsx can be imported from [it] for all data in it. make all the important [values] and seed in env for avoid hard coded"

## Clarifications

### Session 2026-06-07

- Q: How much of the configuration/seed data should move to `.env`? → A: Sensitive/deployment-specific values (security secret, initial admin login, Mongo URI) are required in `.env`; non-sensitive seed defaults (pricing, capacity, targets, branding) stay in code as defaults but are overridable via optional `.env` keys.
- Q: How should the import populate required child fields (guardian, phone, unit, registration date) that the workbook does not contain? → A: Auto-fill missing required fields with safe placeholder defaults so the child imports successfully and can be completed later in the app.
- Q: What should happen when no security signing secret is configured in a production build? → A: The production build MUST refuse to start and show a clear, actionable error (hard-fail; no fallback to a built-in default secret).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import all data from the existing workbook (Priority: P1)

An administrator who has been running the nursery on the `Nursery_V4_Final_5.xlsx` workbook wants to move into the management system without re-typing everything. They open the import screen, select the workbook, and the system reads every sheet and loads all of the data it contains — children and their monthly payments, employees and their salary payments, and expenses — into the system, then shows a summary of what was imported and what was skipped.

**Why this priority**: This is the core ask and the primary onboarding path. Without it, an existing user cannot adopt the system without manual re-entry, which is the single biggest barrier to adoption. It delivers standalone value: even with nothing else, a user can get a full year of historical records into the app.

**Independent Test**: Provide the real `Nursery_V4_Final_5.xlsx` file, run the import on a clean database, and confirm that the resulting children, payments, employees, salaries, and expenses match the contents of the workbook, with a summary reporting the counts.

**Acceptance Scenarios**:

1. **Given** a clean database and the `Nursery_V4_Final_5.xlsx` workbook, **When** the admin imports the file, **Then** every child, payment, employee, salary payment, and expense present in the workbook appears in the system and the summary reports the imported counts per category.
2. **Given** a workbook with monthly payment sheets, **When** the import runs, **Then** each child appears once even if they appear across multiple monthly sheets, and a separate payment record is created for each month they appear in.
3. **Given** data has already been imported once, **When** the same workbook is imported again, **Then** no duplicate records are created and the summary reports the previously-present rows as skipped.
4. **Given** a workbook row with missing or malformed values (blank name, non-numeric amount), **When** the import runs, **Then** the row is skipped without aborting the whole import and the import completes for all valid rows.

---

### User Story 2 - Configuration and seed values come from the environment, not hardcoded (Priority: P1)

An administrator (or whoever deploys the app) wants the sensitive and deployment-specific values — security secrets, the cloud sync connection string, the initial admin login, and the initial default settings used to seed a fresh database — to be supplied through environment configuration rather than baked into the source code. They set these values in an environment file before first run; the system uses them when it seeds a new database and when it operates, and it never falls back to a hardcoded secret in production.

**Why this priority**: Hardcoded secrets (the JWT signing key, the default `admin`/`admin123` login) are a security risk, and hardcoded seed values make the app impossible to configure per-deployment without editing code. This is explicitly requested and is a prerequisite for safely distributing the app.

**Independent Test**: Set the configuration values in the environment file, start the app against a clean database, and confirm the first admin account, security secret, and seeded default settings reflect the environment values rather than the previous hardcoded ones; remove a required secret and confirm the app refuses to start (or warns clearly) instead of silently using a default.

**Acceptance Scenarios**:

1. **Given** an environment file specifying the initial admin username and password, **When** the database is seeded for the first time, **Then** the first admin account uses those credentials instead of a hardcoded default.
2. **Given** an environment file specifying the security signing secret, **When** the app issues and validates login sessions, **Then** it uses the configured secret.
3. **Given** no security secret is configured, **When** the app starts in a production build, **Then** it refuses to start and shows a clear, actionable error rather than silently using a built-in default secret.
4. **Given** an environment file overriding seed values (e.g., default pricing, capacity, branding), **When** a fresh database is seeded, **Then** the seeded settings reflect the configured values, and where a value is not provided the documented default is used.
5. **Given** an `.env.example` file, **When** a new operator sets up the app, **Then** the example lists every supported configuration key with a safe placeholder and a short description.

---

### Edge Cases

- **Unknown or extra sheets**: The workbook contains sheets that don't match any known category (cover sheet, totals, charts) — these are ignored and listed in the summary as untouched.
- **Sheet/column layout differs from the expected layout**: A monthly sheet is missing an expected column or uses a different order — the import skips rows it cannot interpret rather than inserting wrong data, and reports them.
- **Partial / interrupted import**: If the import fails partway, the database is not left in a half-written inconsistent state for the affected batch (the import is atomic per logical unit or fully rolled back).
- **Duplicate child names**: Two different children share the same name in the workbook — the system must have a defined behavior (treat as same vs. distinct) so payments are not misattributed. *(See assumption below.)*
- **Re-import after edits**: A record was imported then edited in the app; re-importing the workbook must not overwrite the edited values (skip-existing behavior).
- **Missing environment file**: No `.env` present — the app uses documented defaults for non-sensitive values but refuses to use a hardcoded secret for sensitive ones in production.
- **Large workbook**: A workbook with a full year of data across many children does not freeze the UI; progress/feedback is shown.

## Requirements *(mandatory)*

### Functional Requirements

#### Data Import

- **FR-001**: The system MUST allow an administrator to select and import the `Nursery_V4_Final_5.xlsx` workbook (and workbooks of the same structure) from within the application.
- **FR-002**: The system MUST read all data-bearing sheets in the workbook and import every supported entity it finds: children, monthly payments, employees, salary payments, and expenses.
- **FR-003**: The system MUST create each child only once even when the child appears in multiple monthly sheets, while creating a distinct payment record per child per month present.
- **FR-004**: The import MUST be idempotent: re-importing the same workbook MUST NOT create duplicate records, and already-present rows MUST be reported as skipped.
- **FR-005**: The import MUST NOT overwrite records that already exist in the system (existing data and in-app edits take precedence over re-imported rows).
- **FR-006**: The system MUST skip individual rows that are blank or cannot be interpreted, continue importing remaining valid rows, and never abort the entire import because of a single bad row.
- **FR-006a**: When a workbook row identifies a valid child/record but omits fields the system treats as required (e.g., guardian name, guardian phone, unit, registration date), the system MUST auto-fill those fields with safe placeholder defaults (deriving registration date from the source sheet's month/year where available) so the record imports successfully and can be completed later in the app, rather than skipping it.
- **FR-007**: The system MUST present a summary after import showing, per category, how many records were imported and how many were skipped, plus the list of sheets that were processed and those ignored.
- **FR-008**: Import MUST be restricted to administrators.
- **FR-009**: Imported records MUST be written so that they are eligible for the existing cloud sync (treated as not-yet-synced local changes).
- **FR-010**: The data the import writes MUST conform to the system's current data structure for each entity, so imported records are immediately usable everywhere in the app (rosters, statements, dashboards, exports).

#### Environment-Based Configuration & Seeding

- **FR-011**: The system MUST read the security signing secret used for login sessions from environment configuration rather than a hardcoded value.
- **FR-012**: In a production build, the system MUST NOT fall back to a built-in default security secret; if none is configured it MUST refuse to start and present a clear, actionable error (hard-fail). (A development build MAY use a generated/default secret for convenience.)
- **FR-013**: The system MUST read the initial administrator username and password (used only when seeding a fresh database) from environment configuration, instead of the hardcoded `admin`/`admin123`.
- **FR-014**: The system MUST read the cloud sync connection string from environment configuration when one has not been saved in settings.
- **FR-015**: The sensitive/deployment-specific values (security signing secret, initial admin username/password, cloud sync connection string) MUST be supplied via environment configuration. The non-sensitive seed defaults (pricing, capacity, targets, branding text) MUST remain available as built-in defaults but MUST be overridable by optional environment keys when present; operators are NOT required to set them to start the app.
- **FR-016**: The system MUST provide an `.env.example` file enumerating every supported configuration key with a safe placeholder value and a brief description, and MUST NOT commit real secrets to the repository.
- **FR-017**: Environment-driven seed values MUST only apply when seeding a fresh/empty database; they MUST NOT overwrite settings or accounts that already exist.

### Key Entities *(include if feature involves data)*

- **Child**: A child enrolled at the nursery; identified for import purposes by name; carries a service type and fee, and is linked to monthly payment records.
- **Payment**: A monthly charge for a child (month, year, service, amount due, amount paid, balance, status); unique per child + month + year + service.
- **Employee**: A staff member with base salary and allowances; identified for import by name.
- **Salary Payment**: A monthly salary disbursement for an employee (month, year, allowances/bonus/deductions, amount paid); unique per employee + month + year.
- **Expense**: An operating cost item for a given month and year (item, amount); unique per item + month + year.
- **Configuration / Seed Settings**: Named key/value settings (security secret, initial admin credentials, sync connection string, pricing, capacity, targets, branding) supplied via environment and used to operate the app and seed a fresh database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can import the full `Nursery_V4_Final_5.xlsx` workbook into a clean system in a single action, with 100% of valid rows loaded and a summary confirming the counts.
- **SC-002**: Importing the same workbook a second time results in zero duplicate records.
- **SC-003**: After import, imported children, payments, salaries, and expenses appear correctly in the rosters, statements, dashboards, and exports without any manual correction for valid rows.
- **SC-004**: No security secret or login credential is present in the source code; 100% of sensitive and deployment-specific values are sourced from environment configuration.
- **SC-005**: A new operator can configure and launch the app for the first time using only the `.env.example` file as a guide, with no source-code edits required.
- **SC-006**: Starting a production build without a configured security secret halts startup with a clear, actionable error rather than silently using a default.
- **SC-007**: A malformed or partially invalid workbook never leaves the database in a corrupted state and never crashes the application.

## Assumptions

- The workbook to import follows the structure of the existing `Nursery_V4_Final_5.xlsx`: monthly payment sheets named with an Arabic month and a year, a salaries/employees sheet, and an expenses sheet. Sheets that don't match are ignored.
- Children are matched by their (Arabic) full name; two distinct children with the same exact name are treated as the same person for import purposes (documented limitation). A future enhancement could add a stronger identifier.
- "Import for all data in it" means the supported entities listed above (children, payments, employees, salaries, expenses). Charts, totals, and presentation-only sheets are out of scope.
- The import is additive and non-destructive: it never deletes or overwrites existing in-app data; conflicts resolve in favor of existing records (skip).
- Environment configuration is delivered via a standard `.env` file (and `.env.example` template) consistent with the project's existing `.env`/`.env.example` setup.
- Seed values from the environment apply only on first-run seeding of an empty database; they do not migrate or change an already-populated database.
- Currency remains EGP and the bilingual Arabic/English presentation is unchanged by this feature.
- The existing cloud sync mechanism is reused; imported rows are flagged as unsynced so they sync normally.
