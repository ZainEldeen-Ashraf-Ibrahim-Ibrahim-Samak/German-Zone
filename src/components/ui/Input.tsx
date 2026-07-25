import * as React from 'react'
import clsx from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  fullWidth?: boolean
}

export const Input: React.FC<InputProps> = ({
  className,
  label,
  error,
  fullWidth = true,
  id,
  type = 'text',
  ...props
}) => {
  const generatedId = React.useId()
  const inputId = id || generatedId

  return (
    <div className={clsx('flex flex-col gap-1.5', { 'w-full': fullWidth })}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-slate-700 select-none text-start"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={clsx(
          'px-3.5 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all text-slate-900 placeholder:text-slate-400 bg-white',
          {
            'border-red-300 focus:border-red-500 focus:ring-red-200': error,
            'border-slate-300 focus:border-primary focus:ring-primary/20': !error,
          },
          className
        )}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-600 text-start font-medium mt-0.5">
          {error}
        </span>
      )}
    </div>
  )
}
