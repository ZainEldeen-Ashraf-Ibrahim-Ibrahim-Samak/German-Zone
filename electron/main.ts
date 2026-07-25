// MUST be first: loads .env into process.env before any module reads it.
import { checkRequiredConfig } from './env.js'
import { app, BrowserWindow, Menu, protocol, net, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initDb, closeDb } from './db/connection.js'
import { runMigrations } from './db/migrations/index.js'
import { seedDatabase } from './db/seed.js'

// Import IPC modules to register handlers
import './ipc/authIPC.js'
import './ipc/childrenIPC.js'
import './ipc/childServicesIPC.js'
import './ipc/teachersIPC.js'
import './ipc/paymentsIPC.js'
import './ipc/salariesIPC.js'
import './ipc/expensesIPC.js'
import './ipc/targetIPC.js'
import './ipc/settingsIPC.js'
import './ipc/brandingIPC.js'
import './ipc/exportIPC.js'
import './ipc/storageIPC.js'
import './ipc/syncIPC.js'
import './ipc/dashboardIPC.js'
import './ipc/rolesIPC.js'
import './ipc/salaryTypesIPC.js'
import './ipc/serviceDefinitionsIPC.js'
import './ipc/sessionsIPC.js'
import './ipc/attendanceIPC.js'
import './ipc/paymentMethodsIPC.js'
import './ipc/deductionsIPC.js'
import './ipc/serviceTeachersIPC.js'
import './ipc/teacherPaymentsIPC.js'
import './ipc/payrollIPC.js'
import './ipc/notificationsIPC.js'
import './ipc/transactionsIPC.js'
import './ipc/childIllnessCasesIPC.js'
import './ipc/childActivitiesIPC.js'
import './ipc/calendarIPC.js'
import { startAutoSync, getMongoUri } from './ipc/syncIPC.js'
import { connectMongo } from './services/mongoSync.js'

// Get __dirname equivalent in ESM if needed
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Force HTTP/1.1 to avoid net::ERR_HTTP2_PROTOCOL_ERROR when downloading updates
// from GitHub CDN via electron-updater.
app.commandLine.appendSwitch('disable-http2')

// Register asset scheme before app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: path.join(__dirname, '../assets/branding/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'نظام إدارة الحضانة ومركز التوحد | Nursery & Autism Center Management System',
  })

  // Surface any preload load/execution failure (otherwise window.api is silently undefined)
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('PRELOAD ERROR at', preloadPath, '->', error)
  })

  // Load URL or File
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Refuse to start a production build without a configured signing secret (FR-012).
  const configCheck = checkRequiredConfig()
  if (!configCheck.ok) {
    console.error('FATAL CONFIG ERROR:', configCheck.error)
    dialog.showErrorBox('Configuration Error / خطأ في الإعداد', configCheck.error || 'Invalid configuration')
    app.quit()
    return
  }

  // Initialize Database, run migrations and seed
  try {
    const db = initDb()
    runMigrations(db)
    await seedDatabase(db)
    console.log('Database initialized, migrated and seeded successfully!')

    // Check/copy default branding assets to userData/branding/
    const brandingDir = path.join(app.getPath('userData'), 'branding')
    if (!fs.existsSync(brandingDir)) {
      fs.mkdirSync(brandingDir, { recursive: true })
    }

    const defaultLogoSrc = path.join(__dirname, '../assets/default-branding/logo.png')
    const defaultIconSrc = path.join(__dirname, '../assets/default-branding/icon.png')
    const destLogo = path.join(brandingDir, 'logo.png')
    const destIcon = path.join(brandingDir, 'icon.png')

    if (fs.existsSync(defaultLogoSrc) && !fs.existsSync(destLogo)) {
      fs.copyFileSync(defaultLogoSrc, destLogo)
    }
    if (fs.existsSync(defaultIconSrc) && !fs.existsSync(destIcon)) {
      fs.copyFileSync(defaultIconSrc, destIcon)
    }

    // Check/copy default fonts to userData/branding/fonts/
    const fontsDir = path.join(brandingDir, 'fonts')
    if (!fs.existsSync(fontsDir)) {
      fs.mkdirSync(fontsDir, { recursive: true })
    }

    const defaultFontRegularSrc = path.join(__dirname, '../assets/branding/fonts/Cairo-Regular.ttf')
    const defaultFontBoldSrc = path.join(__dirname, '../assets/branding/fonts/Cairo-Bold.ttf')
    const destFontRegular = path.join(fontsDir, 'Cairo-Regular.ttf')
    const destFontBold = path.join(fontsDir, 'Cairo-Bold.ttf')

    if (fs.existsSync(defaultFontRegularSrc) && !fs.existsSync(destFontRegular)) {
      fs.copyFileSync(defaultFontRegularSrc, destFontRegular)
    }
    if (fs.existsSync(defaultFontBoldSrc) && !fs.existsSync(destFontBold)) {
      fs.copyFileSync(defaultFontBoldSrc, destFontBold)
    }

    // Set paths in settings if they are currently empty
    const currentLogo = db.prepare("SELECT value FROM settings WHERE key = 'brand_logo_path'").get() as { value: string } | undefined
    if (!currentLogo || !currentLogo.value) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('brand_logo_path', 'branding/logo.png')").run()
    }
    const currentIcon = db.prepare("SELECT value FROM settings WHERE key = 'brand_icon_path'").get() as { value: string } | undefined
    if (!currentIcon || !currentIcon.value) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('brand_icon_path', 'branding/icon.png')").run()
    }
    // Seed sync_mongo_uri into settings if the admin hasn't set one yet, so it shows up (and is
    // editable) in the Settings UI. Priority: an admin-configured DB value is never overwritten;
    // otherwise MONGO_URI from .env; otherwise the hardcoded default URI baked into getMongoUri()
    // — this guarantees the app is never left with "no URI configured at all".
    const resolvedMongoUri = getMongoUri()
    const existingUri = db.prepare("SELECT value FROM settings WHERE key = 'sync_mongo_uri'").get() as { value: string } | undefined
    if (!existingUri) {
      db.prepare(`
        INSERT INTO settings (key, value, updated_at, synced)
        VALUES ('sync_mongo_uri', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
      `).run(resolvedMongoUri)
      console.log('[startup] Seeded sync_mongo_uri into settings:', resolvedMongoUri)
    }

    // Always connect on startup — getMongoUri() now guarantees a URI (DB → .env → hardcoded
    // default), so this never silently skips due to "no URI configured".
    console.log('Connecting to MongoDB on startup...')
    connectMongo(resolvedMongoUri)
      .then(() => console.log('Successfully connected to MongoDB on startup.'))
      .catch((err) => console.error('Failed to connect to MongoDB on startup:', err.message))

    // Auto-sync ALWAYS starts on launch (force push+pull), for every role and even before
    // login — a saved interval > 0 is honored, anything else (off/0/invalid/missing) falls
    // back to every 1 minute so no machine can end up permanently not syncing. Turning it
    // off in Settings only stops it for the current session.
    const autoIntervalRow = db.prepare("SELECT value FROM settings WHERE key = 'sync_auto_interval'").get() as { value: string } | undefined
    const savedInterval = Number(autoIntervalRow?.value)
    const intervalMinutes = Number.isFinite(savedInterval) && savedInterval > 0 ? savedInterval : 1
    startAutoSync(intervalMinutes * 60 * 1000)
  } catch (error) {
    console.error('Failed to initialize database or branding assets:', error)
  }

  // Register asset:// protocol handler to safely load branding assets
  protocol.handle('asset', (request) => {
    try {
      const urlPath = decodeURIComponent(request.url.slice('asset://'.length))
      const cleanPath = urlPath.replace(/^\/+/, '')
      const absolutePath = path.isAbsolute(cleanPath) 
        ? cleanPath 
        : path.join(app.getPath('userData'), cleanPath)
        
      return net.fetch(pathToFileURL(absolutePath).toString())
    } catch (err) {
      console.error('Asset protocol error:', err)
      return new Response('Asset not found', { status: 404 })
    }
  })

  createWindow()

  // The updater:check/install/open-release-page IPC handlers must always be registered — the
  // renderer (Sidebar, Login) calls updater:check unconditionally on every load, packaged or
  // not — otherwise it fails with "No handler registered for 'updater:check'" in dev.
  // Only the *automatic* background check-and-notify is skipped outside packaged builds, since
  // electron-updater has no feed URL in dev and would throw.
  initAutoUpdater()
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Error during automatic update check:', err)
      })
    }, 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

function initAutoUpdater() {
  autoUpdater.logger = console

  // GitHub throttles unauthenticated requests per IP; re-checking within this window just burns
  // quota and comes back as 429. Real checks are limited to one per window — inside it, manual
  // "check for updates" clicks replay the last known outcome instead of hitting GitHub again.
  const CHECK_COOLDOWN_MS = 10 * 60 * 1000
  let lastCheckAt = 0
  let lastOutcome: { event: string; info?: any } | null = null
  let rateLimitRetryTimer: NodeJS.Timeout | null = null

  autoUpdater.on('checking-for-update', () => {
    lastCheckAt = Date.now()
    mainWindow?.webContents.send('updater:status', { event: 'checking-for-update' })
  })

  autoUpdater.on('update-available', (info) => {
    lastOutcome = { event: 'update-available', info }
    mainWindow?.webContents.send('updater:status', lastOutcome)
  })

  autoUpdater.on('update-not-available', (info) => {
    lastOutcome = { event: 'update-not-available', info }
    mainWindow?.webContents.send('updater:status', lastOutcome)
  })

  let _updateRetried = false
  autoUpdater.on('error', (err) => {
    const msg = err.message || ''
    const isRateLimit = msg.includes('429') || msg.includes('Too Many Requests')
    const isNetworkError = !isRateLimit && (msg.includes('ERR_HTTP2') || msg.includes('net::') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT'))

    if (isRateLimit) {
      // Transient GitHub throttling. Never report this as "up to date" — the check didn't
      // run, so we don't know. Surface it honestly (renderer offers a manual download) and
      // retry once in the background after the cooldown. Drop any cached outcome so the
      // cooldown cache can't keep replaying a stale "update-not-available".
      console.warn('[updater] GitHub rate limit (429); will retry after cooldown')
      lastOutcome = null
      mainWindow?.webContents.send('updater:status', {
        event: 'error',
        error: msg,
        errorCode: 'rate_limit',
      })
      if (!rateLimitRetryTimer) {
        rateLimitRetryTimer = setTimeout(() => {
          rateLimitRetryTimer = null
          autoUpdater.checkForUpdates().catch(() => {})
        }, CHECK_COOLDOWN_MS)
      }
      return
    }

    if (isNetworkError && !_updateRetried) {
      _updateRetried = true
      setTimeout(() => autoUpdater.downloadUpdate().catch(() => {}), 3000)
      return
    }

    lastOutcome = null
    mainWindow?.webContents.send('updater:status', {
      event: 'error',
      error: msg,
      errorCode: isNetworkError ? 'network' : 'unknown',
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'download-progress',
      progress: {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', { event: 'update-downloaded', info })
  })

  ipcMain.handle('updater:check', async () => {
    // Within the cooldown, answer from the last real check so repeated clicks on
    // "check for updates" can't hammer GitHub into rate-limiting us.
    if (lastOutcome && Date.now() - lastCheckAt < CHECK_COOLDOWN_MS) {
      mainWindow?.webContents.send('updater:status', lastOutcome)
      return { success: true, cached: true }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
    return { success: true }
  })

  ipcMain.handle('updater:open-release-page', () => {
    shell.openExternal('https://github.com/ZainEldeen-Ashraf-Ibrahim-Ibrahim-Samak/Nursery/releases/latest')
  })
}

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
