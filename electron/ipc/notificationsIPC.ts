import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { checkAuth, getCurrentUser } from './_guard.js'
import type { Db } from '../db/connection.js'

export type NotificationType = 'edit_request_submitted' | 'edit_request_approved' | 'edit_request_rejected'

/**
 * Minimal in-app notification (research.md #6 — no email/SMS/push integration in v1).
 * Exported so other IPC modules (attendanceIPC) can enqueue notifications inline.
 */
export function insertNotification(db: Db, entry: {
  user_id: number
  type: NotificationType
  related_id: number | null
  message_ar: string
  message_en: string
}): void {
  db.prepare(`
    INSERT INTO notifications (user_id, type, related_id, message_ar, message_en, read_at, created_at, synced)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 0)
  `).run(entry.user_id, entry.type, entry.related_id, entry.message_ar, entry.message_en, new Date().toISOString())
}

ipcMain.handle('notifications:list', async (_event, args) => {
  try {
    checkAuth()
    const user = getCurrentUser()!
    const db = getDb()
    const unreadOnly = args?.unreadOnly === true
    const sql = unreadOnly
      ? 'SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC'
    return db.prepare(sql).all(user.id)
  } catch (error: any) {
    throw new Error(error.message || 'Failed to list notifications')
  }
})

ipcMain.handle('notifications:markRead', async (_event, args) => {
  try {
    checkAuth()
    const user = getCurrentUser()!
    const db = getDb()
    const now = new Date().toISOString()
    if (args?.all) {
      db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, user.id)
    } else {
      db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(now, args.id, user.id)
    }
    return { ok: true }
  } catch (error: any) {
    throw new Error(error.message || 'Failed to mark notification read')
  }
})
