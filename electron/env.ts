import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import { app } from 'electron'

/**
 * Configuration snapshotted at build time by vite.config.ts (whitelisted keys
 * only). Declared here because the identifier is replaced by the bundler;
 * under Vitest, where no replacement happens, we fall back to an empty object.
 */
declare const __BUILD_ENV__: Record<string, string> | undefined

/**
 * Centralised environment configuration loader.
 *
 * This module MUST be imported before any other module that reads `process.env`
 * (notably the IPC handlers), because ES module imports are evaluated in source
 * order — see specs/002-excel-import-env-config/research.md R7.
 *
 * Sensitive/deployment values come from the environment (`.env`); non-sensitive
 * seed defaults stay in code but are overridable here. In a packaged
 * (production) build the app refuses to start without a JWT secret (FR-012).
 */

// Load .env from the working directory (dev) and, when packaged, from every
// location an operator might reasonably drop one: next to the executable, in
// the install root's resources folder, and in the app's userData directory
// (the only one of the three that is writable on a locked-down machine).
// `dotenv` never overwrites a variable that is already set, so the first
// location to define a key wins.
dotenv.config()
try {
  if (app?.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    const candidates = [
      path.join(app.getPath('userData'), '.env'),
      path.join(exeDir, '.env'),
      path.join(exeDir, '.env.example'),
      path.join(process.resourcesPath ?? exeDir, '.env'),
    ]
    for (const candidate of candidates) {
      dotenv.config({ path: candidate })
    }
  }
} catch {
  // app/exe path unavailable (e.g. test runner) — ignore.
}

// Finally apply the build-time snapshot for anything still unset. A packaged
// build normally ships without any .env file at all, so this is what makes the
// installed app see its configuration.
try {
  const baked = typeof __BUILD_ENV__ !== 'undefined' ? __BUILD_ENV__ : undefined
  for (const [key, value] of Object.entries(baked ?? {})) {
    if (!process.env[key]?.trim() && value) process.env[key] = value
  }
} catch {
  // Identifier not replaced (unbundled test run) — nothing to apply.
}

const DEV_SECRET = 'dev_insecure_jwt_secret_do_not_use_in_production'

function isProduction(): boolean {
  try {
    return !!app?.isPackaged
  } catch {
    return false
  }
}

let devSecretWarned = false
let cachedLocalSecret: string | null = null

/**
 * Last-resort secret for a packaged build that was shipped without any
 * configuration: generate a strong random secret once and persist it in
 * userData. Tokens are only ever signed and verified by this same local
 * install, so a per-machine secret is both sufficient and safer than shipping
 * one constant to every customer. Returns null if userData is unwritable.
 */
function getOrCreateLocalSecret(): string | null {
  if (cachedLocalSecret) return cachedLocalSecret
  try {
    const file = path.join(app.getPath('userData'), 'jwt-secret.key')
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf-8').trim()
      if (existing) {
        cachedLocalSecret = existing
        return existing
      }
    }
    const generated = crypto.randomBytes(48).toString('hex')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, generated, { encoding: 'utf-8', mode: 0o600 })
    console.warn(
      '[env] JWT_SECRET not configured — generated a per-install secret at ' +
      `${file}. Existing sessions will need to sign in again.`
    )
    cachedLocalSecret = generated
    return generated
  } catch (err) {
    console.error('[env] Could not persist a generated JWT secret:', err)
    return null
  }
}

/**
 * The JWT signing secret: the environment (or the build-time snapshot) first,
 * then a per-install generated secret in production, then a fixed insecure
 * secret in development with a one-time warning.
 */
export function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim()
  if (fromEnv) return fromEnv

  if (isProduction()) {
    const local = getOrCreateLocalSecret()
    if (local) return local
    // Should be unreachable: checkRequiredConfig() halts startup first.
    throw new Error('JWT_SECRET is not configured.')
  }

  if (!devSecretWarned) {
    console.warn(
      '[env] JWT_SECRET not set — using an insecure development secret. ' +
      'Set JWT_SECRET in .env before shipping a production build.'
    )
    devSecretWarned = true
  }
  return DEV_SECRET
}

export interface ConfigCheck {
  ok: boolean
  error?: string
}

/**
 * Validate that required configuration is present for the current build.
 * A production build without a configured JWT_SECRET falls back to a
 * per-install generated secret (see getOrCreateLocalSecret); startup is only
 * halted when even that fails, i.e. when no secret can be obtained at all.
 */
export function checkRequiredConfig(): ConfigCheck {
  const secret = process.env.JWT_SECRET?.trim()
  if (isProduction() && !secret && !getOrCreateLocalSecret()) {
    return {
      ok: false,
      error:
        'JWT_SECRET is not configured and a local one could not be created.\n' +
        'Create a .env file next to the application (or in its user-data folder) ' +
        'and set JWT_SECRET to a long random value, then restart.'
    }
  }
  return { ok: true }
}

/** Initial admin credentials used only when seeding a fresh database. */
export function getSeedAdmin(): { username: string; password: string | null } {
  return {
    username: process.env.SEED_ADMIN_USERNAME?.trim() || 'admin',
    password: process.env.SEED_ADMIN_PASSWORD?.trim() || null
  }
}

/**
 * Resolve a non-sensitive seed setting: optional `envKey` override, else the
 * provided code default. Applied by the seeder only on first run (empty table).
 */
export function seedSetting(envKey: string, fallback: string): string {
  const v = process.env[envKey]?.trim()
  return v && v.length > 0 ? v : fallback
}

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
}

/**
 * Resolve Cloudinary credentials for student-photo upload (feature 004).
 * Accepts either the three discrete env vars or a single `CLOUDINARY_URL`
 * of the form `cloudinary://<api_key>:<api_secret>@<cloud_name>`.
 * Returns null when not configured — callers must handle this gracefully
 * (photo upload is optional; the student still saves). Credentials live only in
 * the main process and are never sent to the renderer.
 */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const url = process.env.CLOUDINARY_URL?.trim()
  if (url) {
    const m = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
    if (m) {
      return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] }
    }
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret }
  }
  return null
}
