import path from 'node:path'
import dotenv from 'dotenv'
import { app } from 'electron'

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

// Load .env from the working directory (dev) and, when packaged, from next to
// the executable so operators can drop a .env beside the installed app.
dotenv.config()
try {
  if (app?.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    const envPath = path.join(exeDir, '.env')
    const envExamplePath = path.join(exeDir, '.env.example')
    // Load .env if present; fall back to .env.example so the app works on first install.
    dotenv.config({ path: envPath })
    dotenv.config({ path: envExamplePath })
  }
} catch {
  // app/exe path unavailable (e.g. test runner) — ignore.
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

/**
 * The JWT signing secret. In production it must come from the environment;
 * in development a fixed insecure secret is used with a one-time warning.
 */
export function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim()
  if (fromEnv) return fromEnv

  if (isProduction()) {
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
 * Production build with no JWT secret → not ok (caller must halt startup).
 */
export function checkRequiredConfig(): ConfigCheck {
  const secret = process.env.JWT_SECRET?.trim()
  if (isProduction() && !secret) {
    return {
      ok: false,
      error:
        'JWT_SECRET is not configured. The application cannot start securely.\n' +
        'Create a .env file (see .env.example) next to the application and set ' +
        'JWT_SECRET to a long random value, then restart.'
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
 * Resolve Cloudinary credentials for child-photo upload (feature 004).
 * Accepts either the three discrete env vars or a single `CLOUDINARY_URL`
 * of the form `cloudinary://<api_key>:<api_secret>@<cloud_name>`.
 * Returns null when not configured — callers must handle this gracefully
 * (photo upload is optional; the child still saves). Credentials live only in
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
