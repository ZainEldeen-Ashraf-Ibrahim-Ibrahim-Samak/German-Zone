import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'

ipcMain.handle('paymentMethods:list', async () => {
  try {
    checkAuth()
    const db = getDb()
    return db.prepare(`SELECT * FROM payment_methods ORDER BY name`).all()
  } catch (e: any) {
    throw new Error(e.message || 'Failed to list payment methods')
  }
})

ipcMain.handle('paymentMethods:add', async (_event, { name }: { name: string }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!name?.trim()) throw new Error('اسم طريقة الدفع مطلوب / Name is required')
    const now = new Date().toISOString()
    const res = db.prepare(`INSERT INTO payment_methods (name, is_active, created_at, updated_at, synced) VALUES (?, 1, ?, ?, 0)`).run(name.trim(), now, now)
    return db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(Number(res.lastInsertRowid))
  } catch (e: any) {
    throw new Error(e.message || 'Failed to add payment method')
  }
})

ipcMain.handle('paymentMethods:update', async (_event, { id, patch }: { id: number; patch: any }) => {
  try {
    requireAdmin()
    const db = getDb()
    const row = db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(id) as any
    if (!row) throw new Error('طريقة الدفع غير موجودة / Not found')
    const name = patch.name !== undefined ? patch.name.trim() : row.name
    const is_active = patch.is_active !== undefined ? patch.is_active : row.is_active
    const now = new Date().toISOString()
    db.prepare(`UPDATE payment_methods SET name = ?, is_active = ?, updated_at = ?, synced = 0 WHERE id = ?`).run(name, is_active, now, id)
    return db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(id)
  } catch (e: any) {
    throw new Error(e.message || 'Failed to update payment method')
  }
})

ipcMain.handle('paymentMethods:delete', async (_event, { id }: { id: number }) => {
  try {
    requireAdmin()
    const db = getDb()
    const used = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE payment_method_id = ?`).get(id) as any
    if (used.c > 0) throw new Error('لا يمكن حذف طريقة دفع مستخدمة في مدفوعات / Cannot delete a method in use')
    db.prepare(`DELETE FROM payment_methods WHERE id = ?`).run(id)
    return { ok: true }
  } catch (e: any) {
    throw new Error(e.message || 'Failed to delete payment method')
  }
})
