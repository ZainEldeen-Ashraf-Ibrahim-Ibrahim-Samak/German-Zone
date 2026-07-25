import * as React from 'react'
import { useAuthStore } from '../../store/useAuthStore.js'
import { Alert } from '../ui/Alert.js'

interface RoleGuardProps {
  allowedRoles: ('admin' | 'employee')[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallback,
}) => {
  const { user, isAuthenticated } = useAuthStore()

  if (!isAuthenticated || !user) {
    return (
      <div className="p-6">
        <Alert variant="danger" title="غير مصرح / Unauthorized">
          يرجى تسجيل الدخول للوصول إلى هذه الصفحة. / Please log in to access this page.
        </Alert>
      </div>
    )
  }

  const hasAccess = allowedRoles.includes(user.role)

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="p-8 max-w-lg mx-auto mt-12">
        <div className="bg-white border border-red-100 rounded-2xl p-8 shadow-sm flex flex-col items-center text-center gap-4">
          <div className="p-3.5 bg-red-50 text-red-500 rounded-full">
            <svg
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-bold text-slate-800">
              عذراً، لا تملك الصلاحية الكافية
            </h2>
            <span className="text-slate-500 text-sm font-semibold">
              Access Denied / Forbidden
            </span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            هذه الصفحة مخصصة لمدراء النظام فقط. يرجى التواصل مع المسؤول إذا كنت بحاجة للمساعدة.
            <br />
            This page is restricted to administrators only.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
