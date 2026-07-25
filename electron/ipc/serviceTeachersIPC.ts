import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'

ipcMain.handle('serviceTeachers:list', async (_event, { service_id }) => {
  try {
    checkAuth()
    const db = getDb()
    return db.prepare(`
      SELECT e.id, e.name, e.role
      FROM service_teachers st
      JOIN employees e ON st.employee_id = e.id
      WHERE st.service_id = ? AND e.is_active = 1
      ORDER BY e.name ASC
    `).all(service_id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list service teachers')
  }
})

ipcMain.handle('serviceTeachers:set', async (_event, { service_id, employee_ids }) => {
  try {
    requireAdmin()
    const db = getDb()
    const ids: number[] = Array.isArray(employee_ids) ? employee_ids : []
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('DELETE FROM service_teachers WHERE service_id = ?').run(service_id)
      for (const empId of ids) {
        db.prepare(`
          INSERT OR IGNORE INTO service_teachers (service_id, employee_id, created_at, synced)
          VALUES (?, ?, ?, 0)
        `).run(service_id, empId, now)
      }
    })()
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to set service teachers')
  }
})
