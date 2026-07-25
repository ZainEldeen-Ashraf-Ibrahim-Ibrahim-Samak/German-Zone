import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

ipcMain.handle('teacherPayments:list', async (_event, filters) => {
  try {
    requireAdmin()
    const db = getDb()
    const { teacher_id, child_id, month, year } = filters || {}
    let query = `
      SELECT tp.*, e.name as teacher_name, c.name as child_name
      FROM teacher_payments tp
      JOIN employees e ON tp.teacher_id = e.id
      JOIN children c ON tp.child_id = c.id
      WHERE 1=1
    `
    const params: any[] = []
    if (teacher_id) { query += ' AND tp.teacher_id = ?'; params.push(teacher_id) }
    if (child_id) { query += ' AND tp.child_id = ?'; params.push(child_id) }
    if (month && year) {
      const mm = String(month).padStart(2, '0')
      query += ' AND strftime(\'%Y-%m\', tp.attendance_date) = ?'
      params.push(`${year}-${mm}`)
    }
    query += ' ORDER BY tp.attendance_date DESC'
    return db.prepare(query).all(...params)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list teacher payments')
  }
})

ipcMain.handle('teacherPayments:markPaid', async (_event, { ids }) => {
  try {
    requireAdmin()
    const db = getDb()
    const list: number[] = Array.isArray(ids) ? ids : []
    if (list.length === 0) return { ok: true, updated: 0 }
    const placeholders = list.map(() => '?').join(',')
    const now = new Date().toISOString()
    const result = db.prepare(`
      UPDATE teacher_payments SET status = 'paid', updated_at = ?, synced = 0
      WHERE id IN (${placeholders}) AND status = 'pending'
    `).run(now, ...list)
    return { ok: true, updated: Number(result.changes) }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to mark payments as paid')
  }
})
