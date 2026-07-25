import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Summary12MonthEntry } from '../../hooks/useDashboard.js'

interface RevenueChartProps {
  data: Summary12MonthEntry[]
}

const englishMonthsShort = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

export default function RevenueChart({ data }: RevenueChartProps) {
  const { i18n } = useTranslation()
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!data || data.length === 0) return null

  // Chart dimensions
  const width = 600
  const height = 240
  const paddingLeft = 60
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40

  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  // Find max value for Y scaling
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.collected, d.expenses)),
    1000 // default minimum max value to avoid division by zero
  )
  const yMax = Math.ceil(maxVal / 1000) * 1000

  // Calculate coordinates
  const points = data.map((d, idx) => {
    const x = paddingLeft + (idx / 11) * chartWidth
    const yCol = paddingTop + chartHeight - (d.collected / yMax) * chartHeight
    const yExp = paddingTop + chartHeight - (d.expenses / yMax) * chartHeight
    return { x, yCol, yExp, entry: d }
  })

  // Build SVG path strings
  const collectedPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yCol}`).join(' ')
  const expensesPath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yExp}`).join(' ')

  const collectedAreaPath = `${collectedPath} L ${points[11].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
  const expensesAreaPath = `${expensesPath} L ${points[11].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`

  // Format Y-axis grid values
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(val)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 relative">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-base">
          {i18n.language === 'ar' ? 'مقارنة الإيرادات بالمصاريف' : 'Collected vs Expenses Trend'}
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-teal-500 inline-block"></span>
            <span className="text-slate-500 font-medium">{i18n.language === 'ar' ? 'المحصل' : 'Collected'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-400 inline-block"></span>
            <span className="text-slate-500 font-medium">{i18n.language === 'ar' ? 'المصاريف' : 'Expenses'}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          {/* Grid Lines */}
          {yTicks.map((tick, idx) => {
            const y = paddingTop + chartHeight - (tick / yMax) * chartHeight
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="font-mono text-[10px] fill-slate-400 font-medium"
                >
                  {formatCurrency(tick)}
                </text>
              </g>
            )
          })}

          {/* Area Gradients */}
          <defs>
            <linearGradient id="gradientCol" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradientExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#f87171" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Shaded Areas */}
          <path d={collectedAreaPath} fill="url(#gradientCol)" className="transition-all duration-300" />
          <path d={expensesAreaPath} fill="url(#gradientExp)" className="transition-all duration-300" />

          {/* Lines */}
          <path
            d={expensesPath}
            fill="none"
            stroke="#f87171"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />
          <path
            d={collectedPath}
            fill="none"
            stroke="#0d9488"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />

          {/* X Axis Labels */}
          {points.map((p, idx) => (
            <text
              key={idx}
              x={p.x}
              y={height - 15}
              textAnchor="middle"
              className="text-[10px] fill-slate-400 font-semibold"
            >
              {i18n.language === 'ar' ? p.entry.month : englishMonthsShort[idx]}
            </text>
          ))}

          {/* Interaction vertical lines and tooltip anchors */}
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx
            return (
              <g key={idx} onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}>
                {/* Invisible wide capture bar */}
                <rect
                  x={p.x - chartWidth / 24}
                  y={paddingTop}
                  width={chartWidth / 12}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                />

                {/* Vertical hover guide */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={paddingTop}
                    x2={p.x}
                    y2={paddingTop + chartHeight}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Data Points */}
                <circle
                  cx={p.x}
                  cy={p.yExp}
                  r={isHovered ? 6 : 4}
                  fill="#f87171"
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="transition-all duration-155"
                />
                <circle
                  cx={p.x}
                  cy={p.yCol}
                  r={isHovered ? 6 : 4}
                  fill="#0d9488"
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="transition-all duration-155"
                />
              </g>
            )
          })}
        </svg>

        {/* Floating Tooltip HTML Overlay */}
        {hoveredIdx !== null && (
          <div
            className={`absolute bg-slate-900/95 text-white p-3 rounded-lg shadow-xl text-xs flex flex-col gap-1 z-30 transition-all pointer-events-none border border-slate-700/50`}
            style={{
              left: `${Math.min(
                width - 160,
                Math.max(20, points[hoveredIdx].x - 80)
              )}px`,
              top: `${Math.min(
                height - 90,
                Math.max(10, Math.min(points[hoveredIdx].yCol, points[hoveredIdx].yExp) - 75)
              )}px`,
            }}
          >
            <div className="font-semibold text-slate-300 border-b border-slate-700 pb-1 mb-1 text-center">
              {i18n.language === 'ar' ? points[hoveredIdx].entry.month : englishMonthsShort[hoveredIdx]} {new Date().getFullYear()}
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">{i18n.language === 'ar' ? 'المحصل:' : 'Collected:'}</span>
              <span className="font-semibold font-mono text-teal-400">
                {formatCurrency(points[hoveredIdx].entry.collected)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">{i18n.language === 'ar' ? 'المصاريف:' : 'Expenses:'}</span>
              <span className="font-semibold font-mono text-red-400">
                {formatCurrency(points[hoveredIdx].entry.expenses)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
