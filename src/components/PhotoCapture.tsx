import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button.js'
import { Select } from './ui/Select.js'

interface PhotoCaptureProps {
  /** Current image (data URL or remote URL) to preview, if any. */
  value?: string | null
  /** Emits a JPEG data URL when a photo is captured or uploaded, or null when removed. */
  onChange: (dataUrl: string | null) => void
}

/**
 * Child photo input (feature 004): capture from a selectable camera device, or
 * upload an image file. Emits a data URL the parent uploads to Cloudinary on
 * save. Camera APIs run in the Electron renderer (Chromium); when no camera is
 * available the file-upload path still works.
 */
export default function PhotoCapture({ value, onChange }: PhotoCaptureProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)

  // Stop the camera stream on unmount.
  useEffect(() => {
    return () => stopStream()
  }, [])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const startCamera = async (preferredId?: string) => {
    setCamError(null)
    try {
      stopStream()
      const constraints: MediaStreamConstraints = {
        video: preferredId ? { deviceId: { exact: preferredId } } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setIsCameraOn(true)

      // Enumerate devices (labels are available once permission is granted).
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter((d) => d.kind === 'videoinput')
      setDevices(cams)
      if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId)
    } catch (err: any) {
      setCamError(isAr ? 'تعذّر الوصول إلى الكاميرا' : 'Unable to access the camera')
      setIsCameraOn(false)
    }
  }

  const handleDeviceChange = (id: string) => {
    setDeviceId(id)
    if (isCameraOn) startCamera(id)
  }

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    onChange(dataUrl)
    stopStream()
    setIsCameraOn(false)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  const deviceOptions = devices.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `${isAr ? 'كاميرا' : 'Camera'} ${i + 1}`,
  }))

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-slate-700">{t('photo')}</label>

      <div className="flex items-start gap-4">
        {/* Preview / placeholder */}
        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="child" className="w-full h-full object-cover" />
          ) : isCameraOn ? null : (
            <span className="text-3xl text-slate-300">🧒</span>
          )}
        </div>

        <div className="space-y-2 flex-1">
          {isCameraOn && (
            <div className="space-y-2">
              <video ref={videoRef} className="w-48 h-36 bg-black rounded-lg object-cover" muted playsInline />
              {deviceOptions.length > 1 && (
                <Select
                  value={deviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  options={deviceOptions}
                />
              )}
            </div>
          )}

          {camError && <p className="text-xs text-red-500">{camError}</p>}

          <div className="flex flex-wrap gap-2">
            {!isCameraOn ? (
              <Button type="button" variant="outline" size="sm" onClick={() => startCamera(deviceId || undefined)}>
                📷 {t('use_camera')}
              </Button>
            ) : (
              <Button type="button" variant="primary" size="sm" onClick={capture}>
                ⏺ {t('capture')}
              </Button>
            )}

            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              ⬆️ {t('upload_photo')}
            </Button>

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-500"
                onClick={() => {
                  onChange(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                🗑️ {t('remove_photo')}
              </Button>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>
    </div>
  )
}
