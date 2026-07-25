import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'
import type { Expense } from '../../src/types/index.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

/**
 * expenses:get
 * Returns all expense rows for a given year (12 months × all distinct items).
 * Items with no recorded amount appear with amount=0.
 * Admin only.
 */
ipcMain.handle('expenses:get', async (_event, { year }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!year) throw new Error('Year is required')

    // Get all distinct item names that have any entry (for any year)
    const itemNames = (db.prepare(
      'SELECT DISTINCT item FROM expenses ORDER BY item ASC'
    ).all() as { item: string }[]).map(r => r.item)

    if (itemNames.length === 0) {
      return []
    }

    // Get all rows for this year
    const rows = db.prepare(
      'SELECT * FROM expenses WHERE year = ? ORDER BY item ASC'
    ).all(year) as Expense[]

    // Build a full 12-month grid for each distinct item
    const result: Expense[] = []
    for (const item of itemNames) {
      // Resolve category from first real row for this item (any year/month)
      const categoryRow = db.prepare(
        'SELECT category FROM expenses WHERE item = ? AND category IS NOT NULL LIMIT 1'
      ).get(item) as { category: string | null } | undefined
      const category = categoryRow?.category ?? null

      for (const month of arabicMonths) {
        const found = rows.find((r) => r.item === item && r.month === month)
        if (found) {
          result.push(found)
        } else {
          // Virtual row with zero amount
          result.push({
            id: 0,
            item,
            month,
            year: Number(year),
            amount: 0,
            category,
            notes: null,
            created_at: '',
            synced: 0
          })
        }
      }
    }

    return result
  } catch (error: any) {
    console.error('Failed to get expenses:', error)
    throw new Error(error.message || 'Failed to get expenses')
  }
})

/**
 * expenses:update
 * Upsert a single expense row for (item, month, year).
 * Admin only.
 */
ipcMain.handle('expenses:update', async (_event, { item, month, year, amount, category = null, notes = null }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!item || !month || !year) {
      throw new Error('Item, month, and year are required')
    }

    const amountNum = Number(amount)
    if (isNaN(amountNum) || amountNum < 0) {
      throw new Error('Invalid amount value')
    }

    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO expenses (item, month, year, amount, category, notes, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(item, month, year) DO UPDATE SET
        amount = excluded.amount,
        category = excluded.category,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        synced = 0
    `).run(item, month, Number(year), amountNum, category, notes, now, now)

    const updated = db.prepare(
      'SELECT * FROM expenses WHERE item = ? AND month = ? AND year = ?'
    ).get(item, month, Number(year)) as Expense

    return updated
  } catch (error: any) {
    console.error('Failed to update expense:', error)
    throw new Error(error.message || 'Failed to update expense')
  }
})

/**
 * expenses:addItem
 * Registers a new expense item name so it shows in the 12-month grid.
 * Creates a placeholder row for the current year/current month (amount=0).
 * Admin only.
 */
ipcMain.handle('expenses:addItem', async (_event, { item, category = null }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!item || !item.trim()) {
      throw new Error('Item name is required')
    }

    const itemName = item.trim()

    // Check if item already exists for any year/month (any record)
    const exists = db.prepare('SELECT id FROM expenses WHERE item = ?').get(itemName)
    if (exists) {
      throw new Error(`بند "${itemName}" موجود مسبقاً / Item "${itemName}" already exists`)
    }

    // Create placeholder rows for all 12 months of the current year (amount=0)
    const now = new Date().toISOString()
    const year = new Date().getFullYear()
    const insertMany = db.transaction(() => {
      for (const month of arabicMonths) {
        db.prepare(`
          INSERT OR IGNORE INTO expenses (item, month, year, amount, category, notes, created_at, updated_at, synced)
          VALUES (?, ?, ?, 0, ?, NULL, ?, ?, 0)
        `).run(itemName, month, year, category, now, now)
      }
    })
    insertMany()

    return { ok: true }
  } catch (error: any) {
    console.error('Failed to add expense item:', error)
    throw new Error(error.message || 'Failed to add expense item')
  }
})

/**
 * expenses:removeItem
 * Removes all expense rows for a given item name (all months/years).
 * Admin only.
 */
ipcMain.handle('expenses:removeItem', async (_event, { item }) => {
  try {
    requireAdmin()
    const db = getDb()

    if (!item || !item.trim()) {
      throw new Error('Item name is required')
    }

    db.prepare('DELETE FROM expenses WHERE item = ?').run(item.trim())

    return { ok: true }
  } catch (error: any) {
    console.error('Failed to remove expense item:', error)
    throw new Error(error.message || 'Failed to remove expense item')
  }
})