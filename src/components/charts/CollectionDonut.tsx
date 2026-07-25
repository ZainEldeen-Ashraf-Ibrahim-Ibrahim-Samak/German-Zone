import { useTranslation } from 'react-i18next'
import type { RevenueByServiceEntry } from '../../hooks/useDashboard.js'

interface CollectionDonutProps {
  data: RevenueByServiceEntry[]
}

export default function CollectionDonut({ data }: CollectionDonutProps) {
  const { i18n } = useTranslation()

  if (!data || data.length === 0) return null

  const totalCollected = data.reduce((sum, item) => sum + item.collected, 0)

  // Mapping service types to colors
  const serviceConfigs: Record<string, { color: string; labelEn: string; labelAr: string }> = {
    'حضانة': { color: '#0d9488', labelAr: 'حضانة', labelEn: 'Nursery' }, // Teal 600
    'استضافة': { color: '#f59e0b', labelAr: 'استضافة', labelEn: 'Hosting' }, // Amber 500
    'جلسة': { color: '#10b981', labelAr: 'جلسة', labelEn: 'Session' }, // Emerald 500
  }

  // Calculate percentages and angles
  const radius = 50
  const circ = 2 * Math.PI * radius

  const segments = data
    .filter((d) => d.collected > 0)
    .map((d, idx, arr) => {
      const config = serviceConfigs[d.service] || { color: '#cbd5e1', labelAr: d.service, labelEn: d.service }
      const percent = totalCollected > 0 ? d.collected / totalCollected : 0
      const strokeDasharray = `${(percent * circ).toFixed(2)} ${(circ * (1 - percent)).toFixed(2)}`

      // Sum of the percentages of all preceding segments (offset from 12 o'clock)
      const accumulatedPercent = arr
        .slice(0, idx)
        .reduce((sum, prev) => sum + (totalCollected > 0 ? prev.collected / totalCollected : 0), 0)
      const strokeDashoffset = (circ - accumulatedPercent * circ).toFixed(2)

      return {
        service: d.service,
        collected: d.collected,
        percent,
        color: config.color,
        label: i18n.language === 'ar' ? config.labelAr : config.labelEn,
        strokeDasharray,
        strokeDashoffset,
      }
    })

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(val)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-slate-800 text-base text-start">
        {i18n.language === 'ar' ? 'توزيع الإيرادات حسب الخدمة' : 'Revenue Distribution by Service'}
      </h3>

      {totalCollected === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 font-medium">
          {i18n.language === 'ar' ? 'لا توجد إيرادات مسجلة هذا الشهر' : 'No revenues recorded this month'}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
          {/* Donut Chart */}
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth="14"
              />

              {/* Segments */}
              {segments.map((seg, idx) => (
                <circle
                  key={idx}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-500 hover:stroke-[16] cursor-pointer"
                />
              ))}
            </svg>

            {/* Inner Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                {i18n.language === 'ar' ? 'الإجمالي' : 'Total'}
              </span>
              <span className="text-sm font-bold text-slate-800 mt-0.5 font-mono">
                {formatCurrency(totalCollected)}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2.5 flex-1 min-w-[140px] text-start w-full">
            {segments.map((seg, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: seg.color }}
                  ></span>
                  <span className="text-xs font-semibold text-slate-650">{seg.label}</span>
                </div>
                <div className="text-end">
                  <span className="text-xs font-bold text-slate-800 font-mono block">
                    {formatCurrency(seg.collected)}
                  </span>
                  <span className="text-[10px] text-slate-450 font-semibold font-mono">
                    {Math.round(seg.percent * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
