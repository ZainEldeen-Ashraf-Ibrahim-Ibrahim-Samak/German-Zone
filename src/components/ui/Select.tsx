import * as React from 'react'
import clsx from 'clsx'

interface SelectOption {
  value: string | number
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: SelectOption[]
  fullWidth?: boolean
}

export const Select: React.FC<SelectProps> = ({
  className,
  label,
  error,
  options,
  fullWidth = true,
  id,
  ...props
}) => {
  const generatedId = React.useId()
  const selectId = id || generatedId

  return (
    <div className={clsx('flex flex-col gap-1.5', { 'w-full': fullWidth })}>
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-slate-700 select-none text-start"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'px-3.5 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 transition-all text-slate-900 bg-white cursor-pointer appearance-none',
          {
            'border-red-300 focus:border-red-500 focus:ring-red-200': error,
            'border-slate-300 focus:border-primary focus:ring-primary/20': !error,
          },
          className
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: 'left 0.75rem center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '1.25rem',
          paddingLeft: '2.5rem', // Provide spacing on the left for the arrow in LTR/RTL correctly
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-red-600 text-start font-medium mt-0.5">
          {error}
        </span>
      )}
    </div>
  )
}
