# Contract: Environment Variables

The Electron main process loads `.env` from the app root at startup (`electron/env.ts`, first import in `main.ts`). This file is the authoritative list; `.env.example` MUST mirror it (FR-016). Real secrets MUST NOT be committed.

## Required

| Key | Type | Behavior if missing |
|-----|------|---------------------|
| `JWT_SECRET` | string (high-entropy) | **Production (`app.isPackaged`)**: app refuses to start, shows/logs a clear actionable error (FR-012). **Development**: warns and uses a generated dev secret. |

## Optional — sensitive / deployment-specific

| Key | Default | Notes |
|-----|---------|-------|
| `MONGO_URI` | (none) | Cloud sync URI; falls back to value saved in `settings` table. `getMongoUri()` already prefers settings, then this env. |
| `SEED_ADMIN_USERNAME` | `admin` | First-run admin seed only. |
| `SEED_ADMIN_PASSWORD` | (none) | First-run admin seed only. If unset, dev uses `admin123` with a warning; production requires it (or forces password change on first login). |
| `IMPORT_DEFAULT_YEAR` | current calendar year | Year assigned to imported payments/salaries (monthly sheets carry no year). |

## Optional — non-sensitive seed overrides (first-run only; FR-017)

Applied only when the corresponding `settings` row does not yet exist. Each maps to an existing key in `electron/db/seed.ts`.

| Env key | settings key | Code default |
|---------|--------------|--------------|
| `SEED_NURSERY_MONTHLY` | `nursery_monthly` | `2500` |
| `SEED_NURSERY_DAILY` | `nursery_daily` | `150` |
| `SEED_NURSERY_HOURLY` | `nursery_hourly` | `30` |
| `SEED_HOSTING_MONTHLY` | `hosting_monthly` | `3000` |
| `SEED_HOSTING_DAILY` | `hosting_daily` | `200` |
| `SEED_HOSTING_HOURLY` | `hosting_hourly` | `40` |
| `SEED_SESSION_HOURLY` | `session_hourly` | `100` |
| `SEED_SESSION_DAILY` | `session_daily` | `400` |
| `SEED_TARGET_PROFIT_PCT` | `target_profit_pct` | `0.20` |
| `SEED_MAX_CAPACITY` | `max_capacity` | `50` |
| `SEED_WORK_DAYS` | `work_days` | `22` |
| `SEED_WORK_HOURS` | `work_hours` | `8` |
| `SEED_BRAND_APP_NAME` | `brand_app_name` | `أكاديمية مهند الليثي` |
| `SEED_BRAND_ORG_NAME` | `brand_org_name` | (current default) |
| `SEED_BRAND_PRIMARY_COLOR` | `brand_primary_color` | `#0f766e` |
| `SEED_BRAND_ACCENT_COLOR` | `brand_accent_color` | `#f59e0b` |
| `SEED_BRAND_PHONE` | `brand_phone` | (current default) |
| `SEED_BRAND_EMAIL` | `brand_email` | (current default) |

> Branding override list may be trimmed during implementation to the keys operators realistically change; the table is the upper bound.

## Invariants

- No key in this contract has a hardcoded **secret** fallback in production source.
- Changing any value requires only editing `.env` — no source edits (SC-005).
- `.env.example` lists every key above with a safe placeholder and a one-line comment.
