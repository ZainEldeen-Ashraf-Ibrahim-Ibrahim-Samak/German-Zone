import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'

ipcMain.handle('serviceDefinitions:list', async () => {
  try {
    checkAuth()
    const db = getDb()
    return db.prepare('SELECT * FROM service_definitions ORDER BY is_custom ASC, name ASC').all()
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list service definitions')
  }
})

ipcMain.handle('serviceDefinitions:add', async (_event, input) => {
  try {
    requireAdmin()
    const db = getDb()
    const { name, price_monthly = null, price_daily = null, price_hourly = null } = input
    if (!name?.trim()) throw new Error('الاسم مطلوب / Name is required')
    if (price_monthly == null && price_daily == null && price_hourly == null) {
      throw new Error('يجب تحديد سعر واحد على الأقل / At least one price is required')
    }
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO service_definitions (name, is_custom, price_monthly, price_daily, price_hourly, created_at, updated_at, synced)
      VALUES (?, 1, ?, ?, ?, ?, ?, 0)
    `).run(name.trim(), price_monthly, price_daily, price_hourly, now, now)
    return db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(Number(result.lastInsertRowid))
  } catch (error: any) {
    throw new Error(error.message || 'Failed to add service definition')
  }
})

ipcMain.handle('serviceDefinitions:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    const svc = db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(id) as any
    if (!svc) throw new Error('الخدمة غير موجودة / Service not found')
    const name = patch.name !== undefined ? patch.name : svc.name
    const price_monthly = patch.price_monthly !== undefined ? patch.price_monthly : svc.price_monthly
    const price_daily = patch.price_daily !== undefined ? patch.price_daily : svc.price_daily
    const price_hourly = patch.price_hourly !== undefined ? patch.price_hourly : svc.price_hourly
    db.prepare(`
      UPDATE service_definitions SET name = ?, price_monthly = ?, price_daily = ?, price_hourly = ?, updated_at = ?, synced = 0 WHERE id = ?
    `).run(name, price_monthly, price_daily, price_hourly, new Date().toISOString(), id)
    return db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to update service definition')
  }
})

ipcMain.handle('serviceDefinitions:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    const svc = db.prepare('SELECT * FROM service_definitions WHERE id = ?').get(id) as any
    if (!svc) throw new Error('الخدمة غير موجودة / Service not found')
    if (svc.is_custom === 0) throw new Error('لا يمكن حذف الخدمات الافتراضية / Cannot delete built-in services')
    const enrolled = db.prepare("SELECT COUNT(*) as cnt FROM child_services WHERE service = ?").get(svc.name) as { cnt: number }
    if (enrolled.cnt > 0) {
      throw new Error(`لا يمكن الحذف — ${enrolled.cnt} طفل مسجل في هذه الخدمة / Cannot delete — ${enrolled.cnt} child(ren) enrolled`)
    }
    db.prepare('DELETE FROM service_definitions WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to delete service definition')
  }
})
