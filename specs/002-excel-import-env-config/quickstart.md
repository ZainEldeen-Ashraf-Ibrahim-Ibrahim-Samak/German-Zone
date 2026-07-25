# Quickstart: Excel Import & Env Configuration

## 1. Configure the environment (first-time setup)

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at least:

```dotenv
# Required — app refuses to start a production build without this
JWT_SECRET=<paste a long random string>

# Optional
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/nursery_db
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<choose a strong password>
IMPORT_DEFAULT_YEAR=2025
```

- In **development** (`npm run dev`), a missing `JWT_SECRET` produces a console warning and a generated dev secret.
- In a **packaged build**, a missing `JWT_SECRET` halts startup with a clear error (FR-012).
- Seed overrides (`SEED_*`) apply **only** when seeding a fresh/empty database.

## 2. Run the app

```powershell
npm run dev      # development
# or
npm run dist:win # packaged build
```

On first run against an empty database, the admin account and default settings are seeded from `.env` (falling back to documented defaults).

## 3. Import the workbook

1. Log in as an admin.
2. Open **Storage** (التخزين) → **Import from Excel**.
3. Select `Nursery_V4_Final_5.xlsx` (or a workbook with the same layout).
4. Review the summary: children / payments / employees / salaries / expenses imported vs skipped, the sheets processed/ignored, and the resolved import year.

Re-running the import on the same file imports **0** new rows (everything reported as skipped) — safe to repeat.

## 4. Verify

- **Children**: master roster (`👶 بيانات الأطفال`) appears with guardian, phone, unit, price.
- **Payments**: each of the 12 month sheets produced a payment per listed child; status recomputed from paid vs total.
- **Salaries**: 11 employees with base/allowances/net; monthly salary payments present.
- **Expenses**: each item × non-zero month present.
- **Sync**: imported rows show as pending (unsynced) in the Sync page.

## 5. Tests

```powershell
npm run test   # vitest: import contract (fixture workbook) + env-config unit tests
```

Expected: importer maps a fixture workbook to the correct rows and is idempotent; env resolution returns env values over defaults; production-mode missing-secret check fails fast.
