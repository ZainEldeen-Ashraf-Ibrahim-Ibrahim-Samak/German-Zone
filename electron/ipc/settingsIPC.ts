import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

ipcMain.handle('settings:get', () => {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    
    const settingsRecord: Record<string, string> = {}
    for (const row of rows) {
      settingsRecord[row.key] = row.value
    }
    
    return settingsRecord
  } catch (error: any) {
    console.error('Failed to get settings:', error)
    throw new Error(error.message || 'Failed to retrieve settings')
  }
})

ipcMain.handle('settings:update', (_event, settings: Record<string, string>) => {
  try {
    requireAdmin()
    
    const db = getDb()
    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `)
    
    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        updateStmt.run(key, value)
      }
    })
    
    transaction()
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to update settings:', error)
    throw new Error(error.message || 'Failed to update settings')
  }
})