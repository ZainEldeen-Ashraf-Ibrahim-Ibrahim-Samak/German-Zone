import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The migration reads app.getPath('userData'); point it at a throwaway directory
// that each test rebuilds, so nothing touches a real installation.
let userDataDir = ''

vi.mock('electron', () => ({
  ipcMain: { handle: () => {} },
  app: { getPath: () => userDataDir, isPackaged: false },
}))

import { migrateLegacyUserData } from '../../electron/db/legacyDataMigration.js'

let root = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gz-migration-'))
  userDataDir = path.join(root, 'german-zone')
  fs.mkdirSync(userDataDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** Build a pre-rebrand installation directory alongside the new one. */
function makeLegacyInstall(dirName: string, dbName = 'nursery.db') {
  const dir = path.join(root, dirName)
  fs.mkdirSync(path.join(dir, 'branding', 'fonts'), { recursive: true })
  fs.writeFileSync(path.join(dir, dbName), 'DATABASE')
  fs.writeFileSync(path.join(dir, `${dbName}-wal`), 'WAL')
  fs.writeFileSync(path.join(dir, `${dbName}-shm`), 'SHM')
  fs.writeFileSync(path.join(dir, 'branding', 'logo.png'), 'LOGO')
  fs.writeFileSync(path.join(dir, 'branding', 'fonts', 'Cairo.ttf'), 'FONT')
  return dir
}

const target = () => path.join(userDataDir, 'germanzone.db')

describe('migrateLegacyUserData', () => {
  it('copies the database from the dev-build userData directory', () => {
    makeLegacyInstall('nursery-management-system')

    const from = migrateLegacyUserData()

    expect(from).not.toBeNull()
    expect(fs.readFileSync(target(), 'utf8')).toBe('DATABASE')
  })

  it('copies the database from the packaged-build userData directory', () => {
    makeLegacyInstall('Nursery Autism Management System')

    expect(migrateLegacyUserData()).not.toBeNull()
    expect(fs.readFileSync(target(), 'utf8')).toBe('DATABASE')
  })

  it('brings the -wal and -shm sidecars across so recent commits survive', () => {
    makeLegacyInstall('nursery-management-system')

    migrateLegacyUserData()

    expect(fs.readFileSync(`${target()}-wal`, 'utf8')).toBe('WAL')
    expect(fs.readFileSync(`${target()}-shm`, 'utf8')).toBe('SHM')
  })

  it('brings branding logos and fonts across', () => {
    makeLegacyInstall('nursery-management-system')

    migrateLegacyUserData()

    expect(fs.readFileSync(path.join(userDataDir, 'branding', 'logo.png'), 'utf8')).toBe('LOGO')
    expect(fs.readFileSync(path.join(userDataDir, 'branding', 'fonts', 'Cairo.ttf'), 'utf8')).toBe('FONT')
  })

  it('handles a rebrand that kept the userData directory but renamed the file', () => {
    fs.writeFileSync(path.join(userDataDir, 'nursery.db'), 'DATABASE')

    expect(migrateLegacyUserData()).not.toBeNull()
    expect(fs.readFileSync(target(), 'utf8')).toBe('DATABASE')
  })

  it('leaves the original data in place rather than moving it', () => {
    const legacy = makeLegacyInstall('nursery-management-system')

    migrateLegacyUserData()

    expect(fs.existsSync(path.join(legacy, 'nursery.db'))).toBe(true)
  })

  it('does nothing on a fresh install', () => {
    expect(migrateLegacyUserData()).toBeNull()
    expect(fs.existsSync(target())).toBe(false)
  })

  it('never overwrites a database this installation already has', () => {
    makeLegacyInstall('nursery-management-system')
    fs.writeFileSync(target(), 'CURRENT')

    expect(migrateLegacyUserData()).toBeNull()
    expect(fs.readFileSync(target(), 'utf8')).toBe('CURRENT')
  })

  it('is idempotent — a second run is a no-op', () => {
    makeLegacyInstall('nursery-management-system')

    migrateLegacyUserData()
    fs.writeFileSync(target(), 'EDITED SINCE MIGRATING')

    expect(migrateLegacyUserData()).toBeNull()
    expect(fs.readFileSync(target(), 'utf8')).toBe('EDITED SINCE MIGRATING')
  })

  it('does not clobber branding that the new installation already has', () => {
    makeLegacyInstall('nursery-management-system')
    fs.mkdirSync(path.join(userDataDir, 'branding'), { recursive: true })
    fs.writeFileSync(path.join(userDataDir, 'branding', 'logo.png'), 'NEW LOGO')

    migrateLegacyUserData()

    expect(fs.readFileSync(path.join(userDataDir, 'branding', 'logo.png'), 'utf8')).toBe('NEW LOGO')
  })
})
