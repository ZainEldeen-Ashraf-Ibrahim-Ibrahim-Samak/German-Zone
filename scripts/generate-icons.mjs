/**
 * Regenerates the app icons from a single source image.
 *
 * Run with Electron (NOT plain node) so `nativeImage` does the decoding and resizing —
 * it is already a dependency, so this needs no image library:
 *
 *   npx electron scripts/generate-icons.mjs
 *
 * Produces, from `assets/branding/source-icon.jpg`:
 *   assets/branding/icon.ico          multi-size (16…256) — electron-builder rejects
 *                                     anything without a 256×256 entry
 *   assets/branding/icon.icns         macOS icon (16…1024, incl. @2x variants)
 *   assets/branding/icon.png          real 1024×1024 PNG (the BrowserWindow icon and the
 *                                     Linux target both load this by extension)
 *   assets/branding/logo.png          same, used for branded reports/print headers
 *   assets/default-branding/*.png     the copies seeded into userData on first launch
 *   public/favicon.png                browser-tab icon referenced by index.html
 */
import { app, nativeImage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Windows icon sizes. 256 must be present or app-builder's converter fails the build.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * macOS icon members: each OSType pins both a pixel size and the logical size it serves,
 * which is why 32/256/512 appear twice — once as a plain icon and once as the @2x variant
 * of the size below it. Modern types (10.7+) all carry PNG payloads.
 */
const ICNS_TYPES = [
  ['icp4', 16],   // 16×16
  ['icp5', 32],   // 32×32
  ['ic11', 32],   // 16×16@2x
  ['ic12', 64],   // 32×32@2x
  ['ic07', 128],  // 128×128
  ['ic13', 256],  // 128×128@2x
  ['ic08', 256],  // 256×256
  ['ic14', 512],  // 256×256@2x
  ['ic09', 512],  // 512×512
  ['ic10', 1024], // 512×512@2x
]

/** Packs already-encoded PNG buffers into a single .ico (PNG-compressed entries, Vista+). */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  // Image data starts after the header and the full directory.
  let offset = header.length + directory.length

  entries.forEach(({ size, png }, i) => {
    const at = i * 16
    directory[at] = size >= 256 ? 0 : size // 0 means 256 in the ICO format
    directory[at + 1] = size >= 256 ? 0 : size
    directory[at + 2] = 0 // palette colours (0 = truecolour)
    directory[at + 3] = 0 // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += png.length
  })

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)])
}

/**
 * Packs PNG buffers into an .icns. The container is a flat sequence of chunks — a 4-char
 * OSType and a big-endian length that counts its own 8-byte header — under one 'icns' header
 * whose length covers the whole file.
 */
function buildIcns(members) {
  const chunks = members.map(({ type, png }) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 4, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })

  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

app.whenReady().then(() => {
  try {
    // createFromBuffer sniffs the actual format, so a JPEG source works regardless of extension.
    const source = nativeImage.createFromBuffer(readFileSync(join(root, 'assets/branding/source-icon.jpg')))
    if (source.isEmpty()) throw new Error('Source icon could not be decoded')

    const { width, height } = source.getSize()
    console.log(`Source: ${width}×${height}`)
    if (width < 256 || height < 256) {
      throw new Error(`Source must be at least 256×256, got ${width}×${height}`)
    }

    // Resize once per distinct pixel size; several icns members reuse the same bitmap.
    const pngCache = new Map()
    const pngAt = (size) => {
      if (!pngCache.has(size)) {
        pngCache.set(size, source.resize({ width: size, height: size, quality: 'best' }).toPNG())
      }
      return pngCache.get(size)
    }

    const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: pngAt(size) })))
    writeFileSync(join(root, 'assets/branding/icon.ico'), ico)
    console.log(`icon.ico — ${ICO_SIZES.join(', ')} px (${ico.length} bytes)`)

    const icns = buildIcns(ICNS_TYPES.map(([type, size]) => ({ type, png: pngAt(size) })))
    writeFileSync(join(root, 'assets/branding/icon.icns'), icns)
    console.log(`icon.icns — ${ICNS_TYPES.length} members (${icns.length} bytes)`)

    // Tab icon. index.html points straight at this PNG — the previous favicon.svg was a
    // JPEG wrapped in an SVG and mislabelled `data:image/png`, at 827 KB.
    const favicon = pngAt(128)
    writeFileSync(join(root, 'public/favicon.png'), favicon)
    console.log(`public/favicon.png — 128×128 PNG (${favicon.length} bytes)`)

    // A genuine PNG this time: the previous files were JPEG data under a .png name, which
    // the Linux target and any extension-based loader cannot read.
    const png1024 = pngAt(1024)
    for (const target of [
      'assets/branding/icon.png',
      'assets/branding/logo.png',
      'assets/default-branding/icon.png',
      'assets/default-branding/logo.png',
    ]) {
      writeFileSync(join(root, target), png1024)
      console.log(`${target} — 1024×1024 PNG (${png1024.length} bytes)`)
    }

    app.exit(0)
  } catch (error) {
    console.error('Icon generation failed:', error)
    app.exit(1)
  }
})
