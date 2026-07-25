import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron modules (dialog opens OS file dialogs, skip in tests)
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__brandingHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ; (globalThis as any).__brandingHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    }
  }
})

import '../../electron/ipc/brandingIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Branding IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__brandingHandlers

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

  describe('branding:get', () => {
    it('is readable by all authenticated users (no admin check)', async () => {
      const handler = getHandlers()['branding:get']
      expect(handler).toBeDefined()

      // No auth needed for get (branding is public for the renderer)
      const result = await handler(null)
      expect(result).toBeDefined()
      expect(result.brand_app_name).toBeDefined()
      expect(result.brand_primary_color).toBeDefined()
    })
  })

  describe('branding:save', () => {
    it('should block employees from saving branding', async () => {
      const handler = getHandlers()['branding:save']
      expect(handler).toBeDefined()

      employeeSession()
      let threw = false
      try {
        await handler(null, { brand_app_name: 'Hack' })
      } catch (err: any) {
        threw = true
        expect(err.message).toContain('FORBIDDEN')
      }
      expect(threw).toBe(true)
    })

    it('should allow admins to save branding data', async () => {
      const handler = getHandlers()['branding:save']

      adminSession()
      const result = await handler(null, {
        brand_app_name: 'Test Academy',
        brand_org_name: 'Test Organization',
        brand_primary_color: '#1d4ed8'
      })

      expect(result.ok).toBe(true)

      // Verify the data was persisted
      const getHandler = getHandlers()['branding:get']
      const branding = await getHandler(null)
      expect(branding.brand_app_name).toBe('Test Academy')
      expect(branding.brand_primary_color).toBe('#1d4ed8')
    })
  })

  describe('branding:reset', () => {
    it('should block employees from resetting branding', async () => {
      const handler = getHandlers()['branding:reset']
      expect(handler).toBeDefined()

      employeeSession()
      let threw = false
      try {
        await handler(null)
      } catch (err: any) {
        threw = true
        expect(err.message).toContain('FORBIDDEN')
      }
      expect(threw).toBe(true)
    })

    it('should allow admins to reset branding to defaults', async () => {
      const saveHandler = getHandlers()['branding:save']
      const resetHandler = getHandlers()['branding:reset']
      const getHandler = getHandlers()['branding:get']

      adminSession()

      // Change branding
      await saveHandler(null, { brand_app_name: 'Custom Name' })
      let branding = await getHandler(null)
      expect(branding.brand_app_name).toBe('Custom Name')

      // Reset to defaults
      const result = await resetHandler(null)
      expect(result.ok).toBe(true)

      branding = await getHandler(null)
      expect(branding.brand_app_name).toBe('أكاديمية مهند الليثي')
      expect(branding.brand_primary_color).toBe('#0f766e')
    })
  })

  describe('branding:upload-logo / branding:upload-icon', () => {
    it('should block employees from uploading logo', async () => {
      const handler = getHandlers()['branding:upload-logo']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should block employees from uploading icon', async () => {
      const handler = getHandlers()['branding:upload-icon']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admin to trigger file dialog (returns null on cancel)', async () => {
      const logoHandler = getHandlers()['branding:upload-logo']
      const iconHandler = getHandlers()['branding:upload-icon']

      adminSession()

      // Dialog is mocked to return canceled=true so result is null
      const logoResult = await logoHandler(null)
      expect(logoResult).toBeNull()

      const iconResult = await iconHandler(null)
      expect(iconResult).toBeNull()
    })
  })
})
