import crypto from 'node:crypto'
import { getCloudinaryConfig } from '../env.js'

export interface UploadedImage {
  url: string
  publicId: string
}

/**
 * Compute a Cloudinary upload signature: sha1 of the request params (sorted by
 * key, joined as `k=v&...`) followed by the API secret. Exported for unit
 * testing (feature 004, FR — no network needed).
 */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex')
}

/**
 * Upload an image (data URL or raw base64/remote URL accepted by Cloudinary's
 * `file` field) to Cloudinary via a signed REST request. Runs in the main
 * process only; the API secret never leaves here. Throws a descriptive error
 * when Cloudinary is not configured or the request fails — the caller (renderer)
 * catches it and proceeds to save the child without a photo (offline-safe).
 */
export async function uploadImage(dataUrl: string, folder = 'nursery/children'): Promise<UploadedImage> {
  const config = getCloudinaryConfig()
  if (!config) {
    throw new Error('Cloudinary is not configured / لم يتم إعداد Cloudinary')
  }
  if (!dataUrl) {
    throw new Error('No image provided / لا توجد صورة')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signParams({ folder, timestamp }, config.apiSecret)

  const form = new FormData()
  form.append('file', dataUrl)
  form.append('api_key', config.apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('signature', signature)

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`
  const res = await fetch(endpoint, { method: 'POST', body: form })

  if (!res.ok) {
    let detail = ''
    try {
      const body: any = await res.json()
      detail = body?.error?.message ? `: ${body.error.message}` : ''
    } catch {
      // ignore body parse errors
    }
    throw new Error(`Cloudinary upload failed (${res.status})${detail}`)
  }

  const body: any = await res.json()
  return { url: body.secure_url as string, publicId: body.public_id as string }
}

/**
 * Upload any file (data URL) to Cloudinary via a signed REST request, targeting the
 * `/auto/upload` endpoint so Cloudinary detects the resource type itself (image, video,
 * or raw for documents/audio/anything else). Used by the child activity diary, which
 * accepts attachments of any type.
 */
export async function uploadFile(dataUrl: string, folder = 'nursery/children'): Promise<UploadedImage> {
  const config = getCloudinaryConfig()
  if (!config) {
    throw new Error('Cloudinary is not configured / لم يتم إعداد Cloudinary')
  }
  if (!dataUrl) {
    throw new Error('No file provided / لا يوجد ملف')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signParams({ folder, timestamp }, config.apiSecret)

  const form = new FormData()
  form.append('file', dataUrl)
  form.append('api_key', config.apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('signature', signature)

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`
  const res = await fetch(endpoint, { method: 'POST', body: form })

  if (!res.ok) {
    let detail = ''
    try {
      const body: any = await res.json()
      detail = body?.error?.message ? `: ${body.error.message}` : ''
    } catch {
      // ignore body parse errors
    }
    throw new Error(`Cloudinary file upload failed (${res.status})${detail}`)
  }

  const body: any = await res.json()
  return { url: body.secure_url as string, publicId: body.public_id as string }
}

/**
 * Upload a video (data URL or remote URL) to Cloudinary via a signed REST request,
 * identical in shape to `uploadImage` but targeting the `/video/upload` endpoint with
 * `resource_type=video` (feature 009 — child activity/diary media).
 */
export async function uploadVideo(dataUrl: string, folder = 'nursery/children'): Promise<UploadedImage> {
  const config = getCloudinaryConfig()
  if (!config) {
    throw new Error('Cloudinary is not configured / لم يتم إعداد Cloudinary')
  }
  if (!dataUrl) {
    throw new Error('No video provided / لا يوجد فيديو')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signParams({ folder, timestamp }, config.apiSecret)

  const form = new FormData()
  form.append('file', dataUrl)
  form.append('api_key', config.apiKey)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('signature', signature)

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudName}/video/upload`
  const res = await fetch(endpoint, { method: 'POST', body: form })

  if (!res.ok) {
    let detail = ''
    try {
      const body: any = await res.json()
      detail = body?.error?.message ? `: ${body.error.message}` : ''
    } catch {
      // ignore body parse errors
    }
    throw new Error(`Cloudinary video upload failed (${res.status})${detail}`)
  }

  const body: any = await res.json()
  return { url: body.secure_url as string, publicId: body.public_id as string }
}
