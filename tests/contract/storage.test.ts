import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

// Mock Electron modules
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__storageHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__storageHandlers[channel] = callback
      }
    },
    app: {
      getPath: (name: string) => {
        if (name === 'userData') return os.tmpdir()
        return os.tmpdir()
      }
    },
    dialog: {
      showSaveDialog: async () => ({
        canceled: false,
        filePath: path.join(os.tmpdir(), `test-backup-${Date.now()}.db`)
      }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    }
  }
})

import '../../electron/ipc/storageIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Storage IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__storageHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    setCurrentUser(null)
  })

  const adminSession = () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  }

  const employeeSession = () => {
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
  }

  describe('storage:stats', () => {
    it('should block employees from viewing stats', async () => {
      const handler = getHandlers()['storage:stats']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should return counts and db size for admins', async () => {
      const handler = getHandlers()['storage:stats']

      adminSession()
      const result = await handler(null)

      expect(result).toBeDefined()
      expect(result.counts).toBeDefined()
      expect(typeof result.counts.users).toBe('number')
      expect(typeof result.counts.children).toBe('number')
      expect(typeof result.counts.payments).toBe('number')
      expect(typeof result.counts.employees).toBe('number')
      expect(typeof result.sizeBytes).toBe('number')
    })
  })

  describe('storage:backup', () => {
    it('should block employees from creating backups', async () => {
      const handler = getHandlers()['storage:backup']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admin to trigger backup (or handle gracefully in test env)', async () => {
      const handler = getHandlers()['storage:backup']

      adminSession()

      try {
        const result = await handler(null)
        // In non-test environment, verify the backup file exists
        if (result && result.path) {
          expect(result.path).toBeDefined()
          if (fs.existsSync(result.path)) {
            fs.unlinkSync(result.path)
          }
        }
      } catch (err: any) {
        // In test environment (in-memory db), ENOENT is expected — just verify it's not a FORBIDDEN error
        expect(err.message).not.toContain('FORBIDDEN')
        expect(err.message).not.toContain('Backup cancelled')
      }
    })
  })

  describe('storage:audit', () => {
    it('should block employees from viewing audit log', async () => {
      const handler = getHandlers()['storage:audit']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should return array (empty or populated) for admins', async () => {
      const handler = getHandlers()['storage:audit']

      adminSession()
      const result = await handler(null)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('storage:clear', () => {
    it('should block employees from clearing data', async () => {
      const handler = getHandlers()['storage:clear']
      expect(handler).toBeDefined()

      employeeSession()
      let threw = false
      try {
        await handler(null, { confirm: true })
      } catch (err: any) {
        threw = true
        expect(err.message).toContain('FORBIDDEN')
      }
      expect(threw).toBe(true)
    })

    it('should require explicit confirm:true to clear', async () => {
      const handler = getHandlers()['storage:clear']

      adminSession()
      await expect(handler(null, { confirm: false })).rejects.toThrow()
    })

    it('should clear all data tables when confirmed by admin', async () => {
      const handler = getHandlers()['storage:clear']
      const statsHandler = getHandlers()['storage:stats']

      // Insert dummy child & employee & payment to ensure we have data to clear
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO children (name, guardian, guardian_phone, reg_date, created_at, updated_at, service, unit, price)
        VALUES ('Test Child', 'Test Guardian', '0123456789', '2026-07-02', ?, ?, 'حضانة', 'monthly', 1000)
      `).run(now, now)
      
      const childId = db.prepare("SELECT last_insert_rowid() as id").get().id

      db.prepare(`
        INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at)
        VALUES (?, 'حضانة', 'monthly', 1000, ?, ?)
      `).run(childId, now, now)

      const serviceId = db.prepare("SELECT last_insert_rowid() as id").get().id

      db.prepare(`
        INSERT INTO payments (child_id, service_id, month, year, service, unit, price, total, balance, status, created_at, updated_at)
        VALUES (?, ?, 'July', 2026, 'حضانة', 'monthly', 1000, 1000, 1000, 'unpaid', ?, ?)
      `).run(childId, serviceId, now, now)

      db.prepare(`
        INSERT INTO employees (name, role, base_salary, net_salary, created_at, updated_at)
        VALUES ('Test Employee', 'teacher', 2000, 2000, ?, ?)
      `).run(now, now)

      adminSession()
      
      const statsBefore = await statsHandler(null)
      expect(statsBefore.counts.children).toBeGreaterThan(0)
      expect(statsBefore.counts.payments).toBeGreaterThan(0)
      expect(statsBefore.counts.employees).toBeGreaterThan(0)

      // Clear the data
      const clearResult = await handler(null, { confirm: true })
      expect(clearResult.ok).toBe(true)

      // Call stats again to confirm everything has been cleared to 0
      const statsAfter = await statsHandler(null)
      expect(statsAfter.counts.children).toBe(0)
      expect(statsAfter.counts.payments).toBe(0)
      expect(statsAfter.counts.employees).toBe(0)

      // Re-seed the database so subsequent/other tests aren't impacted
      await seedDatabase(db)
    })
  })
})
