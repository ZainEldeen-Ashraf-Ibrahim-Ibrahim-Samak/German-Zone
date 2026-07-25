import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/useAuthStore.js'
import { useSyncStore } from '../../store/useSyncStore.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'

// Show/hide toggle button rendered inside a password input
function PasswordToggle({
  shown,
  onToggle,
  label,
}: {
  shown: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className="absolute bottom-2 end-3 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
    >
      {shown ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  )
}

export default function SecuritySettings() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const user = useAuthStore((s) => s.user)

  const {
    status,
    isConnecting,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    fetchStatus,
    connect,
    reconnect,
    disconnect,
    setAutoSync,
    error: syncError,
    clearError,
  } = useSyncStore()

  // ── App password change ──────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState<string | null>(null)
  // per-field inline errors
  const [newPwFieldError, setNewPwFieldError] = useState<string | undefined>()
  const [confirmPwFieldError, setConfirmPwFieldError] = useState<string | undefined>()

  // ── MongoDB / auto-sync ──────────────────────────────────────────────────
  const [mongoUri, setMongoUri] = useState('')
  const [mongoUriError, setMongoUriError] = useState<string | undefined>()
  const [showNewUriForm, setShowNewUriForm] = useState(false)
  const [autoInterval, setAutoInterval] = useState('30')
  const [autoIntervalError, setAutoIntervalError] = useState<string | undefined>()

  useEffect(() => {
    fetchStatus()
  }, [])

  // Sync interval input when persisted value loads after restart
  useEffect(() => {
    if (autoSyncIntervalMinutes) {
      setAutoInterval(String(autoSyncIntervalMinutes))
    }
  }, [autoSyncIntervalMinutes])

  const isConnected = status?.connected ?? false

  const handleChangePassword = async () => {
    // Clear previous state
    setPwError(null)
    setPwSuccess(null)
    setNewPwFieldError(undefined)
    setConfirmPwFieldError(undefined)

    // Validate new password
    if (!newPassword.trim()) {
      setNewPwFieldError(isAr ? 'يرجى إدخال كلمة المرور الجديدة' : 'Please enter a new password')
      return
    }
    if (newPassword.trim().length < 4) {
      setNewPwFieldError(isAr ? 'كلمة المرور قصيرة جداً (4 أحرف على الأقل)' : 'Too short — minimum 4 characters')
      return
    }
    // Validate confirm password
    if (!confirmPassword) {
      setConfirmPwFieldError(isAr ? 'يرجى تأكيد كلمة المرور' : 'Please confirm the password')
      return
    }
    if (newPassword !== confirmPassword) {
      setConfirmPwFieldError(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
      return
    }
    if (!user) return

    setPwSaving(true)
    try {
      await window.api.users.update({ id: user.id, patch: { password: newPassword } })
      setPwSuccess(isAr ? 'تم تغيير كلمة المرور بنجاح ✓' : 'Password changed successfully ✓')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      let msg = err.message || 'Failed to change password'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setPwError(msg)
    } finally {
      setPwSaving(false)
    }
  }

  const handleConnect = async () => {
    setMongoUriError(undefined)
    if (!mongoUri.trim()) {
      setMongoUriError(isAr ? 'يرجى إدخال رابط الاتصال أولاً' : 'Please enter a connection URI first')
      return
    }
    if (!mongoUri.trim().startsWith('mongodb')) {
      setMongoUriError(isAr ? 'رابط غير صحيح — يجب أن يبدأ بـ mongodb://' : 'Invalid URI — must start with mongodb://')
      return
    }
    await connect(mongoUri.trim())
  }

  const handleToggleAutoSync = async () => {
    setAutoIntervalError(undefined)
    const interval = Number(autoInterval)
    if (!autoSyncEnabled && (isNaN(interval) || interval < 1)) {
      setAutoIntervalError(isAr ? 'يرجى إدخال فترة صحيحة (دقيقة واحدة على الأقل)' : 'Enter a valid interval (min 1 minute)')
      return
    }
    await setAutoSync(!autoSyncEnabled, interval || 30)
  }

  return (
    <div className="space-y-6">
      {/* ── App password ────────────────────────────────────────────────── */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            🔒 {isAr ? 'كلمة مرور التطبيق' : 'App Password'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAr
              ? 'تغيير كلمة المرور الخاصة بحسابك الحالي.'
              : 'Change the password for your current account.'}
          </p>
        </div>

        {pwError && (
          <Alert variant="danger" onClose={() => setPwError(null)}>
            {pwError}
          </Alert>
        )}
        {pwSuccess && (
          <Alert variant="success" onClose={() => setPwSuccess(null)}>
            {pwSuccess}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div className="relative">
            <Input
              type={showNewPassword ? 'text' : 'password'}
              label={isAr ? 'كلمة المرور الجديدة' : 'New Password'}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                if (newPwFieldError) setNewPwFieldError(undefined)
              }}
              placeholder="••••••••"
              className="pe-11"
              error={newPwFieldError}
              disabled={pwSaving}
            />
            <PasswordToggle
              shown={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              label={showNewPassword
                ? isAr ? 'إخفاء كلمة المرور' : 'Hide password'
                : isAr ? 'إظهار كلمة المرور' : 'Show password'}
            />
          </div>
          <div className="relative">
            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              label={isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (confirmPwFieldError) setConfirmPwFieldError(undefined)
              }}
              placeholder="••••••••"
              className="pe-11"
              error={confirmPwFieldError}
              disabled={pwSaving}
            />
            <PasswordToggle
              shown={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              label={showConfirmPassword
                ? isAr ? 'إخفاء كلمة المرور' : 'Hide password'
                : isAr ? 'إظهار كلمة المرور' : 'Show password'}
            />
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleChangePassword}
          isLoading={pwSaving}
          disabled={pwSaving}
          className="w-full sm:w-auto mt-2"
        >
          {isAr ? 'تغيير كلمة المرور' : 'Change Password'}
        </Button>
      </Card>

      {/* ── MongoDB connection ───────────────────────────────────────────── */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              ☁️ {isAr ? 'قاعدة البيانات السحابية (MongoDB)' : 'Cloud Database (MongoDB)'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isAr
                ? 'رابط الاتصال بقاعدة بيانات MongoDB للمزامنة السحابية.'
                : 'MongoDB connection URI used for cloud synchronization.'}
            </p>
          </div>
          <Badge variant={isConnected ? 'success' : 'neutral'}>
            {isConnected ? (isAr ? 'متصل' : 'Connected') : isAr ? 'غير متصل' : 'Disconnected'}
          </Badge>
        </div>

        {syncError && (
          <Alert variant="danger" onClose={clearError}>
            {syncError}
          </Alert>
        )}

        {isConnected ? (
          <Button variant="secondary" onClick={disconnect}>
            {isAr ? 'قطع الاتصال' : 'Disconnect'}
          </Button>
        ) : status?.uri && !showNewUriForm ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              {isAr ? 'رابط محفوظ:' : 'Saved URI:'}{' '}
              <span className="font-mono">{status.uri}</span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => reconnect()}
                isLoading={isConnecting}
                disabled={isConnecting}
              >
                {isAr ? 'إعادة الاتصال' : 'Reconnect'}
              </Button>
              <Button variant="outline" onClick={() => setShowNewUriForm(true)}>
                {isAr ? 'تغيير الرابط' : 'Change URI'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {showNewUriForm && status?.uri && (
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-600 underline"
                onClick={() => { setShowNewUriForm(false); setMongoUri(''); setMongoUriError(undefined) }}
              >
                ← {isAr ? 'استخدام الرابط المحفوظ' : 'Use saved URI'}
              </button>
            )}
            <div className="flex items-end gap-3 max-w-2xl">
              <div className="flex-1">
                <Input
                  type="text"
                  label={isAr ? 'رابط الاتصال' : 'Connection URI'}
                  value={mongoUri}
                  onChange={(e) => {
                    setMongoUri(e.target.value)
                    if (mongoUriError) setMongoUriError(undefined)
                  }}
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net/db"
                  error={mongoUriError}
                  disabled={isConnecting}
                />
              </div>
              <Button
                onClick={handleConnect}
                isLoading={isConnecting}
                disabled={isConnecting}
                variant="primary"
              >
                {isAr ? 'اتصال' : 'Connect'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Auto-sync ────────────────────────────────────────────────────── */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              🔄 {isAr ? 'المزامنة التلقائية' : 'Auto-Sync'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isAr
                ? 'دفع السجلات غير المتزامنة تلقائياً على فترات منتظمة.'
                : 'Automatically push unsynced records on a regular interval.'}
            </p>
          </div>
          <Badge variant={autoSyncEnabled ? 'success' : 'neutral'}>
            {autoSyncEnabled ? (isAr ? 'مفعّل' : 'Active') : isAr ? 'موقف' : 'Off'}
          </Badge>
        </div>

        <div className="flex items-end gap-3 max-w-md">
          <div className="w-48">
            <Input
              type="number"
              label={isAr ? 'الفترة (دقائق)' : 'Interval (minutes)'}
              value={autoInterval}
              onChange={(e) => {
                setAutoInterval(e.target.value)
                if (autoIntervalError) setAutoIntervalError(undefined)
              }}
              min={1}
              disabled={autoSyncEnabled}
              error={autoIntervalError}
            />
          </div>
          <Button
            variant={autoSyncEnabled ? 'danger' : 'primary'}
            onClick={handleToggleAutoSync}
            disabled={!isConnected && !autoSyncEnabled}
          >
            {autoSyncEnabled ? (isAr ? 'إيقاف المزامنة' : 'Disable Sync') : isAr ? 'تفعيل المزامنة' : 'Enable Sync'}
          </Button>
        </div>
        {!isConnected && !autoSyncEnabled && (
          <p className="text-xs text-amber-600 font-medium">
            ⚠ {isAr ? 'يجب الاتصال بقاعدة البيانات السحابية أولاً لتفعيل المزامنة.' : 'Connect to MongoDB first to enable auto-sync.'}
          </p>
        )}
        {!isConnected && autoSyncEnabled && (
          <p className="text-xs text-blue-600 font-medium">
            ℹ {isAr ? 'المزامنة التلقائية مفعّلة — ستعمل تلقائياً عند إعادة الاتصال.' : 'Auto-sync is enabled — it will run automatically once reconnected.'}
          </p>
        )}
      </Card>
    </div>
  )
}
