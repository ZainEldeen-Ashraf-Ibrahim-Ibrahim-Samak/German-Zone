import { useTranslation } from 'react-i18next'

interface MonthlyProfitBarProps {
  target: {
    required: number
    collected: number
    gap: number
    status: 'met' | 'missed'
  }
  netProfit: number
}

export default function MonthlyProfitBar({ target, netProfit }: MonthlyProfitBarProps) {
  const { i18n } = useTranslation()

  const { required, collected, gap, status } = target

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(val)
  }

  // Calculate percentage of target collected
  const percentCollected = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0
  const isTargetMet = status === 'met' || collected >= required

  // SVG dimensions
  const width = 400
  const height = 180
  const barWidth = 45
  const barSpacing = 70
  
  // Calculate heights relative to max of required & collected (min 1000 to avoid division by zero)
  const maxVal = Math.max(required, collected, 1000)
  const chartHeight = 120
  const targetBarHeight = (required / maxVal) * chartHeight
  const collectedBarHeight = (collected / maxVal) * chartHeight

  // Coordinate calculations for SVG centering
  const startX = (width - (barWidth * 2 + barSpacing)) / 2
  const targetX = startX
  const collectedX = startX + barWidth + barSpacing
  const baseY = 140

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
      <div>
        <h3 className="font-bold text-slate-800 text-base text-start">
          {i18n.language === 'ar' ? 'مقارنة التحصيل بالمستهدف' : 'Collected vs Target'}
        </h3>
        <p className="text-xs text-slate-400 text-start mt-0.5">
          {i18n.language === 'ar' 
            ? 'مقارنة المبالغ المحصلة فعلياً بالمستهدف المالي المطلوب لتغطية النفقات وهامش الربح' 
            : 'Comparing actual collections with the target required to cover expenses and profit margin'}
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6 py-2">
        {/* SVG Custom Double Bar Chart */}
        <div className="relative w-full md:w-56 h-36 flex justify-center">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible select-none">
            {/* Grid line at 100% target */}
            <line
              x1="20"
              y1={baseY - targetBarHeight}
              x2={width - 20}
              y2={baseY - targetBarHeight}
              stroke="#e2e8f0"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={width - 15}
              y={baseY - targetBarHeight - 4}
              textAnchor="end"
              className="text-[10px] font-semibold fill-slate-400"
            >
              {i18n.language === 'ar' ? 'المستهدف' : 'Target'}
            </text>

            {/* Base Line */}
            <line
              x1="20"
              y1={baseY}
              x2={width - 20}
              y2={baseY}
              stroke="#cbd5e1"
              strokeWidth="2"
            />

            {/* Target Required Bar */}
            <g className="group">
              <rect
                x={targetX}
                y={baseY - targetBarHeight}
                width={barWidth}
                height={targetBarHeight}
                rx="6"
                fill="#94a3b8"
                className="transition-all duration-300 hover:fill-slate-500 cursor-pointer"
              />
              <text
                x={targetX + barWidth / 2}
                y={baseY - targetBarHeight - 8}
                textAnchor="middle"
                className="text-xs font-bold font-mono fill-slate-600"
              >
                {formatCurrency(required)}
              </text>
              <text
                x={targetX + barWidth / 2}
                y={baseY + 18}
                textAnchor="middle"
                className="text-xs font-semibold fill-slate-500"
              >
                {i18n.language === 'ar' ? 'المستهدف' : 'Target'}
              </text>
            </g>

            {/* Collected Bar */}
            <g className="group">
              <rect
                x={collectedX}
                y={baseY - collectedBarHeight}
                width={barWidth}
                height={collectedBarHeight}
                rx="6"
                fill={isTargetMet ? '#0d9488' : '#f59e0b'}
                className="transition-all duration-300 hover:opacity-95 cursor-pointer"
              />
              <text
                x={collectedX + barWidth / 2}
                y={baseY - collectedBarHeight - 8}
                textAnchor="middle"
                className={`text-xs font-bold font-mono ${isTargetMet ? 'fill-teal-600' : 'fill-amber-600'}`}
              >
                {formatCurrency(collected)}
              </text>
              <text
                x={collectedX + barWidth / 2}
                y={baseY + 18}
                textAnchor="middle"
                className="text-xs font-semibold fill-slate-500"
              >
                {i18n.language === 'ar' ? 'المحصل' : 'Collected'}
              </text>
            </g>
          </svg>
        </div>

        {/* Legend & Stats */}
        <div className="flex-1 w-full space-y-3.5 text-start">
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                {i18n.language === 'ar' ? 'نسبة الإنجاز' : 'Completion Rate'}
              </span>
              <span className={`text-lg font-extrabold font-mono ${isTargetMet ? 'text-teal-600' : 'text-amber-600'}`}>
                {percentCollected}%
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              isTargetMet ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              {isTargetMet 
                ? (i18n.language === 'ar' ? 'مكتمل' : 'Achieved') 
                : (i18n.language === 'ar' ? 'غير مكتمل' : 'Shortfall')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
              <span className="text-slate-400 block font-semibold mb-0.5">
                {i18n.language === 'ar' ? 'صافي الربح' : 'Net Profit'}
              </span>
              <span className={`font-mono font-bold text-sm ${netProfit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                {formatCurrency(netProfit)}
              </span>
            </div>
            <div className="border border-slate-100 rounded-lg p-2.5 bg-slate-50/50">
              <span className="text-slate-400 block font-semibold mb-0.5">
                {i18n.language === 'ar' ? 'الفجوة المالية' : 'Target Gap'}
              </span>
              <span className="font-mono font-bold text-sm text-slate-700">
                {gap > 0 ? formatCurrency(gap) : (i18n.language === 'ar' ? 'لا يوجد' : 'None')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
