import * as React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotificationsStore } from '../../store/useNotificationsStore.js'

export const NotificationsBell: React.FC = () => {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { notifications, fetchNotifications, markRead, markAllRead, unreadCount } = useNotificationsStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unread = unreadCount()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-slate-100 text-slate-500"
        aria-label={isAr ? 'الإشعارات' : 'Notifications'}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">{isAr ? 'الإشعارات' : 'Notifications'}</span>
            {unread > 0 && (
              <button className="text-xs text-primary" onClick={() => markAllRead()}>
                {isAr ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 p-3">{isAr ? 'لا توجد إشعارات.' : 'No notifications.'}</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.read_at && markRead(n.id)}
                  className={`px-3 py-2 text-xs border-b border-slate-50 cursor-pointer ${n.read_at ? 'text-slate-400' : 'text-slate-700 bg-primary/5 font-medium'}`}
                >
                  {isAr ? n.message_ar : n.message_en}
                  <div className="text-[10px] text-slate-400 mt-0.5">{n.created_at}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
