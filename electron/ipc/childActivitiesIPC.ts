import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'
import { requireAdmin } from './_guard.js'
import { uploadFile, uploadImage, uploadVideo } from '../services/cloudinaryService.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

ipcMain.handle('childActivities:list', async (_event, { child_id }) => {
  try {
    checkAuth()
    if (!child_id) throw new Error('child_id is required')
    const db = getDb()
    return db.prepare(
      'SELECT * FROM child_activities WHERE child_id = ? ORDER BY activity_date DESC, id DESC'
    ).all(child_id)
  } catch (error: any) {
    console.error('Failed to list child activities:', error)
    throw new Error(error.message || 'Failed to list child activities')
  }
})

ipcMain.handle('childActivities:create', async (_event, { child_id, activity_date, note, media_data_url, media_type }) => {
  try {
    checkAuth()
    if (!child_id) throw new Error('child_id is required')
    if (!note && !media_data_url) {
      throw new Error('يجب إضافة ملاحظة أو وسائط / An activity needs a note or media')
    }

    const db = getDb()

    // An open illness case no longer blocks adding activities (originally FR-007) — the case
    // stays visible as a warning banner in the UI, but the daily diary keeps working.

    let mediaUrl: string | null = null
    let mediaStatus: 'uploaded' | 'failed' | null = null

    if (media_data_url) {
      try {
        const folder = `nursery/children/${child_id}/activities`
        const uploaded = media_type === 'video'
          ? await uploadVideo(media_data_url, folder)
          : media_type === 'file'
            ? await uploadFile(media_data_url, folder)
            : await uploadImage(media_data_url, folder)
        mediaUrl = uploaded.url
        mediaStatus = 'uploaded'
      } catch (uploadError) {
        console.error('Activity media upload failed, saving note without media:', uploadError)
        mediaStatus = 'failed'
      }
    }

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO child_activities (child_id, activity_date, note, media_url, media_type, media_status, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      child_id,
      activity_date || now.slice(0, 10),
      note ?? null,
      mediaUrl,
      media_data_url ? (media_type ?? 'photo') : null,
      mediaStatus,
      now,
      now
    )

    return db.prepare('SELECT * FROM child_activities WHERE id = ?').get(result.lastInsertRowid)
  } catch (error: any) {
    console.error('Failed to create child activity:', error)
    throw new Error(error.message || 'Failed to create child activity')
  }
})

ipcMain.handle('childActivities:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    if (!id) throw new Error('id is required')
    const db = getDb()
    db.prepare('DELETE FROM child_activities WHERE id = ?').run(id)
    return { success: true }
  } catch (error: any) {
    console.error('Failed to delete child activity:', error)
    throw new Error(error.message || 'Failed to delete child activity')
  }
})
