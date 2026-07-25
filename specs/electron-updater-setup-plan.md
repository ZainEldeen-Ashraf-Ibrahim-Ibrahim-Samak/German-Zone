# Electron Auto-Updater Setup Plan

Implement a complete GitHub-based auto-update system for this Electron app.
Follow every step in order. Do not skip any step.

---

## Stack assumptions
- Electron + electron-builder + electron-updater already installed
- `package.json` has `"type": "module"`
- Main process entry: `electron/main.ts`
- Environment loading: `electron/env.ts` (or equivalent)
- Build output: `dist-electron/`
- GitHub repo already exists

If any assumption is wrong, adapt the paths accordingly.

---

## Step 1 — electron-builder.yml

Create or update `electron-builder.yml` at the project root:

```yaml
appId: com.yourcompany.yourapp
productName: Your App Name
publish:
  provider: github
  owner: YOUR_GITHUB_USERNAME
  repo: YOUR_REPO_NAME
  releaseType: release          # publishes immediately, not as draft
directories:
  output: release
  buildResources: assets
files:
  - dist
  - dist-electron
  - package.json
extraFiles:
  - from: .env.example
    to: .env.example            # bundled so app works on first install
win:
  target: nsis
  icon: assets/branding/icon.ico
  executableName: YourAppName   # no spaces or special chars — avoids shortcut bugs
mac:
  target: dmg
  icon: assets/branding/icon.icns
  category: public.app-category.business
linux:
  target: AppImage
  icon: assets/branding/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Your App Name
```

Replace `YOUR_GITHUB_USERNAME`, `YOUR_REPO_NAME`, `Your App Name`, `YourAppName` with real values.

---

## Step 2 — .env.example

Create `.env.example` at project root. This file IS committed to git.
It must have a working default `JWT_SECRET` so the app starts on first install:

```
# ── Required ────────────────────────────────────────────────────────────────
JWT_SECRET=yourapp_default_jwt_secret_change_before_production

# GitHub Personal Access Token — needed only to PUBLISH releases (dist:publish).
# NOT needed by end-users. Create at https://github.com/settings/tokens (repo scope).
# GH_TOKEN=ghp_your_token_here

# ── Optional ────────────────────────────────────────────────────────────────
# Add any other env vars your app needs here with safe placeholder values.
```

---

## Step 3 — .env (local only, never committed)

Create `.env` at project root. This file is gitignored.

```
JWT_SECRET=your_real_secret_here
GH_TOKEN=ghp_your_real_token_here
```

---

## Step 4 — .gitignore

Make sure `.env` is in `.gitignore`. Add this near the top:

```
# Environment — never commit real secrets
.env
```

Never commit `.env`. Only `.env.example` goes to git.

---

## Step 5 — electron/env.ts

Update the env loader to fall back to `.env.example` so the app works
on first install without any manual setup by the user:

```ts
import path from 'node:path'
import dotenv from 'dotenv'
import { app } from 'electron'

dotenv.config()
try {
  if (app?.isPackaged) {
    const exeDir = path.dirname(app.getPath('exe'))
    // Load .env first (user's custom config), then .env.example as fallback
    dotenv.config({ path: path.join(exeDir, '.env') })
    dotenv.config({ path: path.join(exeDir, '.env.example') })
  }
} catch {
  // app not ready yet (test runner) — ignore
}
```

`dotenv.config()` never overwrites already-loaded variables, so `.env` always
wins over `.env.example` when both exist.

---

## Step 6 — electron/main.ts: auto-updater

Add the auto-updater to the main process. Two rules:
1. Only initialize when `app.isPackaged` — in dev mode electron-updater
   has no feed URL and throws errors.
2. Add an `uncaughtException` handler so crashes print a real error
   instead of silently closing the IPC channel.

```ts
import { autoUpdater } from 'electron-updater'

// Inside app.whenReady().then(async () => { ... }), after createWindow():

  if (app.isPackaged) {
    initAutoUpdater()
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('Error during automatic update check:', err)
      })
    }, 5000)
  }

// At the bottom of the file, before app.on('window-all-closed'):

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err)
})

function initAutoUpdater() {
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { event: 'checking-for-update' })
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', { event: 'update-available', info })
  })
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:status', { event: 'update-not-available', info })
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:status', { event: 'error', error: err.message })
  })
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('updater:status', {
      event: 'download-progress',
      progress: {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      },
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', { event: 'update-downloaded', info })
  })

  ipcMain.handle('updater:check', async () => {
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
}
```

---

## Step 7 — publish script

Create `scripts/publish-release.mjs`.
This replaces `electron-builder --publish always` which has a race condition
that causes `latest.yml` to be silently dropped.

```js
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { config } from 'dotenv'

config() // reads GH_TOKEN from .env automatically

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const VERSION = pkg.version
const TOKEN = process.env.GH_TOKEN
const OWNER = 'YOUR_GITHUB_USERNAME'   // ← replace
const REPO = 'YOUR_REPO_NAME'          // ← replace
const TAG = `v${VERSION}`
const RELEASE_DIR = 'release'

if (!TOKEN) {
  console.error('❌  GH_TOKEN is not set. Add it to .env')
  process.exit(1)
}

// Artifacts to upload in order. The exe name must match what electron-builder generates.
// Pattern: {name}-setup-{version}.exe where {name} is the kebab-case of package.json "name".
const ARTIFACTS = [
  `${pkg.name}-setup-${VERSION}.exe`,
  `${pkg.name}-setup-${VERSION}.exe.blockmap`,
  'latest.yml',
]

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function getOrCreateRelease() {
  const get = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })
  if (get.status === 200) {
    console.log(`✓ Found existing release ${TAG} (id: ${get.body.id})`)
    return get.body
  }
  console.log(`Creating release ${TAG}...`)
  const create = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases`,
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  }, JSON.stringify({ tag_name: TAG, name: TAG, draft: false, prerelease: false }))
  if (create.status !== 201) throw new Error(`Failed to create release: ${JSON.stringify(create.body)}`)
  console.log(`✓ Created release ${TAG} (id: ${create.body.id})`)

  // GitHub needs a few seconds to propagate a new release before assets can be uploaded
  process.stdout.write('  Waiting for release to be ready')
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    process.stdout.write('.')
  }
  process.stdout.write('\n')

  return create.body
}

async function deleteExistingAsset(releaseId, name) {
  const list = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets`,
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })
  if (list.status !== 200) return
  const existing = list.body.find((a) => a.name === name)
  if (!existing) return
  await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })
  console.log(`  Replaced existing ${name}`)
}

function drawProgress(uploaded, total, name) {
  const BAR = 40
  const pct = total > 0 ? uploaded / total : 0
  const filled = Math.round(pct * BAR)
  const bar = '█'.repeat(filled) + '░'.repeat(BAR - filled)
  const mb = (b) => (b / 1024 / 1024).toFixed(1)
  process.stdout.write(`\r  [${bar}] ${Math.round(pct * 100)}%  ${mb(uploaded)}/${mb(total)} MB  ${name}   `)
}

function uploadAsset(releaseId, name, filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size
    console.log(`\n  Uploading ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`)
    let uploaded = 0
    const req = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'publish-release',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
      },
    }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        process.stdout.write('\n')
        if (res.statusCode === 201) { console.log(`  ✓ ${name}`); resolve() }
        else reject(new Error(`Upload failed (${res.statusCode}): ${body}`))
      })
    })
    req.on('error', reject)
    // Stream with backpressure so large files don't overflow the socket
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => {
      uploaded += chunk.length
      drawProgress(uploaded, size, name)
      const ok = req.write(chunk)
      if (!ok) stream.pause()
    })
    req.on('drain', () => stream.resume())
    stream.on('end', () => req.end())
    stream.on('error', reject)
  })
}

async function main() {
  console.log(`\nPublishing ${OWNER}/${REPO} ${TAG}\n`)
  const release = await getOrCreateRelease()
  for (const name of ARTIFACTS) {
    let filePath = path.join(RELEASE_DIR, name)
    if (!fs.existsSync(filePath)) {
      // electron-builder may use productName on disk instead of package name
      // Try to find by extension as fallback
      const files = fs.readdirSync(RELEASE_DIR)
      const ext = path.extname(name)
      const match = files.find(f => f.endsWith(ext) && !f.includes('unpacked') && f !== 'builder-debug.yml')
      if (match && name !== 'latest.yml') {
        filePath = path.join(RELEASE_DIR, match)
        console.log(`  Using ${match} for ${name}`)
      } else {
        console.warn(`  ⚠ Skipping ${name} — file not found`)
        continue
      }
    }
    await deleteExistingAsset(release.id, name)
    await uploadAsset(release.id, name, filePath)
  }
  console.log(`\n✅  Done: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}\n`)
}

main().catch((err) => { console.error('❌', err.message); process.exit(1) })
```

---

## Step 8 — package.json scripts

Add/update these scripts in `package.json`:

```json
"dist": "npm run build && electron-builder",
"dist:win": "npm run build && electron-builder --win",
"dist:dir": "npm run build && electron-builder --dir",
"dist:publish": "npm run build && electron-builder --publish never && node scripts/publish-release.mjs"
```

The key: `--publish never` prevents electron-builder's built-in race-condition
publisher. Our script handles all uploads reliably afterward.

---

## Step 9 — GitHub Actions CI workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and publish
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
        run: npm run dist:publish
```

---

## Step 10 — GitHub repository secrets

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`

Add these two secrets:

| Name | Value |
|------|-------|
| `GH_TOKEN` | A GitHub PAT with `repo` scope (https://github.com/settings/tokens) |
| `JWT_SECRET` | The production JWT secret (same as in your `.env`) |

---

## Step 11 — TypeScript: fix React imports (if applicable)

If the project uses `verbatimModuleSyntax: true` in tsconfig, `@types/react` v18+
has no default export. Fix all React imports across `src/`:

**Find:** `import React from 'react'`
**Replace with:** `import * as React from 'react'`

**Find:** `import React, { useState } from 'react'`  (or any named imports)
**Replace with:**
```ts
import * as React from 'react'
import { useState } from 'react'
```

Run this PowerShell to fix all files at once:
```powershell
Get-ChildItem -Recurse -Path src -Include *.tsx,*.ts | ForEach-Object {
  $c = Get-Content $_.FullName -Raw
  if ($c -match "import React, \{([^}]+)\} from 'react'") {
    $c = $c -replace "import React, \{([^}]+)\} from 'react'", "import * as React from 'react'`nimport {`$1} from 'react'"
    Set-Content $_.FullName $c -NoNewline
  }
  if ($c -match "import React from 'react'") {
    $c = $c -replace "import React from 'react'", "import * as React from 'react'"
    Set-Content $_.FullName $c -NoNewline
  }
}
```

---

## How to release a new version

### Option A — Local publish (from your PC)
1. Bump `version` in `package.json`
2. Commit and push
3. Run: `npm run dist:publish`
   - `GH_TOKEN` is read from `.env` automatically
   - Creates GitHub release, uploads `.exe` + `.blockmap` + `latest.yml`

### Option B — CI publish (GitHub Actions)
1. Bump `version` in `package.json`
2. Commit and push
3. In VS Code: `Ctrl+Shift+P` → **Git: Create Tag** → `v1.x.x`
4. `Ctrl+Shift+P` → **Git: Push Tags**
5. GitHub Actions builds and publishes automatically (~10 min)

---

## How the updater works at runtime

1. App starts → after 5 seconds calls `autoUpdater.checkForUpdatesAndNotify()`
2. electron-updater fetches `latest.yml` from the GitHub release
3. If version in `latest.yml` > current app version → downloads the new installer
4. Shows notification to user → on confirm, calls `autoUpdater.quitAndInstall()`
5. App restarts with new version installed

---

## Common errors and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find latest.yml` 404 | `latest.yml` not uploaded to release | Run `npm run dist:publish` again |
| `GH_TOKEN is not set` | Token missing from `.env` | Add `GH_TOKEN=ghp_...` to `.env` |
| `Missing Shortcut` dialog | `productName` has `&` or spaces in exe name | Set `executableName` in `electron-builder.yml` |
| App doesn't open after install | `JWT_SECRET` missing | Ensure `.env.example` is in `extraFiles` and has a default `JWT_SECRET` |
| `ERR_IPC_CHANNEL_CLOSED` in dev | `autoUpdater` called in dev mode | Guard with `if (app.isPackaged)` |
| `Bad credentials` on publish | Token revoked or wrong | Generate new PAT at github.com/settings/tokens |
| `Upload failed (404)` on first publish | GitHub release not propagated yet | Script waits 5s automatically — if still fails, delete the release/tag and re-run |
