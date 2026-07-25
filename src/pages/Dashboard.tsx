import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDashboard } from '../hooks/useDashboard.js'
import { useAuthStore } from '../store/useAuthStore.js'
import { Card } from '../components/ui/Card.js'
import { Stat } from '../components/ui/Stat.js'
import { Select } from '../components/ui/Select.js'
import { Modal } from '../components/ui/Modal.js'
import { Alert } from '../components/ui/Alert.js'
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js'
import RevenueChart from '../components/charts/RevenueChart.js'
import CollectionDonut from '../components/charts/CollectionDonut.js'
import MonthlyProfitBar from '../components/charts/MonthlyProfitBar.js'

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

const englishMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')

  // Get current month index and year
  const today = new Date()
  const defaultMonth = arabicMonths[today.getMonth()]
  const defaultYear = today.getFullYear()

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth)
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear)
  const [showMethods, setShowMethods] = useState(false)

  const { data, isLoading, error, refresh, clearError } = useDashboard(
    selectedMonth,
    selectedYear
  )

  // Target profit margin simulator (interactive state)
  const [customMargin, setCustomMargin] = useState<number>(20)

  // Synchronize dynamic simulator default margin when data loads
  useEffect(() => {
    if (data && data.kpis) {
      // Approximate target profit percentage from data target
      const totalExpenses = data.kpis.expensesTotal + data.kpis.salariesTotal
      if (data.target.required > 0 && totalExpenses > 0) {
        const pct = Math.round((1 - totalExpenses / data.target.required) * 100)
        setCustomMargin(Math.max(5, Math.min(95, pct)))
      } else {
        setCustomMargin(20)
      }
    }
  }, [data])

  // Localized months and years options
  const monthOptions = useMemo(() => {
    return arabicMonths.map((m, idx) => ({
      value: m,
      label: i18n.language === 'ar' ? m : englishMonths[idx],
    }))
  }, [i18n.language])

  const yearOptions = useMemo(() => {
    return yearsList.map((y) => ({
      value: y,
      label: y.toString(),
    }))
  }, [])

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(e.target.value)
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(Number(e.target.value))
  }

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    }).format(val)
  }

  // Calculations for simulated dynamic target calculator
  const simulatedValues = useMemo(() => {
    if (!data) return { required: 0, gap: 0, progress: 0 }
    const totalExpenses = data.kpis.expensesTotal + data.kpis.salariesTotal
    const marginRatio = customMargin / 100
    const required = marginRatio < 1 ? Number((totalExpenses / (1 - marginRatio)).toFixed(2)) : 0
    const gap = Number(Math.max(0, required - data.kpis.collected).toFixed(2))
    const progress = required > 0 ? Math.min(100, Math.round((data.kpis.collected / required) * 100)) : 0
    return { required, gap, progress }
  }, [data, customMargin])

  // Translate monthly database names to selected language
  const translateMonth = (monthName: string) => {
    const idx = arabicMonths.indexOf(monthName)
    if (idx !== -1) {
      return i18n.language === 'ar' ? monthName : englishMonths[idx]
    }
    return monthName
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dashboard')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {i18n.language === 'ar'
              ? 'مراقبة المؤشرات والأهداف المالية والمصاريف التشغيلية.'
              : 'Monitor key financial indicators, operational targets, and expenses.'}
          </p>
        </div>

        {/* Refresh / Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            disabled={isLoading}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span>🔄</span>
            {i18n.language === 'ar' ? 'تحديث البيانات' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Selectors and Stats Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Period Selector Card */}
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2 text-start flex items-center gap-1.5">
            <span>📅</span>
            {i18n.language === 'ar' ? 'الفترة الزمنية' : 'Reporting Period'}
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase">{t('select_month')}</span>
              <Select value={selectedMonth} onChange={handleMonthChange} options={monthOptions} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase">{t('select_year')}</span>
              <Select value={selectedYear} onChange={handleYearChange} options={yearOptions} />
            </div>
          </div>
        </Card>

        {/* Loading overlay / content */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 border border-slate-200 rounded-xl bg-white/50 backdrop-blur-sm">
              <LoadingSpinner size="lg" />
              <span className="text-slate-500 font-medium mt-3 text-sm">
                {i18n.language === 'ar' ? 'جاري تحميل البيانات المالية...' : 'Loading financial records...'}
              </span>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-64 border border-slate-200 rounded-xl bg-white/50 text-slate-400">
              {i18n.language === 'ar' ? 'لا توجد بيانات متاحة للمدة المحددة' : 'No data available for selected period'}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Smart Alerts */}
              {data.alerts && data.alerts.length > 0 && (
                <div className="space-y-2">
                  {data.alerts.map((alt, idx) => (
                    <Alert
                      key={idx}
                      variant={alt.type}
                      title={
                        alt.type === 'danger'
                          ? (i18n.language === 'ar' ? 'تنبيه عاجل' : 'Urgent Alert')
                          : alt.type === 'warning'
                          ? (i18n.language === 'ar' ? 'تحذير مالي' : 'Financial Warning')
                          : (i18n.language === 'ar' ? 'تنويه' : 'Notification')
                      }
                    >
                      {i18n.language === 'ar' ? alt.messageAr : alt.messageEn}
                    </Alert>
                  ))}
                </div>
              )}

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Stat
                  title={t('invoiced')}
                  value={formatCurrency(data.kpis.invoiced)}
                  icon="💰"
                />
                <div
                  role={isAdmin ? 'button' : undefined}
                  tabIndex={isAdmin ? 0 : undefined}
                  onClick={isAdmin ? () => setShowMethods(true) : undefined}
                  onKeyDown={isAdmin ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowMethods(true) } } : undefined}
                  className={`bg-white rounded-xl shadow-sm p-5 flex items-start sm:items-center justify-between gap-4 border border-slate-200 bg-gradient-to-br from-white to-teal-50/20 ${
                    isAdmin ? 'cursor-pointer hover:shadow-md hover:border-teal-300 transition-all' : ''
                  }`}
                >
                  <div className="flex flex-col gap-1 text-start min-w-0">
                    <span className="text-xs font-semibold text-teal-600 uppercase tracking-wider truncate">
                      {t('collected')}
                    </span>
                    <span className="text-xl sm:text-2xl font-extrabold text-teal-700 font-mono tracking-tight mt-1 truncate">
                      {formatCurrency(data.kpis.collected)}
                    </span>
                    {isAdmin && (
                      <span className="text-[10px] text-teal-500/80 mt-0.5">
                        {i18n.language === 'ar' ? 'اضغط لعرض طرق الدفع' : 'Click for payment methods'}
                      </span>
                    )}
                  </div>
                  <span className="text-2xl bg-teal-50 text-teal-600 p-2.5 rounded-lg flex-shrink-0">✅</span>
                </div>
                <div className={`bg-white rounded-xl shadow-sm p-5 flex items-start sm:items-center justify-between gap-4 border border-slate-200 ${
                  data.kpis.arrears > 0 ? 'bg-gradient-to-br from-white to-rose-50/20 border-rose-200' : ''
                }`}>
                  <div className="flex flex-col gap-1 text-start min-w-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
                      {t('arrears')}
                    </span>
                    <span className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight mt-1 truncate ${
                      data.kpis.arrears > 0 ? 'text-rose-600' : 'text-slate-750'
                    }`}>
                      {formatCurrency(data.kpis.arrears)}
                    </span>
                  </div>
                  <span className={`text-2xl p-2.5 rounded-lg flex-shrink-0 ${
                    data.kpis.arrears > 0 ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-500'
                  }`}>⚠️</span>
                </div>
                <Stat
                  title={i18n.language === 'ar' ? 'المصاريف التشغيلية' : 'Operational Cost'}
                  value={formatCurrency(data.kpis.expensesTotal + data.kpis.salariesTotal)}
                  description={
                    i18n.language === 'ar'
                      ? `رواتب: ${formatCurrency(data.kpis.salariesTotal)} | نفقات: ${formatCurrency(data.kpis.expensesTotal)}`
                      : `Salaries: ${formatCurrency(data.kpis.salariesTotal)} | Expenses: ${formatCurrency(data.kpis.expensesTotal)}`
                  }
                  icon="💸"
                />
                {isAdmin && (
                <div className={`bg-white rounded-xl shadow-sm p-5 flex items-start sm:items-center justify-between gap-4 border border-slate-200 ${
                  data.kpis.netProfit >= 0 ? 'bg-gradient-to-br from-white to-emerald-50/20' : 'bg-gradient-to-br from-white to-red-50/20 border-red-200'
                }`}>
                  <div className="flex flex-col gap-1 text-start min-w-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
                      {i18n.language === 'ar' ? 'صافي الربح' : 'Net Profit'}
                    </span>
                    <span className={`text-xl sm:text-2xl font-extrabold font-mono tracking-tight mt-1 truncate ${
                      data.kpis.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(data.kpis.netProfit)}
                    </span>
                  </div>
                  <span className={`text-2xl p-2.5 rounded-lg flex-shrink-0 ${
                    data.kpis.netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                  }`}>📈</span>
                </div>
                )}
                <div className="bg-white rounded-xl shadow-sm p-5 flex items-start sm:items-center justify-between gap-4 border border-slate-200">
                  <div className="flex flex-col gap-1 text-start min-w-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
                      {i18n.language === 'ar' ? 'نسبة تحصيل الاشتراكات' : 'Collection Rate'}
                    </span>
                    <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-800 tracking-tight mt-1 truncate">
                      {Math.round(data.kpis.collectionRate * 100)}%
                    </span>
                  </div>
                  <span className="text-2xl bg-slate-50 text-slate-500 p-2.5 rounded-lg flex-shrink-0">📊</span>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <RevenueChart data={data.summary12Month} />
                </div>
                <CollectionDonut data={data.revenueByService} />
                <MonthlyProfitBar target={data.target} netProfit={data.kpis.netProfit} />
              </div>

              {/* Dashboard Sub-components & Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 12-Month Summary Table */}
                <Card className="p-5 lg:col-span-2 space-y-4 flex flex-col justify-between">
                  <div className="text-start">
                    <h3 className="font-bold text-slate-800 text-base">
                      {i18n.language === 'ar' ? 'الملخص المالي لـ 12 شهراً' : '12-Month Financial Summary'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {i18n.language === 'ar' ? 'تقرير تراكمي يوضح المحصل والمصاريف وصافي الأرباح شهرياً' : 'Cumulative view of monthly collections, costs, profits, and targets'}
                    </p>
                  </div>

                  <div className="overflow-x-auto border border-slate-100 rounded-lg">
                    <table className="min-w-full divide-y divide-slate-150">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2.5 text-start text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'الشهر' : 'Month'}</th>
                          <th className="px-4 py-2.5 text-end text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'المحصل' : 'Collected'}</th>
                          <th className="px-4 py-2.5 text-end text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'المصاريف' : 'Expenses'}</th>
                          <th className="px-4 py-2.5 text-end text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'صافي الربح' : 'Net Profit'}</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'المستهدف' : 'Target'}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100 text-sm">
                        {data.summary12Month.map((row) => (
                          <tr key={row.month} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 font-medium text-slate-700 text-start">{translateMonth(row.month)}</td>
                            <td className="px-4 py-2 text-end font-mono font-medium text-slate-800">{formatCurrency(row.collected)}</td>
                            <td className="px-4 py-2 text-end font-mono text-slate-650">{formatCurrency(row.expenses)}</td>
                            <td className={`px-4 py-2 text-end font-mono font-semibold ${row.netProfit >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
                              {formatCurrency(row.netProfit)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.status === 'target_met'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-100'
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {row.status === 'target_met'
                                  ? (i18n.language === 'ar' ? 'مكتمل' : 'Met')
                                  : (i18n.language === 'ar' ? 'عجز' : 'Missed')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Left Column: Target Calculator and Revenue Breakdown */}
                <div className="space-y-6">
                  
                  {/* Dynamic Target Calculator Card */}
                  <Card className="p-5 space-y-4 text-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base">
                        {i18n.language === 'ar' ? 'حاسبة هامش الربح المستهدف' : 'Target Margin Calculator'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {i18n.language === 'ar' 
                          ? 'محاكاة المستهدف المالي اللازم بناءً على مصاريف الشهر الحالية وهامش الربح المطلوب.'
                          : 'Simulate financial targets based on actual monthly expenses and desired profit margin.'}
                      </p>
                    </div>

                    <div className="space-y-3.5 pt-2">
                      {/* Margin Slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-500">{i18n.language === 'ar' ? 'هامش الربح المطلوب' : 'Desired Profit Margin'}</span>
                          <span className="text-teal-600 font-bold font-mono">{customMargin}%</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="80"
                          step="5"
                          value={customMargin}
                          onChange={(e) => setCustomMargin(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        />
                      </div>

                      {/* Display calculations */}
                      <div className="space-y-2.5 border-t border-slate-100 pt-3.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-450 font-medium">{i18n.language === 'ar' ? 'المصاريف الفعلية:' : 'Actual Costs:'}</span>
                          <span className="font-mono font-bold text-slate-700">
                            {formatCurrency(data.kpis.expensesTotal + data.kpis.salariesTotal)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450 font-medium">{i18n.language === 'ar' ? 'الإيراد المستهدف المطلوب:' : 'Required Target Revenue:'}</span>
                          <span className="font-mono font-extrabold text-slate-800 text-sm">
                            {formatCurrency(simulatedValues.required)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-450 font-medium">{i18n.language === 'ar' ? 'المبلغ المحصل حالياً:' : 'Actual Collected:'}</span>
                          <span className="font-mono font-bold text-teal-600">
                            {formatCurrency(data.kpis.collected)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-50 pt-2 font-semibold">
                          <span className="text-slate-600">{i18n.language === 'ar' ? 'الفجوة للمستهدف المختار:' : 'Gap to Desired Target:'}</span>
                          <span className={`font-mono font-bold ${simulatedValues.gap > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                            {simulatedValues.gap > 0 ? formatCurrency(simulatedValues.gap) : (i18n.language === 'ar' ? 'تم تحقيق المستهدف!' : 'Target Met!')}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar towards simulated target */}
                      <div className="space-y-1">
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              simulatedValues.progress >= 100 ? 'bg-teal-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${simulatedValues.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold font-mono block text-end">
                          {simulatedValues.progress}%
                        </span>
                      </div>
                    </div>
                  </Card>

                  {/* Revenue-by-service table */}
                  <Card className="p-5 space-y-4">
                    <div className="text-start">
                      <h3 className="font-bold text-slate-800 text-base">
                        {i18n.language === 'ar' ? 'الإيرادات حسب نوع الخدمة' : 'Revenue by Service Type'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {i18n.language === 'ar' ? 'تفاصيل المبالغ المحصلة لكل خدمة ونسبتها من الإجمالي' : 'Breakdown of collections per service and their share of total revenue'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {data.revenueByService.map((srv) => {
                        const totalRev = data.revenueByService.reduce((sum, item) => sum + item.collected, 0)
                        const pct = totalRev > 0 ? Math.round((srv.collected / totalRev) * 100) : 0
                        
                        // Color matching
                        const colorClass = 
                          srv.service === 'حضانة' ? 'bg-teal-500' :
                          srv.service === 'استضافة' ? 'bg-amber-500' : 'bg-emerald-500'

                        const label = 
                          srv.service === 'حضانة' ? t('services.nursery') :
                          srv.service === 'استضافة' ? t('services.hosting') : t('services.session')

                        return (
                          <div key={srv.service} className="border border-slate-100 rounded-lg p-3 space-y-2 hover:bg-slate-50/50 transition-all">
                            <div className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`}></span>
                                <span>{label}</span>
                              </div>
                              <span className="font-mono text-slate-400 font-bold">{pct}%</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                              <span className="text-[10px] text-slate-400 uppercase font-semibold">{t('collected')}</span>
                              <span className="text-sm font-bold font-mono text-slate-800">{formatCurrency(srv.collected)}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>

                </div>

              </div>

            {/* Collected-by-method breakdown (admin drill-down on the Collected card) */}
            <Modal
              isOpen={showMethods}
              onClose={() => setShowMethods(false)}
              title={i18n.language === 'ar' ? 'التحصيل حسب طريقة الدفع' : 'Collected by Payment Method'}
            >
              {data.collectedByMethod.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {i18n.language === 'ar' ? 'لا توجد مدفوعات محصّلة لهذا الشهر.' : 'No collected payments this month.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.collectedByMethod.map((m) => (
                    <div key={m.method} className="flex justify-between items-center py-2.5">
                      <span className="text-sm text-slate-700">{m.method}</span>
                      <span className="font-mono font-bold text-teal-700">{formatCurrency(m.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2.5 border-t-2 border-slate-200">
                    <span className="text-sm font-semibold text-slate-800">{i18n.language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                    <span className="font-mono font-extrabold text-teal-800">{formatCurrency(data.kpis.collected)}</span>
                  </div>
                </div>
              )}
            </Modal>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}