import * as React from 'react'
import clsx from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral'
  size?: 'sm' | 'md'
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className,
}) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full select-none',
        {
          'bg-emerald-50 text-emerald-700 border border-emerald-200':
            variant === 'success',
          'bg-red-50 text-red-700 border border-red-200': variant === 'danger',
          'bg-amber-50 text-amber-700 border border-amber-200':
            variant === 'warning',
          'bg-blue-50 text-blue-700 border border-blue-200': variant === 'info',
          'bg-slate-100 text-slate-700 border border-slate-200':
            variant === 'neutral',
        },
        {
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-2.5 py-1 text-xs': size === 'md',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
