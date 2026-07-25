import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'

/**
 * teachers:list { role? }
 *
 * Auth-level (any signed-in user) read projection over the `employees` table,
 * used by the child form to assign a teacher (feature 004). Returns only
 * id/name/role — salary fields are intentionally excluded so employee users
 * can pick a teacher without gaining payroll visibility (the admin-only
 * `employees:get` is unchanged). When `role` is provided, results are filtered
 * to employees whose role matches (case-insensitive, includes the common
 * Arabic teacher titles).
 */
ipcMain.handle('teachers:list', async (_event, args) => {
  try {
    const user = getCurrentUser()
    if (!user) {
      throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
    }

    const db = getDb()
    const rows = db
      .prepare('SELECT id, name, role FROM employees WHERE is_active = 1 ORDER BY name ASC')
      .all() as { id: number; name: string; role: string }[]

    const roleFilter = (args?.role ?? '').toString().trim().toLowerCase()
    if (!roleFilter) return rows

    return rows.filter((r) => (r.role ?? '').toLowerCase().includes(roleFilter))
  } catch (error: any) {
    console.error('Failed to list teachers:', error)
    throw new Error(error.message || 'Failed to list teachers')
  }
})
