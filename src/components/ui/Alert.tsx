import * as React from 'react'
import clsx from 'clsx'

interface AlertProps {
  variant?: 'success' | 'danger' | 'warning' | 'info'
  title?: string
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onClose,
  className,
}) => {
  return (
    <div
      className={clsx(
        'p-4 rounded-xl border flex gap-3 text-start transition-all',
        {
          'bg-emerald-50 text-emerald-800 border-emerald-200': variant === 'success',
          'bg-red-50 text-red-800 border-red-200': variant === 'danger',
          'bg-amber-50 text-amber-800 border-amber-200': variant === 'warning',
          'bg-blue-50 text-blue-800 border-blue-200': variant === 'info',
        },
        className
      )}
    >
      {/* Icon based on variant */}
      <div className="flex-shrink-0 mt-0.5">
        {variant === 'success' && (
          <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {variant === 'danger' && (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {variant === 'warning' && (
          <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
        {variant === 'info' && (
          <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-0.5">
        {title && <span className="font-semibold text-sm">{title}</span>}
        <div className="text-sm leading-relaxed">{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={clsx('flex-shrink-0 focus:outline-none rounded-lg p-1 transition-colors', {
            'hover:bg-emerald-100 text-emerald-600': variant === 'success',
            'hover:bg-red-100 text-red-600': variant === 'danger',
            'hover:bg-amber-100 text-amber-600': variant === 'warning',
            'hover:bg-blue-100 text-blue-600': variant === 'info',
          })}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
