import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '../db/connection.js'

export interface ExportHeaderData {
  appName: string
  orgName: string
  tagline: string
  phone: string
  address: string
  email: string
  logoPath: string
  primaryColor: string
  accentColor: string
  showLogo: boolean
}

export function getExportHeader(): ExportHeaderData {
  const db = getDb()
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'brand_%'").all() as { key: string; value: string }[]

  const settings: Record<string, string> = {}
  for (const r of rows) {
    settings[r.key] = r.value
  }

  const logoRelPath = settings['brand_logo_path'] || 'branding/logo.png'
  const logoPath = path.isAbsolute(logoRelPath)
    ? logoRelPath
    : path.join(app.getPath('userData'), logoRelPath)

  return {
    appName: settings['brand_app_name'] || 'أكاديمية مهند الليثي',
    orgName: settings['brand_org_name'] || 'مركز مهند الليثي للتوحد ونمو الطفل',
    tagline: settings['brand_tagline'] || 'رعاية متميزة وتنمية مهارات طفلك',
    phone: settings['brand_phone'] || '+20 123 456 7890',
    address: settings['brand_address'] || 'القاهرة، مصر',
    email: settings['brand_email'] || 'info@zaineldeen.com',
    logoPath: fs.existsSync(logoPath) ? logoPath : '',
    primaryColor: settings['brand_primary_color'] || '#0f766e',
    accentColor: settings['brand_accent_color'] || '#f59e0b',
    showLogo: settings['brand_show_logo_export'] !== '0', // Defaults to true/1
  }
}
