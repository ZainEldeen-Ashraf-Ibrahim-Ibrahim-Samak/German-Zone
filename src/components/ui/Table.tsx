import * as React from 'react'
import clsx from 'clsx'

interface Column<T> {
  key: string
  header: React.ReactNode
  render: (item: T, index: number) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T, index: number) => string | number
  emptyMessage?: string
  isLoading?: boolean
  className?: string
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'لا توجد بيانات متاحة / No data available',
  isLoading = false,
  className,
}: TableProps<T>) {
  return (
    <div className={clsx('w-full overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm', className)}>
      <table className="w-full text-sm text-slate-500 border-collapse">
        <thead className="bg-slate-50 text-slate-700 font-semibold text-start border-b border-slate-200">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                scope="col"
                className={clsx('px-6 py-3 text-start font-semibold', col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-10 text-center">
                <div className="flex flex-col items-center justify-center gap-3">
                  <svg
                    className="animate-spin h-8 w-8 text-primary"
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
                  <span className="text-slate-500 font-medium">
                    جاري تحميل البيانات... / Loading data...
                  </span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-10 text-center text-slate-400 font-medium"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => (
              <tr
                key={keyExtractor(item, rowIdx)}
                className="hover:bg-slate-50/80 transition-colors"
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={col.key || colIdx}
                    className={clsx('px-6 py-3.5 whitespace-nowrap text-start', col.className)}
                  >
                    {col.render(item, rowIdx)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
