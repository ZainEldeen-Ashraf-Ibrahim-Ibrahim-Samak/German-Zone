import * as React from 'react'
import clsx from 'clsx'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          // Primary: Uses branding primary (default Teal 700)
          'bg-primary hover:bg-primary-focus text-white focus:ring-primary':
            variant === 'primary',
          // Secondary / Accent: Uses branding accent (default Amber 500)
          'bg-accent hover:bg-accent-focus text-white focus:ring-accent':
            variant === 'secondary',
          // Outline
          'border border-slate-300 hover:bg-slate-50 text-slate-700 focus:ring-slate-500':
            variant === 'outline',
          // Success
          'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500':
            variant === 'success',
          // Danger
          'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500':
            variant === 'danger',
          // Ghost
          'hover:bg-slate-100 text-slate-700 focus:ring-slate-500':
            variant === 'ghost',
        },
        {
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-base': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
        },
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ms-1 me-2 h-4 w-4 text-current flex-shrink-0"
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
          <span>جاري التحميل... / Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}
