import * as React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface UpdaterStatus {
  event: 'checking-for-update' | 'update-available' | 'update-not-available' | 'error' | 'download-progress' | 'update-downloaded'
  info?: any
  error?: string
  errorCode?: 'rate_limit' | 'network' | 'unknown'
  progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
}

export const UpdateBanner: React.FC = () => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdaterStatus['event'] | 'idle'>('idle')
  const [percent, setPercent] = useState<number>(0)
  const [errorCode, setErrorCode] = useState<'rate_limit' | 'network' | 'unknown' | null>(null)
  const [isVisible, setIsVisible] = useState<boolean>(false)

  useEffect(() => {
    if (!window.api?.updater) return

    const unsubscribe = window.api.updater.onStatusChange((payload) => {
      console.log('Updater status payload:', payload)
      setStatus(payload.event)

      if (payload.event === 'checking-for-update') {
        setIsVisible(true)
      } else if (payload.event === 'update-available') {
        setIsVisible(true)
      } else if (payload.event === 'update-not-available') {
        setTimeout(() => setIsVisible(false), 5000)
      } else if (payload.event === 'download-progress' && payload.progress) {
        setErrorCode(null)
        setIsVisible(true)
        setPercent(Math.round(payload.progress.percent))
      } else if (payload.event === 'update-downloaded') {
        setIsVisible(true)
      } else if (payload.event === 'error') {
        const code = payload.errorCode ?? 'unknown'
        setIsVisible(true)
        setErrorCode(code)
        // Auto-hide only generic errors; rate_limit and network stay visible so user can act
        if (code === 'unknown') {
          setTimeout(() => setIsVisible(false), 8000)
        }
      }
    })

    return () => { unsubscribe() }
  }, [])

  const handleRestart = () => {
    window.api?.updater?.install()
  }

  const handleManualDownload = () => {
    window.api?.updater?.openReleasePage()
  }

  const handleRetry = () => {
    setErrorCode(null)
    setStatus('idle')
    setIsVisible(false)
    window.api?.updater?.check()
  }

  if (!isVisible || status === 'idle') return null

  let bgClass = 'bg-teal-50 border-teal-200 text-teal-800'
  let iconColor = 'text-teal-500'
  if (status === 'error') {
    bgClass = 'bg-rose-50 border-rose-200 text-rose-800'
    iconColor = 'text-rose-500'
  } else if (status === 'update-downloaded') {
    bgClass = 'bg-emerald-50 border-emerald-200 text-emerald-800'
    iconColor = 'text-emerald-500'
  } else if (status === 'checking-for-update' || status === 'download-progress') {
    bgClass = 'bg-sky-50 border-sky-200 text-sky-800'
    iconColor = 'text-sky-500'
  }

  const errorLabel = () => {
    if (errorCode === 'rate_limit') return t('update_error_rate_limit')
    if (errorCode === 'network') return t('update_error_network')
    return t('update_error', { error: '' }).replace(': ', '')
  }

  return (
    <div className={`border-b px-6 py-3 flex items-center justify-between shadow-sm transition-all duration-300 ${bgClass}`}>
      <div className="flex items-center gap-3 text-start">
        <div className={`p-1 rounded-full bg-white/80 shadow-sm ${iconColor}`}>
          {(status === 'checking-for-update' || status === 'download-progress') ? (
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </div>

        <div>
          <div className="font-semibold text-sm">
            {status === 'checking-for-update' && t('checking_updates')}
            {status === 'update-available' && t('update_available')}
            {status === 'update-not-available' && t('update_not_available')}
            {status === 'download-progress' && t('download_progress', { percent })}
            {status === 'update-downloaded' && t('update_downloaded')}
            {status === 'error' && errorLabel()}
          </div>
          {status === 'download-progress' && (
            <div className="w-64 bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Rate limit: only manual download, no retry (retrying a 429 makes it worse) */}
        {status === 'error' && errorCode === 'rate_limit' && (
          <button
            onClick={handleManualDownload}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            {t('download_manually')}
          </button>
        )}

        {/* Network error: manual download + retry */}
        {status === 'error' && errorCode === 'network' && (
          <>
            <button
              onClick={handleManualDownload}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              {t('download_manually')}
            </button>
            <button
              onClick={handleRetry}
              className="px-4 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2"
            >
              {t('retry_update')}
            </button>
          </>
        )}

        {status === 'update-downloaded' && (
          <button
            onClick={handleRestart}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            {t('restart_install')}
          </button>
        )}
      </div>
    </div>
  )
}
