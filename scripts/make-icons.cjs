/**
 * Build real PNG + multi-resolution Windows .ico from the branding icon.
 * The source assets/branding/icon.png is actually a JPEG; nativeImage decodes
 * it regardless of extension. Run with: `electron scripts/make-icons.cjs`.
 */
const { app, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const assets = path.join(__dirname, '..', 'assets')

function buildIco(pngBuffers) {
  // pngBuffers: array of { size, buffer } (PNG-encoded entries)
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngBuffers.forEach((entry, i) => {
    const b = dir.subarray(i * 16, i * 16 + 16)
    b.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0) // width (0 == 256)
    b.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1) // height
    b.writeUInt8(0, 2) // color palette
    b.writeUInt8(0, 3) // reserved
    b.writeUInt16LE(1, 4) // color planes
    b.writeUInt16LE(32, 6) // bits per pixel
    b.writeUInt32LE(entry.buffer.length, 8) // size of image data
    b.writeUInt32LE(offset, 12) // offset
    offset += entry.buffer.length
  })

  return Buffer.concat([header, dir, ...pngBuffers.map((e) => e.buffer)])
}

app.whenReady().then(() => {
  try {
    // 1) Re-save real 256x256 PNGs (overwrites the misnamed JPEGs)
    for (const sub of ['branding', 'default-branding']) {
      const file = path.join(assets, sub, 'icon.png')
      if (!fs.existsSync(file)) continue
      const img = nativeImage
        .createFromBuffer(fs.readFileSync(file))
        .resize({ width: 256, height: 256, quality: 'best' })
      fs.writeFileSync(file, img.toPNG())
      console.log('wrote real PNG:', file)
    }

    // 2) Multi-size .ico from the branding icon
    const base = nativeImage.createFromBuffer(
      fs.readFileSync(path.join(assets, 'branding', 'icon.png'))
    )
    const sizes = [16, 24, 32, 48, 64, 128, 256]
    const entries = sizes.map((size) => ({
      size,
      buffer: base.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    }))
    const icoPath = path.join(assets, 'branding', 'icon.ico')
    fs.writeFileSync(icoPath, buildIco(entries))
    console.log('wrote icon.ico with sizes', sizes)
  } catch (err) {
    console.error('icon build failed:', err)
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
