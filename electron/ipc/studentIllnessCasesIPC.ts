import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

ipcMain.handle('childIllnessCases:getOpen', async (_event, { child_id }) => {
  try {
    checkAuth()
    if (!child_id) throw new Error('child_id is required')
    const db = getDb()
    return db.prepare(
      "SELECT * FROM child_illness_cases WHERE child_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1"
    ).get(child_id) ?? null
  } catch (error: any) {
    console.error('Failed to get open illness case:', error)
    throw new Error(error.message || 'Failed to get open illness case')
  }
})

ipcMain.handle('childIllnessCases:list', async (_event, { child_id }) => {
  try {
    checkAuth()
    if (!child_id) throw new Error('child_id is required')
    const db = getDb()
    return db.prepare('SELECT * FROM child_illness_cases WHERE child_id = ? ORDER BY opened_at DESC').all(child_id)
  } catch (error: any) {
    console.error('Failed to list illness cases:', error)
    throw new Error(error.message || 'Failed to list illness cases')
  }
})

ipcMain.handle('childIllnessCases:create', async (_event, { child_id, description, opened_at }) => {
  try {
    checkAuth()
    if (!child_id) throw new Error('child_id is required')
    const db = getDb()

    const existingOpen = db.prepare(
      "SELECT id FROM child_illness_cases WHERE child_id = ? AND status = 'open'"
    ).get(child_id)
    if (existingOpen) {
      throw new Error('يوجد بالفعل حالة مرضية مفتوحة لهذا الطفل / An open illness case already exists for this child')
    }

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO child_illness_cases (child_id, status, description, opened_at, created_at, updated_at, synced)
      VALUES (?, 'open', ?, ?, ?, ?, 0)
    `).run(child_id, description ?? null, opened_at || now.slice(0, 10), now, now)

    return db.prepare('SELECT * FROM child_illness_cases WHERE id = ?').get(result.lastInsertRowid)
  } catch (error: any) {
    console.error('Failed to create illness case:', error)
    throw new Error(error.message || 'Failed to create illness case')
  }
})

ipcMain.handle('childIllnessCases:resolve', async (_event, { id, resolved_at }) => {
  try {
    checkAuth()
    if (!id) throw new Error('id is required')
    const db = getDb()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE child_illness_cases
      SET status = 'resolved', resolved_at = ?, updated_at = ?, synced = 0
      WHERE id = ?
    `).run(resolved_at || now.slice(0, 10), now, id)

    return db.prepare('SELECT * FROM child_illness_cases WHERE id = ?').get(id)
  } catch (error: any) {
    console.error('Failed to resolve illness case:', error)
    throw new Error(error.message || 'Failed to resolve illness case')
  }
})
