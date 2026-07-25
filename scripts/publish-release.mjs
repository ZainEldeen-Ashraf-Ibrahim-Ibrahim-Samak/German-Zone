/**
 * Uploads all release artifacts to GitHub after electron-builder packages them.
 * Replaces the racy built-in publisher for local dist:publish runs.
 *
 * Usage: node scripts/publish-release.mjs
 * Requires: GH_TOKEN env var with repo scope.
 */

import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { config } from 'dotenv'

// Load .env so GH_TOKEN works without manually setting it in the terminal
config()

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const VERSION = pkg.version
const TOKEN = process.env.GH_TOKEN
const OWNER = 'ZainEldeen-Ashraf-Ibrahim-Ibrahim-Samak'
const REPO = 'Nursery'
const TAG = `v${VERSION}`
const RELEASE_DIR = 'release'

if (!TOKEN) {
  console.error('❌  GH_TOKEN is not set. Run: $env:GH_TOKEN = "ghp_..."')
  process.exit(1)
}

// Files to upload (name on GitHub → local path)
const ARTIFACTS = [
  `nursery-management-system-setup-${VERSION}.exe`,
  `nursery-management-system-setup-${VERSION}.exe.blockmap`,
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
  // Try to find existing release
  const get = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })

  if (get.status === 200) {
    console.log(`✓ Found existing release ${TAG} (id: ${get.body.id})`)
    return get.body
  }

  // Create new release
  console.log(`Creating release ${TAG}...`)
  const create = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases`,
    method: 'POST',
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
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
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })
  if (list.status !== 200) return
  const existing = list.body.find((a) => a.name === name)
  if (!existing) return
  await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`,
    method: 'DELETE',
    headers: { Authorization: `token ${TOKEN}`, 'User-Agent': 'publish-release', Accept: 'application/vnd.github+json' },
  })
  console.log(`  Replaced existing ${name}`)
}

function drawProgress(uploaded, total, name) {
  const BAR = 40
  const pct = total > 0 ? uploaded / total : 0
  const filled = Math.round(pct * BAR)
  const bar = '█'.repeat(filled) + '░'.repeat(BAR - filled)
  const mb = (b) => (b / 1024 / 1024).toFixed(1)
  const speed = ''
  process.stdout.write(
    `\r  [${bar}] ${Math.round(pct * 100)}%  ${mb(uploaded)}/${mb(total)} MB  ${name}   `
  )
}

function uploadAsset(releaseId, name, filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size
    console.log(`\n  Uploading ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`)

    let uploaded = 0
    let aborted = false
    let rejected = false

    const safeReject = (err) => {
      if (rejected) return
      rejected = true
      reject(err)
    }

    const stream = fs.createReadStream(filePath)

    const req = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      method: 'POST',
      headers: {
        Authorization: `token ${TOKEN}`,
        'User-Agent': 'publish-release',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
      },
    }, (res) => {
      if (res.statusCode !== 201 && res.statusCode !== 200) {
        aborted = true
        stream.destroy()
        
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          req.destroy()
          safeReject(new Error(`Upload failed (${res.statusCode}): ${body}`))
        })
        res.on('error', (err) => {
          req.destroy()
          safeReject(new Error(`Upload failed (${res.statusCode}): ${err.message}`))
        })
        return
      }

      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => {
        process.stdout.write('\n')
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log(`  ✓ ${name}`)
          resolve()
        } else {
          safeReject(new Error(`Upload failed (${res.statusCode}): ${body}`))
        }
      })
    })

    req.on('error', (err) => {
      if (aborted) return
      safeReject(err)
    })

    // Stream file in chunks with backpressure so large files don't overflow the socket
    stream.on('data', (chunk) => {
      if (aborted) return
      uploaded += chunk.length
      drawProgress(uploaded, size, name)
      const ok = req.write(chunk)
      if (!ok) stream.pause()
    })
    req.on('drain', () => {
      if (!aborted) stream.resume()
    })
    stream.on('end', () => {
      if (!aborted) req.end()
    })
    stream.on('error', (err) => {
      if (aborted) return
      safeReject(err)
    })
  })
}

async function main() {
  console.log(`\nPublishing ${OWNER}/${REPO} ${TAG}\n`)

  const release = await getOrCreateRelease()

  for (const name of ARTIFACTS) {
    // Find local file — the exe may use the productName on disk
    let filePath = path.join(RELEASE_DIR, name)

    if (!fs.existsSync(filePath)) {
      // Try productName variant for the exe
      const exeVariant = path.join(RELEASE_DIR, `Nursery & Autism Center Management System Setup ${VERSION}.exe`)
      if (name.endsWith('.exe') && fs.existsSync(exeVariant)) {
        filePath = exeVariant
      } else {
        console.warn(`  ⚠ Skipping ${name} — not found at ${filePath}`)
        continue
      }
    }

    let attempts = 3
    let success = false
    let currentRelease = release
    while (attempts > 0 && !success) {
      try {
        await deleteExistingAsset(currentRelease.id, name)
        // Wait for GitHub's backend to replicate the deletion before uploading
        await new Promise((r) => setTimeout(r, 8000))
        await uploadAsset(currentRelease.id, name, filePath)
        success = true
      } catch (err) {
        attempts--
        if (attempts > 0) {
          console.warn(`  ⚠ Upload failed: ${err.message}. Retrying in 10 seconds... (${attempts} attempts left)`)
          await new Promise((r) => setTimeout(r, 10000))
          // Re-fetch release in case the ID changed
          currentRelease = await getOrCreateRelease()
        } else {
          throw err
        }
      }
    }
  }

  console.log(`\n✅  Release ${TAG} published successfully.`)
  console.log(`   https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}\n`)
}

main().catch((err) => { console.error('❌', err.message); process.exit(1) })
