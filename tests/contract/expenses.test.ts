import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron modules
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__expensesHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__expensesHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

import '../../electron/ipc/expensesIPC.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Expenses IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__expensesHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    db.prepare('DELETE FROM expenses').run()
    setCurrentUser(null)
  })

  const adminSession = () => {
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  }

  const employeeSession = () => {
    setCurrentUser({ id: 2, username: 'emp1', role: 'employee', is_active: 1 })
  }

  describe('expenses:get', () => {
    it('should block employees from reading expenses', async () => {
      const handler = getHandlers()['expenses:get']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(handler(null, { year: 2026 })).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admin to get expenses for a year', async () => {
      const handler = getHandlers()['expenses:get']

      adminSession()
      const result = await handler(null, { year: 2026 })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('expenses:update', () => {
    it('should block employees from updating expenses', async () => {
      const handler = getHandlers()['expenses:update']
      expect(handler).toBeDefined()

      employeeSession()
      await expect(
        handler(null, { item: 'إيجار', month: 'يناير', year: 2026, amount: 2000 })
      ).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admin to upsert an expense entry', async () => {
      const handler = getHandlers()['expenses:update']

      adminSession()
      const result = await handler(null, {
        item: 'إيجار',
        month: 'يناير',
        year: 2026,
        amount: 3500,
        category: 'ثابت'
      })

      expect(result.item).toBe('إيجار')
      expect(result.month).toBe('يناير')
      expect(result.year).toBe(2026)
      expect(result.amount).toBe(3500)
      expect(result.category).toBe('ثابت')

      // Update same item/month/year with new amount (upsert)
      const updated = await handler(null, {
        item: 'إيجار',
        month: 'يناير',
        year: 2026,
        amount: 4000
      })
      expect(updated.amount).toBe(4000)
    })
  })

  describe('expenses:addItem and expenses:removeItem', () => {
    it('should block employees from adding or removing expense items', async () => {
      const addHandler = getHandlers()['expenses:addItem']
      const removeHandler = getHandlers()['expenses:removeItem']

      employeeSession()
      await expect(addHandler(null, { item: 'كهرباء' })).rejects.toThrow('FORBIDDEN')
      await expect(removeHandler(null, { item: 'كهرباء' })).rejects.toThrow('FORBIDDEN')
    })

    it('should allow admin to add and remove expense item templates', async () => {
      const addHandler = getHandlers()['expenses:addItem']
      const removeHandler = getHandlers()['expenses:removeItem']
      const getHandler = getHandlers()['expenses:get']

      adminSession()

      // Add a new expense item template
      const addResult = await addHandler(null, { item: 'ماء', category: 'خدمات' })
      expect(addResult.ok).toBe(true)

      // Get expenses — item should appear with zero amounts
      const list = await getHandler(null, { year: 2026 })
      const waterItem = list.find((e: any) => e.item === 'ماء' && e.month === 'يناير')
      expect(waterItem).toBeDefined()
      expect(waterItem.amount).toBe(0)

      // Remove expense item template
      const removeResult = await removeHandler(null, { item: 'ماء' })
      expect(removeResult.ok).toBe(true)
    })
  })

  describe('combined expenses computation', () => {
    it('should correctly aggregate annual totals per item', async () => {
      const updateHandler = getHandlers()['expenses:update']
      const getHandler = getHandlers()['expenses:get']

      adminSession()

      // Add 3 months of rent
      await updateHandler(null, { item: 'إيجار', month: 'يناير', year: 2026, amount: 3000 })
      await updateHandler(null, { item: 'إيجار', month: 'فبراير', year: 2026, amount: 3000 })
      await updateHandler(null, { item: 'إيجار', month: 'مارس', year: 2026, amount: 3000 })

      const expenses = await getHandler(null, { year: 2026 })
      const rentRows = expenses.filter((e: any) => e.item === 'إيجار')

      // Should have 12 months worth of entries (0 for unset months)
      expect(rentRows.length).toBe(12)

      const rentTotal = rentRows.reduce((s: number, r: any) => s + r.amount, 0)
      expect(rentTotal).toBe(9000)
    })
  })
})
