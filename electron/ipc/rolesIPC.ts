import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'

// Job types are read by every authenticated user (employees see which job type they and their
// colleagues hold, and the list feeds the employee form); creating, editing and deleting them
// stays with the admin/manager.
ipcMain.handle('roles:list', async () => {
  try {
    checkAuth()
    const db = getDb()
    return db.prepare(`
      SELECT r.*,
        st.name as salary_type_name,
        st.mode as salary_type_mode,
        (SELECT COUNT(*) FROM employees e WHERE e.role_id = r.id) as employee_count,
        (SELECT COUNT(*) FROM employees e WHERE e.role_id = r.id AND e.is_active = 1) as active_employee_count
      FROM employee_roles r
      LEFT JOIN salary_types st ON st.id = r.salary_type_id
      ORDER BY r.name ASC
    `).all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list roles')
  }
})

ipcMain.handle('roles:add', async (_event, { name, salary_type_id = null }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!name?.trim()) throw new Error('اسم الوظيفة مطلوب / Job type name is required')
    const existing = db.prepare('SELECT id FROM employee_roles WHERE name = ?').get(name.trim()) as any
    if (existing) throw new Error('يوجد مسمى وظيفي بنفس الاسم / A job type with this name already exists')
    const now = new Date().toISOString()
    const result = db.prepare(
      'INSERT INTO employee_roles (name, salary_type_id, created_at, updated_at, synced) VALUES (?, ?, ?, ?, 0)'
    ).run(name.trim(), salary_type_id, now, now)
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
    if (!role) throw new Error('الوظيفة غير موجودة / Job type not found')
    const name = patch.name !== undefined ? String(patch.name).trim() : role.name
    if (!name) throw new Error('اسم الوظيفة مطلوب / Job type name is required')
    if (name !== role.name) {
      const clash = db.prepare('SELECT id FROM employee_roles WHERE name = ? AND id != ?').get(name, id) as any
      if (clash) throw new Error('يوجد مسمى وظيفي بنفس الاسم / A job type with this name already exists')
    }
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
      throw new Error(`لا يمكن حذف الوظيفة — يوجد ${active.cnt} موظف نشط / Cannot delete job type — ${active.cnt} active employee(s) assigned`)
    }
    db.prepare('DELETE FROM employee_roles WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete role')
  }
})
