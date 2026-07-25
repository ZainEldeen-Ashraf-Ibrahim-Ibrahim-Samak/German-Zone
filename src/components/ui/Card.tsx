import * as React from 'react'
import clsx from 'clsx'

interface CardProps {
  title?: React.ReactNode
  headerAction?: React.ReactNode
  children: React.ReactNode
  className?: string
  hoverable?: boolean
}

export const Card: React.FC<CardProps> = ({
  title,
  headerAction,
  children,
  className,
  hoverable = false,
}) => {
  return (
    <div
      className={clsx(
        'bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm flex flex-col',
        { 'hover:shadow-md hover:border-slate-300 transition-all': hoverable },
        className
      )}
    >
      {(title || headerAction) && (
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          {title && (
            <h3 className="font-semibold text-slate-800 text-lg text-start">
              {title}
            </h3>
          )}
          {headerAction && <div className="flex items-center">{headerAction}</div>}
        </div>
      )}
      <div className="p-6 flex-1 text-start">{children}</div>
    </div>
  )
}
