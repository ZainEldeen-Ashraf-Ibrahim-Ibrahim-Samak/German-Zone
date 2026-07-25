import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, getCurrentUser } from './_guard.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
}

// deductions:list — list all deductions for an employee in a given month/year
ipcMain.handle('deductions:list', async (_event, { employee_id, month, year }) => {
  checkAuth()
  const db = getDb()
  return db.prepare(
    'SELECT * FROM employee_deductions WHERE employee_id = ? AND month = ? AND year = ? ORDER BY created_at ASC'
  ).all(employee_id, month, Number(year))
})

// deductions:add — add a deduction item
ipcMain.handle('deductions:add', async (_event, { employee_id, month, year, reason, amount }) => {
  requireAdmin()
  const db = getDb()
  if (!reason || !reason.trim()) throw new Error('السبب مطلوب / Reason is required')
  const amountNum = Number(amount)
  if (isNaN(amountNum) || amountNum <= 0) throw new Error('المبلغ يجب أن يكون موجباً / Amount must be positive')
  const now = new Date().toISOString()
  const result = db.prepare(
    'INSERT INTO employee_deductions (employee_id, month, year, reason, amount, created_at, synced) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(employee_id, month, Number(year), reason.trim(), amountNum, now)
  return db.prepare('SELECT * FROM employee_deductions WHERE id = ?').get(result.lastInsertRowid)
})

// deductions:remove — remove a deduction item by id
ipcMain.handle('deductions:remove', async (_event, { id }) => {
  requireAdmin()
  const db = getDb()
  db.prepare('DELETE FROM employee_deductions WHERE id = ?').run(id)
  return { ok: true }
})
