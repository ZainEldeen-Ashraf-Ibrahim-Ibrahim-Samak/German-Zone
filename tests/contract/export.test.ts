import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'
import { dialog } from 'electron'

// Mock Electron modules
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__exportHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__exportHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    },
    dialog: {
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: 'mock-save-path.xlsx' })
    }
  }
})

// Mock the services to avoid filesystem writes during contract testing
vi.mock('../../electron/services/exportService.js', () => ({
  buildExcelFile: vi.fn().mockResolvedValue(true)
}))
vi.mock('../../electron/services/pdfService.js', () => ({
  buildPdfFile: vi.fn().mockResolvedValue(true)
}))

// Import the IPC file to register the handlers
import '../../electron/ipc/exportIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Export IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__exportHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    setCurrentUser(null)
    vi.clearAllMocks()
  })

  const adminSession = () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  }

  const employeeSession = () => {
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
  }

  it('should block anonymous users from all export channels', async () => {
    const handlers = getHandlers()
    
    // Check all channels require authentication
    await expect(handlers['export:month'](null, { month: 'يناير', year: 2026, format: 'xlsx', lang: 'ar' })).rejects.toThrow('UNAUTHORIZED')
    await expect(handlers['export:child'](null, { childId: 1, format: 'xlsx', lang: 'ar' })).rejects.toThrow('UNAUTHORIZED')
    await expect(handlers['export:full'](null, { year: 2026, format: 'xlsx', lang: 'ar' })).rejects.toThrow('UNAUTHORIZED')
  })

  it('should allow employees to export month and child statement, but block them from full, salaries, and expenses', async () => {
    const handlers = getHandlers()
    employeeSession()

    // 1. Should succeed for child statement
    const childRes = await handlers['export:child'](null, { childId: 1, format: 'xlsx', lang: 'ar' })
    expect(childRes).toEqual({ filePath: 'mock-save-path.xlsx' })

    // 2. Should succeed for month sheet
    const monthRes = await handlers['export:month'](null, { month: 'يناير', year: 2026, format: 'xlsx', lang: 'ar' })
    expect(monthRes).toEqual({ filePath: 'mock-save-path.xlsx' })

    // 3. Should fail with FORBIDDEN for admin-only exports
    await expect(handlers['export:full'](null, { year: 2026, format: 'xlsx', lang: 'ar' })).rejects.toThrow('FORBIDDEN')
    await expect(handlers['export:salaries'](null, { month: 'يناير', year: 2026, format: 'xlsx', lang: 'ar' })).rejects.toThrow('FORBIDDEN')
    await expect(handlers['export:expenses'](null, { year: 2026, format: 'xlsx', lang: 'ar' })).rejects.toThrow('FORBIDDEN')
  })

  it('should allow admins to export everything', async () => {
    const handlers = getHandlers()
    adminSession()

    const fullRes = await handlers['export:full'](null, { year: 2026, format: 'xlsx', lang: 'ar' })
    expect(fullRes).toEqual({ filePath: 'mock-save-path.xlsx' })

    const salRes = await handlers['export:salaries'](null, { month: 'يناير', year: 2026, format: 'xlsx', lang: 'ar' })
    expect(salRes).toEqual({ filePath: 'mock-save-path.xlsx' })

    const expRes = await handlers['export:expenses'](null, { year: 2026, format: 'xlsx', lang: 'ar' })
    expect(expRes).toEqual({ filePath: 'mock-save-path.xlsx' })
  })

  it('should handle save dialog cancellations gracefully', async () => {
    const handlers = getHandlers()
    adminSession()

    // Mock dialog cancellation
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: '' })

    const res = await handlers['export:full'](null, { year: 2026, format: 'xlsx', lang: 'ar' })
    expect(res).toBeNull()
  })
})
