import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/useAuthStore.js'
import { Input } from '../components/ui/Input.js'
import { Button } from '../components/ui/Button.js'
import { Alert } from '../components/ui/Alert.js'
import { AppLogo } from '../components/ui/AppLogo.js'
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher.js'
import { UpdateBanner } from '../components/layout/UpdateBanner.js'
import { useBranding } from '../hooks/useBranding.js'

export default function Login() {
  const { t, i18n } = useTranslation()
  const { login, isLoading, error, clearError } = useAuthStore()
  const { branding } = useBranding()
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [isChecking, setIsChecking] = useState(false)

  const handleCheckUpdates = async () => {
    if (!window.api?.updater) return
    setIsChecking(true)
    try {
      await window.api.updater.check()
    } catch (err) {
      console.error('Failed to check for updates:', err)
    } finally {
      setTimeout(() => setIsChecking(false), 2000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    clearError()

    if (!username.trim()) {
      setValidationError(
        t('i18n_username_required', {
          defaultValue: 'اسم المستخدم مطلوب / Username is required',
        })
      )
      return
    }

    if (!password) {
      setValidationError(
        t('i18n_password_required', {
          defaultValue: 'كلمة المرور مطلوبة / Password is required',
        })
      )
      return
    }

    await login(username.trim(), password)
  }

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-50 px-4 relative">
      <div className="absolute top-0 left-0 right-0 z-50">
        <UpdateBanner />
      </div>

      {/* Top Floating Actions (Language & Updates) */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center gap-4">
        {/* Check for updates button */}
        <button
          onClick={handleCheckUpdates}
          disabled={isChecking}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 disabled:opacity-50 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
          </svg>
          <span>{isChecking ? t('checking') : t('check_updates')}</span>
        </button>

        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden p-8 flex flex-col items-center gap-6">
        {/* Branding Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <AppLogo className="w-16 h-16 text-2xl" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-slate-800 m-0 leading-tight">
              {branding?.brand_app_name || t('app_name')}
            </h2>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {branding?.brand_tagline || (i18n.language === 'ar' ? 'نظام الإدارة الماليّة' : 'Management System')}
            </span>
          </div>
        </div>

        {/* Login Title */}
        <div className="w-full text-center border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-slate-700 m-0">
            {t('login')}
          </h3>
        </div>

        {/* Feedback Messages */}
        {(validationError || error) && (
          <div className="w-full">
            <Alert variant="danger" onClose={() => { setValidationError(''); clearError(); }}>
              {validationError || (error ? t(error, { defaultValue: error }) : '')}
            </Alert>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
          <Input
            id="username-input"
            label={t('username')}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={i18n.language === 'ar' ? 'مدير / موظف' : 'admin / employee'}
            disabled={isLoading}
            autoFocus
          />

          <div className="relative">
            <Input
              id="password-input"
              label={t('password')}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className="pe-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={isLoading}
              aria-label={
                showPassword
                  ? t('hide_password')
                  : t('show_password')
              }
              className="absolute bottom-2 end-3 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 focus:outline-none"
            >
              {showPassword ? (
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
          </div>

          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            className="w-full py-2.5 mt-2 font-bold shadow-md shadow-primary/10"
          >
            {t('login')}
          </Button>
        </form>
      </div>

      {/* Footer copyright */}
      <div className="mt-8 text-center text-xs text-slate-400 font-medium select-none">
        © {new Date().getFullYear()} {branding?.brand_app_name || t('app_name')}. {i18n.language === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
      </div>
    </div>
  )
}