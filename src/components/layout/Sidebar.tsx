import * as React from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/useAuthStore.js'
import { AppLogo } from '../ui/AppLogo.js'
import { useBranding } from '../../hooks/useBranding.js'
import clsx from 'clsx'

export const Sidebar: React.FC = () => {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuthStore()
  const { branding } = useBranding()
  const [isChecking, setIsChecking] = React.useState(false)

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

  const isAdmin = user?.role === 'admin'

  // Navigation items definition
  const menuItems = [
    {
      to: '/',
      label: t('dashboard'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
      ),
      adminOnly: false,
      end: true,
    },
    {
      to: '/children',
      label: t('children'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      adminOnly: false,
    },
    {
      to: '/payments',
      label: t('payments'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      adminOnly: false,
    },
    {
      to: '/transactions',
      label: isAr ? 'المعاملات المالية' : 'Transactions',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      adminOnly: false,
    },
    {
      to: '/calendar',
      label: isAr ? 'التقويم' : 'Calendar',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      adminOnly: false,
    },
    {
      to: '/employees',
      label: t('employees'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.5-4.65" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/salaries',
      label: t('salaries'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/sessions',
      label: t('sessions'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      adminOnly: false,
    },
    {
      to: '/attendance/edit-requests',
      label: t('editRequests'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/expenses',
      label: t('expenses'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/target',
      label: t('target'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h2a2 2 0 002-2zm12 0v-3a2 2 0 00-2-2h-2a2 2 0 00-2 2v3a2 2 0 002 2h2a2 2 0 002-2zm0 0v-7a2 2 0 00-2-2h-2a2 2 0 00-2 2v9a2 2 0 002 2h2a2 2 0 002-2z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/users',
      label: t('users'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/storage',
      label: t('storage'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/sync',
      label: t('sync'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
        </svg>
      ),
      adminOnly: true,
    },
    {
      to: '/settings',
      label: t('settings'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      adminOnly: true,
    },
  ]

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen select-none border-l border-slate-800">
      {/* Sidebar Logo / Header */}
      <div className="h-16 flex items-center gap-3 px-6 bg-slate-950 border-b border-slate-800">
        <AppLogo className="w-8 h-8 text-sm" />
        <div className="flex flex-col text-start">
          <span className="font-bold text-white text-sm leading-tight truncate w-40">
            {branding?.brand_app_name || t('app_name')}
          </span>
          <span className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase leading-none mt-0.5">
            {branding?.brand_tagline || 'Autism Center System'}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-1">
        {menuItems.map((item) => {
          // Hide admin items for employees
          if (item.adminOnly && !isAdmin) return null

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3.5 px-4 py-3 text-sm font-medium rounded-lg transition-all group',
                  {
                    'bg-primary text-white shadow-md shadow-primary/15': isActive,
                    'hover:bg-slate-800/60 hover:text-white text-slate-400': !isActive,
                  }
                )
              }
            >
              <span className="flex-shrink-0 transition-colors group-hover:text-white">
                {item.icon}
              </span>
              <span className="text-start truncate flex-1">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      {/* Check for updates button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleCheckUpdates}
          disabled={isChecking}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-700/80 disabled:opacity-50 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer"
        >
          <svg className={clsx("w-4 h-4", { "animate-spin": isChecking })} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
          </svg>
          <span>
            {isChecking ? t('checking') : t('check_updates')}
          </span>
        </button>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-200 uppercase shadow-inner">
          {user?.name ? user.name[0] : user?.username[0]}
        </div>
        <div className="flex flex-col text-start truncate">
          <span className="text-sm font-semibold text-white truncate">
            {user?.name || user?.username}
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {user?.role === 'admin' ? t('admin') : t('employee')}
          </span>
        </div>
      </div>
    </aside>
  )
}
