import * as React from 'react'
import clsx from 'clsx'

interface StatProps {
  title: string
  value: string | number
  unit?: string
  description?: string
  trend?: {
    value: string | number
    direction: 'up' | 'down' | 'neutral'
  }
  icon?: React.ReactNode
  className?: string
}

export const Stat: React.FC<StatProps> = ({
  title,
  value,
  unit,
  description,
  trend,
  icon,
  className,
}) => {
  return (
    <div
      className={clsx(
        'bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start sm:items-center justify-between gap-4 relative overflow-hidden',
        className
      )}
    >
      <div className="flex flex-col gap-1 flex-1 text-start z-10 min-w-0">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
          {title}
        </span>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
            {value}
          </span>
          {unit && <span className="text-sm text-slate-500 font-medium truncate">{unit}</span>}
        </div>
        
        {(trend || description) && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs">
            {trend && (
              <span
                className={clsx('font-semibold flex items-center whitespace-nowrap', {
                  'text-emerald-600': trend.direction === 'up',
                  'text-red-600': trend.direction === 'down',
                  'text-slate-500': trend.direction === 'neutral',
                })}
              >
                {trend.direction === 'up' && '↑'}
                {trend.direction === 'down' && '↓'}
                {trend.value}
              </span>
            )}
            {description && <span className="text-slate-400 font-medium truncate">{description}</span>}
          </div>
        )}
      </div>

      {icon && (
        <div className="p-3 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      )}
    </div>
  )
}
