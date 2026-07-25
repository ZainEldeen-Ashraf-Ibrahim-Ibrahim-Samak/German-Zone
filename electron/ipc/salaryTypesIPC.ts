import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

ipcMain.handle('salaryTypes:list', async () => {
  try {
    requireAdmin()
    const db = getDb()
    return db.prepare('SELECT * FROM salary_types ORDER BY name ASC').all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list salary types')
  }
})

ipcMain.handle('salaryTypes:add', async (_event, input) => {
  try {
    requireAdmin()
    const db = getDb()
    const { name, mode, monthly_rate = null, session_rate = null, session_pct = null } = input
    if (!name?.trim()) throw new Error('الاسم مطلوب / Name is required')
    const validModes = ['fixed_monthly', 'per_session_fixed', 'per_session_pct', 'hybrid', 'per_child_session']
    if (!validModes.includes(mode)) throw new Error('نوع الراتب غير صالح / Invalid salary mode')
    if (mode === 'per_session_pct' && (session_pct == null || session_pct <= 0 || session_pct > 1)) {
      throw new Error('نسبة الجلسة يجب أن تكون بين 0 و 1 / Session percentage must be between 0 and 1')
    }
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO salary_types (name, mode, monthly_rate, session_rate, session_pct, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(name.trim(), mode, monthly_rate, session_rate, session_pct, now, now)
    return db.prepare('SELECT * FROM salary_types WHERE id = ?').get(Number(result.lastInsertRowid))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to add salary type')
  }
})

ipcMain.handle('salaryTypes:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    const st = db.prepare('SELECT * FROM salary_types WHERE id = ?').get(id) as any
    if (!st) throw new Error('نوع الراتب غير موجود / Salary type not found')
    const name = patch.name !== undefined ? patch.name : st.name
    const mode = patch.mode !== undefined ? patch.mode : st.mode
    const monthly_rate = patch.monthly_rate !== undefined ? patch.monthly_rate : st.monthly_rate
    const session_rate = patch.session_rate !== undefined ? patch.session_rate : st.session_rate
    const session_pct = patch.session_pct !== undefined ? patch.session_pct : st.session_pct
    db.prepare(`
      UPDATE salary_types SET name = ?, mode = ?, monthly_rate = ?, session_rate = ?, session_pct = ?, updated_at = ?, synced = 0 WHERE id = ?
    `).run(name, mode, monthly_rate, session_rate, session_pct, new Date().toISOString(), id)
    return db.prepare('SELECT * FROM salary_types WHERE id = ?').get(id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update salary type')
  }
})

ipcMain.handle('salaryTypes:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    const roleRef = db.prepare('SELECT COUNT(*) as cnt FROM employee_roles WHERE salary_type_id = ?').get(id) as { cnt: number }
    const empRef = db.prepare('SELECT COUNT(*) as cnt FROM employees WHERE salary_type_override_id = ?').get(id) as { cnt: number }
    if (roleRef.cnt > 0 || empRef.cnt > 0) {
      throw new Error(`لا يمكن الحذف — مستخدم في ${roleRef.cnt} دور و ${empRef.cnt} موظف / Cannot delete — referenced by ${roleRef.cnt} role(s) and ${empRef.cnt} employee(s)`)
    }
    db.prepare('DELETE FROM salary_types WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete salary type')
  }
})
