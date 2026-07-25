import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

type AutoSyncState = 'idle' | 'connecting' | 'pushing' | 'pulling' | 'done' | 'error'

/**
 * Banner shown while the automatic sync cycle runs (including the one that
 * starts immediately when the app opens). Hides itself shortly after the
 * cycle finishes.
 */
export const SyncBanner: React.FC = () => {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [state, setState] = useState<AutoSyncState>('idle')
  const [isVisible, setIsVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!window.api?.sync) return

    const apply = (next: AutoSyncState) => {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null }
      setState(next)
      if (next === 'connecting' || next === 'pushing' || next === 'pulling') {
        setIsVisible(true)
      } else if (next === 'done' || next === 'error') {
        setIsVisible(true)
        hideTimer.current = setTimeout(() => setIsVisible(false), next === 'done' ? 3000 : 6000)
      }
    }

    // Catch a cycle already in flight (the startup sync can begin before this mounts).
    window.api.sync.autoSyncStatus()
      .then((s: { state: AutoSyncState; running: boolean }) => {
        if (s.running) apply(s.state)
      })
      .catch(() => {})

    const unsubscribe = window.api.sync.onAutoSyncStatus((payload) => apply(payload.state))
    return () => {
      unsubscribe()
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  if (!isVisible || state === 'idle') return null

  const isRunning = state === 'connecting' || state === 'pushing' || state === 'pulling'

  let bgClass = 'bg-sky-50 border-sky-200 text-sky-800'
  let iconColor = 'text-sky-500'
  if (state === 'done') {
    bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-800'
    iconColor = 'text-emerald-500'
  } else if (state === 'error') {
    bgClass = 'bg-amber-50 border-amber-200 text-amber-800'
    iconColor = 'text-amber-500'
  }

  const label = () => {
    switch (state) {
      case 'connecting': return isAr ? 'جارٍ الاتصال بخادم المزامنة…' : 'Connecting to sync server…'
      case 'pushing': return isAr ? 'جارٍ رفع البيانات إلى السحابة…' : 'Uploading data to the cloud…'
      case 'pulling': return isAr ? 'جارٍ تنزيل البيانات من السحابة…' : 'Downloading data from the cloud…'
      case 'done': return isAr ? 'اكتملت المزامنة بنجاح ✓' : 'Sync completed successfully ✓'
      case 'error': return isAr ? 'تعذّرت المزامنة — سيُعاد المحاولة تلقائياً' : 'Sync failed — will retry automatically'
      default: return ''
    }
  }

  return (
    <div className={`border-b px-6 py-2.5 flex items-center gap-3 shadow-sm transition-all duration-300 ${bgClass}`}>
      <div className={`p-1 rounded-full bg-white/80 shadow-sm ${iconColor}`}>
        {isRunning ? (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : state === 'done' ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        )}
      </div>
      <span className="font-semibold text-sm text-start">{label()}</span>
    </div>
  )
}
