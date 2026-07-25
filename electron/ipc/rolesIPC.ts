// Stub — handlers implemented in Phase 3 (US1)
import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

ipcMain.handle('roles:list', async () => {
  try {
    requireAdmin()
    const db = getDb()
    return db.prepare('SELECT * FROM employee_roles ORDER BY name ASC').all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list roles')
  }
})

ipcMain.handle('roles:add', async (_event, { name }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!name?.trim()) throw new Error('اسم الدور مطلوب / Role name is required')
    const now = new Date().toISOString()
    const result = db.prepare(
      'INSERT INTO employee_roles (name, created_at, updated_at, synced) VALUES (?, ?, ?, 0)'
    ).run(name.trim(), now, now)
    return db.prepare('SELECT * FROM employee_roles WHERE id = ?').get(Number(result.lastInsertRowid))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to add role')
  }
})

ipcMain.handle('roles:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    const role = db.prepare('SELECT * FROM employee_roles WHERE id = ?').get(id) as any
    if (!role) throw new Error('الدور غير موجود / Role not found')
    const name = patch.name !== undefined ? patch.name : role.name
    const salary_type_id = patch.salary_type_id !== undefined ? patch.salary_type_id : role.salary_type_id
    db.prepare(
      'UPDATE employee_roles SET name = ?, salary_type_id = ?, updated_at = ?, synced = 0 WHERE id = ?'
    ).run(name, salary_type_id, new Date().toISOString(), id)
    if (patch.name !== undefined) {
      db.prepare('UPDATE employees SET role = ?, updated_at = ?, synced = 0 WHERE role_id = ?')
        .run(name, new Date().toISOString(), id)
    }
    return db.prepare('SELECT * FROM employee_roles WHERE id = ?').get(id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update role')
  }
})

ipcMain.handle('roles:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    const active = db.prepare('SELECT COUNT(*) as cnt FROM employees WHERE role_id = ? AND is_active = 1').get(id) as { cnt: number }
    if (active.cnt > 0) {
      throw new Error(`لا يمكن حذف الدور — يوجد ${active.cnt} موظف نشط / Cannot delete role — ${active.cnt} active employee(s) assigned`)
    }
    db.prepare('DELETE FROM employee_roles WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete role')
  }
})
