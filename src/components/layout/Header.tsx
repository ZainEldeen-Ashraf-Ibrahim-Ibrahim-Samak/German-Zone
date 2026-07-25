import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/useAuthStore.js'
import { LanguageSwitcher } from './LanguageSwitcher.js'
import { NotificationsBell } from './NotificationsBell.js'
import { Button } from '../ui/Button.js'

export const Header: React.FC = () => {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
      {/* Welcome Message */}
      <div className="flex flex-col gap-0.5 text-start">
        <h1 className="text-lg font-bold text-slate-800 m-0 p-0 leading-none">
          {t('welcome')}, {user?.name || user?.username}
        </h1>
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
          {user?.role === 'admin' ? t('admin') : t('employee')}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <NotificationsBell />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Separator */}
        <div className="h-6 w-px bg-slate-200" />

        {/* Logout Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200 gap-1.5 focus:ring-red-500 font-semibold"
        >
          <svg
            className="h-4.5 w-4.5 transform flip-x-rtl"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span>{t('logout')}</span>
        </Button>
      </div>
    </header>
  )
}
