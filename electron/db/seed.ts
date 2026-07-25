import type { Db } from './connection.js'
import bcrypt from 'bcryptjs'
import { getSeedAdmin, seedSetting } from '../env.js'

export async function seedDatabase(db: Db): Promise<void> {
  // Check if users already exist
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }

  if (userCountRow.count === 0) {
    // Initial admin credentials come from the environment (first-run only).
    const { username, password } = getSeedAdmin()
    const adminPassword = password || 'admin123'
    if (!password) {
      console.warn(
        '[seed] SEED_ADMIN_PASSWORD not set — seeding default admin password "admin123". ' +
        'Set SEED_ADMIN_PASSWORD in .env and change it after first login.'
      )
    }
    console.log(`No users found. Seeding admin user "${username}"...`)

    const hashedPassword = await bcrypt.hash(adminPassword, 10)

    db.prepare(`
      INSERT INTO users (username, password, role, name, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(username, hashedPassword, 'admin', 'Administrator', 1)
  }

  // Seed default settings (INSERT OR IGNORE — safe to run every time)
  {
    // Non-sensitive defaults; each is overridable via an optional SEED_* env key
    // (first-run only — see specs/002-excel-import-env-config/contracts/env-vars.md).
    const defaultSettings: { key: string; value: string }[] = [
      // Targets & Capacity
      { key: 'target_profit_pct', value: seedSetting('SEED_TARGET_PROFIT_PCT', '0.20') }, // 20%
      { key: 'max_capacity', value: seedSetting('SEED_MAX_CAPACITY', '50') },
      { key: 'work_days', value: seedSetting('SEED_WORK_DAYS', '22') },
      { key: 'work_hours', value: seedSetting('SEED_WORK_HOURS', '8') },

      // Branding Settings
      { key: 'brand_app_name', value: seedSetting('SEED_BRAND_APP_NAME', 'أكاديمية مهند الليثي') },
      { key: 'brand_org_name', value: seedSetting('SEED_BRAND_ORG_NAME', 'مركز مهند الليثي للتوحد ونمو الطفل') },
      { key: 'brand_tagline', value: 'رعاية متميزة وتنمية مهارات طفلك' },
      { key: 'brand_primary_color', value: seedSetting('SEED_BRAND_PRIMARY_COLOR', '#0f766e') }, // Teal 700
      { key: 'brand_accent_color', value: seedSetting('SEED_BRAND_ACCENT_COLOR', '#f59e0b') },  // Amber 500
      { key: 'brand_phone', value: seedSetting('SEED_BRAND_PHONE', '+20 123 456 7890') },
      { key: 'brand_address', value: 'القاهرة، مصر' },
      { key: 'brand_email', value: seedSetting('SEED_BRAND_EMAIL', 'info@zaineldeen.com') },
      { key: 'brand_show_logo_sidebar', value: '1' },
      { key: 'brand_show_logo_login', value: '1' },
      { key: 'brand_show_logo_export', value: '1' },
      { key: 'brand_logo_path', value: '' },
      { key: 'brand_icon_path', value: '' },
    ]

    const insertSetting = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, updated_at, synced)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `)

    const transaction = db.transaction(() => {
      for (const setting of defaultSettings) {
        insertSetting.run(setting.key, setting.value)
      }
    })

    transaction()
  }

  // Seed default service definitions (Settings → Services — the single source of truth for
  // service pricing; INSERT OR IGNORE so an admin's edits are never overwritten on restart).
  {
    const defaultServices: { name: string; monthly: string; daily: string; hourly: string }[] = [
      { name: 'حضانة', monthly: seedSetting('SEED_NURSERY_MONTHLY', '2500'), daily: seedSetting('SEED_NURSERY_DAILY', '150'), hourly: seedSetting('SEED_NURSERY_HOURLY', '30') },
      { name: 'استضافة', monthly: seedSetting('SEED_HOSTING_MONTHLY', '3000'), daily: seedSetting('SEED_HOSTING_DAILY', '200'), hourly: seedSetting('SEED_HOSTING_HOURLY', '40') },
      { name: 'جلسة', monthly: seedSetting('SEED_SESSION_MONTHLY', '1200'), daily: seedSetting('SEED_SESSION_DAILY', '400'), hourly: seedSetting('SEED_SESSION_HOURLY', '100') },
    ]
    const now = new Date().toISOString()
    const insertService = db.prepare(`
      INSERT OR IGNORE INTO service_definitions (name, is_custom, price_monthly, price_daily, price_hourly, created_at, updated_at, synced)
      VALUES (?, 0, ?, ?, ?, ?, ?, 0)
    `)
    const transaction = db.transaction(() => {
      for (const s of defaultServices) {
        insertService.run(s.name, Number(s.monthly), Number(s.daily), Number(s.hourly), now, now)
      }
    })
    transaction()
  }
}

