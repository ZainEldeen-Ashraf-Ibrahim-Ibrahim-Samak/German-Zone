import * as React from 'react'
import clsx from 'clsx'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
  className?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  fullPage = false,
  className,
}) => {
  const spinnerElement = (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <svg
        className={clsx('animate-spin text-primary', {
          'h-5 w-5': size === 'sm',
          'h-8 w-8': size === 'md',
          'h-12 w-12': size === 'lg',
        })}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm font-medium text-slate-500">
        جاري التحميل... / Loading...
      </span>
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center">
        <div className="bg-white p-6 rounded-xl shadow-xl border border-slate-100">
          {spinnerElement}
        </div>
      </div>
    )
  }

  return spinnerElement
}
