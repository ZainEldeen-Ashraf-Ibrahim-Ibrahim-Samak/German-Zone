import { ipcMain, dialog, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '../db/connection.js'
import { requireAdmin } from './_guard.js'

// Simple helper to get branding settings
function getBrandingSettings(db: any): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'brand_%'").all() as { key: string; value: string }[]
  const record: Record<string, string> = {}
  for (const row of rows) {
    record[row.key] = row.value
  }
  return record
}

ipcMain.handle('branding:get', () => {
  try {
    const db = getDb()
    return getBrandingSettings(db)
  } catch (error: any) {
    console.error('Failed to get branding settings:', error)
    throw new Error(error.message || 'Failed to retrieve branding settings')
  }
})

ipcMain.handle('branding:save', (_event, brandingData: Record<string, string>) => {
  try {
    requireAdmin()
    const db = getDb()

    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `)
    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(brandingData)) {
        if (key.startsWith('brand_')) {
          updateStmt.run(key, value)
        }
      }
    })

    transaction()
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to save branding:', error)
    throw new Error(error.message || 'Failed to save branding')
  }
})

ipcMain.handle('branding:upload-logo', async () => {
  try {
    requireAdmin()
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const srcPath = result.filePaths[0]
    const ext = path.extname(srcPath)
    const destName = `logo_${Date.now()}${ext}`

    const brandingDir = path.join(app.getPath('userData'), 'branding')
    if (!fs.existsSync(brandingDir)) {
      fs.mkdirSync(brandingDir, { recursive: true })
    }

    const destPath = path.join(brandingDir, destName)
    fs.copyFileSync(srcPath, destPath)

    // Return path relative to userData (or absolute, our asset protocol handles it)
    return { path: `branding/${destName}` }
  } catch (error: any) {
    console.error('Failed to upload logo:', error)
    throw new Error(error.message || 'Failed to upload logo')
  }
})

ipcMain.handle('branding:upload-icon', async () => {
  try {
    requireAdmin()
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Icons', extensions: ['ico', 'png', 'icns'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const srcPath = result.filePaths[0]
    const ext = path.extname(srcPath)
    const destName = `icon_${Date.now()}${ext}`

    const brandingDir = path.join(app.getPath('userData'), 'branding')
    if (!fs.existsSync(brandingDir)) {
      fs.mkdirSync(brandingDir, { recursive: true })
    }

    const destPath = path.join(brandingDir, destName)
    fs.copyFileSync(srcPath, destPath)

    return { path: `branding/${destName}` }
  } catch (error: any) {
    console.error('Failed to upload icon:', error)
    throw new Error(error.message || 'Failed to upload icon')
  }
})

ipcMain.handle('branding:reset', () => {
  try {
    requireAdmin()
    const db = getDb()

    // Default branding settings
    const defaultBranding = {
      brand_app_name: 'أكاديمية مهند الليثي',
      brand_org_name: 'مركز مهند الليثي للتوحد ونمو الطفل',
      brand_tagline: 'رعاية متميزة وتنمية مهارات طفلك',
      brand_primary_color: '#0f766e',
      brand_accent_color: '#f59e0b',
      brand_phone: '+20 123 456 7890',
      brand_address: 'القاهرة، مصر',
      brand_email: 'info@zaineldeen.com',
      brand_show_logo_sidebar: '1',
      brand_show_logo_login: '1',
      brand_show_logo_export: '1',
      brand_logo_path: '',
      brand_icon_path: '',
    }

    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at, synced)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `)
    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(defaultBranding)) {
        updateStmt.run(key, value)
      }
    })

    transaction()
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to reset branding:', error)
    throw new Error(error.message || 'Failed to reset branding')
  }
})