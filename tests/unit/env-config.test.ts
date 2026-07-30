import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock Electron; `app.isPackaged` is driven by a mutable global so tests can
// simulate development vs. packaged (production) builds.
vi.mock('electron', () => ({
  app: {
    // Point userData at the OS temp dir so the generated-secret test does not
    // write into the repository.
    getPath: () => process.env.TEMP || process.env.TMPDIR || '.',
    get isPackaged() {
      return (globalThis as any).__isPackaged ?? false
    }
  }
}))

import { getJwtSecret, checkRequiredConfig, getSeedAdmin, seedSetting } from '../../electron/env.js'

beforeEach(() => {
  delete process.env.JWT_SECRET
  delete process.env.SEED_ADMIN_USERNAME
  delete process.env.SEED_ADMIN_PASSWORD
  ;(globalThis as any).__isPackaged = false
})

describe('env config — secret resolution', () => {
  it('returns the env secret when set', () => {
    process.env.JWT_SECRET = 'super-secret-value'
    expect(getJwtSecret()).toBe('super-secret-value')
  })

  it('falls back to a dev secret in development when unset', () => {
    ;(globalThis as any).__isPackaged = false
    const s = getJwtSecret()
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })

  it('checkRequiredConfig passes in dev without a secret', () => {
    ;(globalThis as any).__isPackaged = false
    expect(checkRequiredConfig().ok).toBe(true)
  })

  // A packaged build ships without a .env, so an unset JWT_SECRET must not be
  // fatal: the app provisions a per-install secret in userData instead.
  it('checkRequiredConfig passes in production without a secret', () => {
    ;(globalThis as any).__isPackaged = true
    expect(checkRequiredConfig().ok).toBe(true)
  })

  it('getJwtSecret returns a persisted generated secret in production', () => {
    ;(globalThis as any).__isPackaged = true
    const s = getJwtSecret()
    expect(s).not.toBe('')
    expect(s.length).toBeGreaterThanOrEqual(32)
    // Stable across calls, so tokens stay valid between requests.
    expect(getJwtSecret()).toBe(s)
  })
})

describe('env config — seed values', () => {
  it('getSeedAdmin defaults to admin / null', () => {
    expect(getSeedAdmin()).toEqual({ username: 'admin', password: null })
  })

  it('getSeedAdmin reads env overrides', () => {
    process.env.SEED_ADMIN_USERNAME = 'boss'
    process.env.SEED_ADMIN_PASSWORD = 'p@ss'
    expect(getSeedAdmin()).toEqual({ username: 'boss', password: 'p@ss' })
  })

  it('seedSetting prefers env over fallback', () => {
    process.env.SEED_MAX_CAPACITY = '99'
    expect(seedSetting('SEED_MAX_CAPACITY', '50')).toBe('99')
    expect(seedSetting('SEED_NOT_SET', '50')).toBe('50')
  })
})
