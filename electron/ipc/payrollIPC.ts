import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

ipcMain.handle('payroll:report', async (_event, { month, year }) => {
  try {
    requireAdmin()
    const db = getDb()
    const mm = String(month).padStart(2, '0')
    const monthKey = `${year}-${mm}`

    const rows = db.prepare(`
      SELECT
        e.id as teacher_id,
        e.name as teacher_name,
        e.teacher_session_rate as session_cost,
        COUNT(tp.id) as sessions_paid,
        COALESCE(SUM(tp.session_cost), 0) as total_salary
      FROM employees e
      JOIN teacher_payments tp ON tp.teacher_id = e.id
        AND tp.status IN ('pending','paid')
        AND strftime('%Y-%m', tp.attendance_date) = ?
      GROUP BY e.id
      ORDER BY e.name ASC
    `).all(monthKey)

    return rows
  } catch (error: any) {
    throw new Error(error.message || 'Failed to generate payroll report')
  }
})
