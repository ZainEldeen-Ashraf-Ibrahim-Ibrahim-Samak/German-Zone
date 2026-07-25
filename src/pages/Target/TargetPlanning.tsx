import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../components/ui/Card.js'
import { Stat } from '../../components/ui/Stat.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Badge } from '../../components/ui/Badge.js'

// ── types ──────────────────────────────────────────────────────────────────

interface MonthRow {
  month: string
  collected: number
  expenses: number
  salaries: number
  totalExpenses: number
  targetRequired: number
  gap: number
  coveragePct: number
  status: 'met' | 'missed'
}

interface TargetData {
  rows: MonthRow[]
  targetProfitPct: number
  annualCollected: number
  annualExpenses: number
  annualTargetRequired: number
  annualGap: number
}

interface CalcResult {
  projectedRevenue: number
  targetRequired: number
  coveragePct: number
  unitsNeeded: Record<string, number>
  pricing: Record<string, number>
}

interface ServiceScenario {
  childrenNeeded: number
  feasible: boolean
  maxRevenue: number
  utilization: number
}

interface CapacityPlan {
  totalCapacity: number
  desiredRevenue: number
  pricing: Record<string, number>
  scenarios: Record<string, ServiceScenario>
  recommendedMix: Record<string, number>
  recommendedRevenue: number
  metrics: {
    revenuePerClass: number
    revenuePerStaff: number
    childrenPerStaff: number
    revenueGap: number
  }
}

// ── constants ──────────────────────────────────────────────────────────────

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

const SERVICE_ICONS: Record<string, string> = {
  حضانة: '🏫',
  استضافة: '🏠',
  جلسة: '🧩',
}

// ── component ──────────────────────────────────────────────────────────────

export default function TargetPlanning() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TargetData | null>(null)

  // ── distribution calculator state ──────────────────────────────────────
  const [calcMonth, setCalcMonth]           = useState(arabicMonths[new Date().getMonth()])
  const [calcYear, setCalcYear]             = useState(new Date().getFullYear())
  const [calcCounts, setCalcCounts]         = useState<Record<string, string>>({ حضانة: '10', استضافة: '5', جلسة: '20' })
  const [calcProfitPct, setCalcProfitPct]   = useState('')
  const [calcResult, setCalcResult]         = useState<CalcResult | null>(null)
  const [isCalcing, setIsCalcing]           = useState(false)

  // ── capacity planner state ─────────────────────────────────────────────
  const [numClasses, setNumClasses]         = useState('')
  const [classCapacity, setClassCapacity]   = useState('')
  const [numStaff, setNumStaff]             = useState('')
  const [desiredRevenue, setDesiredRevenue] = useState('')
  const [capacityPlan, setCapacityPlan]     = useState<CapacityPlan | null>(null)

  // ── data fetch ─────────────────────────────────────────────────────────

  const fetchTarget = async (year: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.target.get({ year })
      setData(result)
      setCalcProfitPct((prev) =>
        prev.trim() === '' && result?.targetProfitPct != null
          ? String(Math.round(result.targetProfitPct * 100))
          : prev
      )
    } catch (err: any) {
      setError(stripIpcPrefix(err.message))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchTarget(currentYear) }, [currentYear])

  // ── handlers ───────────────────────────────────────────────────────────

  const stripIpcPrefix = (msg: string) =>
    msg.replace(/^Error: Error invoking remote method '[^']+': /, '')

  const handleCalc = async () => {
    setIsCalcing(true)
    setError(null)
    try {
      const distribution: Record<string, number> = {}
      for (const [svc, val] of Object.entries(calcCounts)) {
        const n = Number(val)
        if (!isNaN(n) && n > 0) distribution[svc] = n
      }
      const result = await window.api.target.calc({
        distribution,
        month: calcMonth,
        year: calcYear,
        targetProfitPct: calcProfitPct.trim() === '' ? undefined : Number(calcProfitPct) / 100,
      })
      setCalcResult(result)
    } catch (err: any) {
      setError(stripIpcPrefix(err.message))
    } finally {
      setIsCalcing(false)
    }
  }

  const handleCapacityPlan = async () => {
    setIsCalcing(true)
    setError(null)
    try {
      const plan = await window.api.target.capacityPlan({
        numClasses:    Number(numClasses)    || 0,
        classCapacity: Number(classCapacity) || 0,
        numStaff:      Number(numStaff)      || 0,
        desiredRevenue: Number(desiredRevenue) || 0,
      })
      setCapacityPlan(plan)
      setCalcResult(null) // switch results panel to capacity view
    } catch (err: any) {
      setError(stripIpcPrefix(err.message))
    } finally {
      setIsCalcing(false)
    }
  }

  // ── formatters ─────────────────────────────────────────────────────────

  const fc = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n)

  const fpct = (n: number) => `${Math.round(n * 100)}%`

  const yearOptions = useMemo(() => yearsList.map((y) => ({ value: y, label: y.toString() })), [])
  const monthOptions = useMemo(() =>
    arabicMonths.map((m, i) => ({ value: m, label: isAr ? m : englishMonths[i] })), [isAr])

  // ── render ─────────────────────────────────────────────────────────────

  const resultsMode = capacityPlan ? 'capacity' : calcResult ? 'distribution' : 'empty'

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'تخطيط الأهداف المالية' : 'Financial Target Planning'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? 'تحليل الأهداف الشهرية مع حاسبة القدرة الاستيعابية والتوزيع.'
              : 'Monthly target analysis with a capacity planner and distribution calculator.'}
          </p>
        </div>
        <Select
          label={isAr ? 'السنة' : 'Year'}
          value={currentYear.toString()}
          options={yearOptions}
          onChange={(e) => setCurrentYear(Number(e.target.value))}
        />
      </div>

      {error && (
        <Alert variant="danger" title={isAr ? 'خطأ' : 'Error'} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Annual Summary KPIs ── */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Stat title={isAr ? 'إجمالي المحصّل سنوياً' : 'Annual Collected'}
            value={fc(data.annualCollected)} icon="💵" />
          <Stat title={isAr ? 'إجمالي المصروفات سنوياً' : 'Annual Expenses'}
            value={fc(data.annualExpenses)} icon="💸" />
          <Stat title={isAr ? 'إجمالي الهدف المطلوب' : 'Annual Target Required'}
            value={fc(data.annualTargetRequired)} icon="🎯"
            description={`${fpct(data.targetProfitPct)} ${isAr ? 'هامش ربح مستهدف' : 'target profit margin'}`} />
          <Stat title={isAr ? 'إجمالي الفجوة السنوية' : 'Annual Gap'}
            value={fc(data.annualGap)} icon={data.annualGap === 0 ? '✅' : '⚠️'}
            description={data.annualGap === 0
              ? (isAr ? 'تم تحقيق الهدف' : 'Target achieved')
              : (isAr ? 'لم يتحقق الهدف' : 'Target not met')} />
        </div>
      )}

      {/* ── 12-Month Table ── */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">
            🎯 {isAr ? `تفاصيل الأهداف الشهرية لعام ${currentYear}` : `Monthly Targets for ${currentYear}`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'الشهر' : 'Month'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'المصروفات' : 'Expenses'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'الرواتب' : 'Salaries'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'إجمالي التكاليف' : 'Total Costs'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'الهدف المطلوب' : 'Target Required'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'المحصّل' : 'Collected'}</th>
                <th className="px-4 py-3 text-end font-semibold text-slate-600">{isAr ? 'الفجوة' : 'Gap'}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{isAr ? 'التغطية' : 'Coverage'}</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    {isAr ? 'جاري التحميل...' : 'Loading...'}
                  </td>
                </tr>
              ) : data ? (
                data.rows.map((row, idx) => (
                  <tr key={row.month}
                    className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {isAr ? row.month : englishMonths[arabicMonths.indexOf(row.month)]}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-slate-600">
                      {row.expenses > 0 ? fc(row.expenses) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-slate-600">
                      {row.salaries > 0 ? fc(row.salaries) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm font-bold text-slate-700">
                      {row.totalExpenses > 0 ? fc(row.totalExpenses) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-amber-700 font-semibold">
                      {row.targetRequired > 0 ? fc(row.targetRequired) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm text-emerald-700 font-semibold">
                      {row.collected > 0 ? fc(row.collected) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-end font-mono text-sm">
                      {row.gap > 0
                        ? <span className="text-red-600 font-semibold">{fc(row.gap)}</span>
                        : <span className="text-emerald-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.totalExpenses > 0 ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-20 bg-slate-200 rounded-full h-1.5" dir="ltr">
                            <div className={`h-1.5 rounded-full ${row.status === 'met' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, Math.round(row.coveragePct * 100))}%` }} />
                          </div>
                          <span className="text-xs font-mono text-slate-500">{fpct(row.coveragePct)}</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.totalExpenses > 0 ? (
                        <Badge variant={row.status === 'met' ? 'success' : 'warning'}>
                          {row.status === 'met'
                            ? (isAr ? '✅ محقق' : '✅ Met')
                            : (isAr ? '⚠️ لم يتحقق' : '⚠️ Missed')}
                        </Badge>
                      ) : <span className="text-slate-300 text-xs">{isAr ? 'لا بيانات' : 'No data'}</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    {isAr ? 'لا توجد بيانات' : 'No data available'}
                  </td>
                </tr>
              )}
            </tbody>
            {data && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td className="px-4 py-3 font-bold text-slate-700">{isAr ? 'الإجمالي' : 'Total'}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-slate-700">
                    {fc(data.rows.reduce((s, r) => s + r.expenses, 0))}
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-slate-700">
                    {fc(data.rows.reduce((s, r) => s + r.salaries, 0))}
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-slate-700">
                    {fc(data.annualExpenses)}
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-amber-700">
                    {fc(data.annualTargetRequired)}
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-emerald-700">
                    {fc(data.annualCollected)}
                  </td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-red-600">
                    {data.annualGap > 0 ? fc(data.annualGap) : '—'}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ── Calculator Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT: Inputs */}
        <div className="space-y-4">

          {/* ── Capacity & Goal inputs (new) ── */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <span className="text-xl">🏫</span>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {isAr ? 'قدرة المركز وهدف الإيراد' : 'Centre Capacity & Revenue Goal'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'أدخل بيانات المركز والهدف المالي الشهري لتحصل على خطة توزيع مثلى.'
                    : 'Enter centre data and your monthly income goal to get an optimal distribution plan.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={isAr ? 'عدد الفصول / القاعات' : 'Number of Classrooms'}
                type="number"
                min="0"
                value={numClasses}
                onChange={(e) => setNumClasses(e.target.value)}
                placeholder={isAr ? 'مثال: 5' : 'e.g. 5'}
              />
              <Input
                label={isAr ? 'سعة كل فصل (طفل)' : 'Capacity per Room (children)'}
                type="number"
                min="0"
                value={classCapacity}
                onChange={(e) => setClassCapacity(e.target.value)}
                placeholder={isAr ? 'مثال: 10' : 'e.g. 10'}
              />
              <Input
                label={isAr ? 'عدد الموظفين' : 'Number of Staff'}
                type="number"
                min="0"
                value={numStaff}
                onChange={(e) => setNumStaff(e.target.value)}
                placeholder={isAr ? 'مثال: 8' : 'e.g. 8'}
              />
              <Input
                label={isAr ? 'الإيراد المستهدف شهرياً (ج.م)' : 'Monthly Revenue Goal (EGP)'}
                type="number"
                min="0"
                value={desiredRevenue}
                onChange={(e) => setDesiredRevenue(e.target.value)}
                placeholder={isAr ? 'مثال: 50000' : 'e.g. 50000'}
              />
            </div>

            {/* Quick capacity preview */}
            {numClasses && classCapacity && (
              <div className="bg-slate-50 rounded-lg px-4 py-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">{isAr ? 'إجمالي الطاقة الاستيعابية:' : 'Total capacity:'}</span>
                <span className="font-bold text-slate-800">
                  {(Number(numClasses) * Number(classCapacity)).toLocaleString()}
                  {' '}{isAr ? 'طفل' : 'children'}
                </span>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleCapacityPlan}
              isLoading={isCalcing}
              className="w-full mt-1"
            >
              🏫 {isAr ? 'احسب خطة التوزيع المثلى' : 'Calculate Optimal Distribution Plan'}
            </Button>
          </Card>

          {/* ── Distribution calculator (existing, now secondary) ── */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
              <span className="text-xl">🧮</span>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {isAr ? 'حاسبة التوزيع اليدوي' : 'Manual Distribution Calculator'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isAr
                    ? 'أدخل أعداد الطلاب/الجلسات يدوياً لحساب الإيراد المتوقع.'
                    : 'Manually enter counts per service to compute projected revenue.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label={isAr ? 'الشهر المرجعي' : 'Reference Month'}
                value={calcMonth}
                options={monthOptions}
                onChange={(e) => setCalcMonth(e.target.value)}
              />
              <Select
                label={isAr ? 'السنة' : 'Year'}
                value={calcYear.toString()}
                options={yearOptions}
                onChange={(e) => setCalcYear(Number(e.target.value))}
              />
            </div>

            <Input
              label={isAr ? 'نسبة الربح المستهدفة %' : 'Target Profit %'}
              type="number" min="0" max="99"
              value={calcProfitPct}
              onChange={(e) => setCalcProfitPct(e.target.value)}
              placeholder={isAr ? 'مثال: 20' : 'e.g. 20'}
            />

            <div className="space-y-2">
              {Object.entries(calcCounts).map(([svc, val]) => (
                <Input
                  key={svc}
                  label={`${SERVICE_ICONS[svc] ?? ''} ${svc} — ${isAr ? 'العدد' : 'Count'}`}
                  type="number" min="0"
                  value={val}
                  onChange={(e) => setCalcCounts((p) => ({ ...p, [svc]: e.target.value }))}
                />
              ))}
            </div>

            <Button
              variant="secondary"
              onClick={handleCalc}
              isLoading={isCalcing}
              className="w-full mt-1"
            >
              🔢 {isAr ? 'احسب الإيراد المتوقع' : 'Calculate Projected Revenue'}
            </Button>
          </Card>
        </div>

        {/* RIGHT: Results panel */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <span className="text-2xl">📈</span>
            <h2 className="font-bold text-slate-800">
              {isAr ? 'نتائج الحاسبة' : 'Calculator Results'}
            </h2>
          </div>

          {/* ── Empty state ── */}
          {resultsMode === 'empty' && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <span className="text-6xl opacity-30">🧮</span>
              <p className="text-sm text-slate-400">
                {isAr
                  ? 'أدخل بيانات المركز أعلاه واضغط "احسب خطة التوزيع المثلى"'
                  : 'Fill in the centre capacity fields above and click Calculate'}
              </p>
            </div>
          )}

          {/* ── Distribution result (existing simple view) ── */}
          {resultsMode === 'distribution' && calcResult && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-slate-600">{isAr ? 'الإيراد المتوقع' : 'Projected Revenue'}</span>
                  <span className="text-emerald-600 font-mono">{fc(calcResult.projectedRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{isAr ? 'الهدف المطلوب (من المصروفات)' : 'Target Required (from costs)'}</span>
                  <span className="text-amber-600 font-mono">{fc(calcResult.targetRequired)}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{isAr ? 'نسبة التغطية' : 'Coverage %'}</span>
                    <span className={`font-bold ${calcResult.coveragePct >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {fpct(calcResult.coveragePct)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3" dir="ltr">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${calcResult.coveragePct >= 1 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(100, Math.round(calcResult.coveragePct * 100))}%` }}
                    />
                  </div>
                  <p className={`text-xs font-semibold ${calcResult.coveragePct >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {calcResult.coveragePct >= 1
                      ? (isAr ? '✅ هذا التوزيع يحقق الهدف' : '✅ This distribution meets the target!')
                      : (isAr ? '⚠️ الهدف لم يتحقق بهذا التوزيع' : '⚠️ Target not yet met with this distribution.')}
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <p className={`text-xs font-semibold text-slate-500 ${isAr ? '' : 'uppercase tracking-wide'}`}>
                  {isAr ? 'الوحدات المقترحة لتحقيق الهدف' : 'Suggested Units to Meet Target'}
                </p>
                {Object.entries(calcResult.unitsNeeded).map(([svc, count]) => (
                  <div key={svc} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{SERVICE_ICONS[svc]} {svc}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">@ {fc(calcResult.pricing[svc] ?? 0)}</span>
                      <Badge variant="info">{count} {isAr ? 'وحدة' : 'units'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Capacity plan result (new rich view) ── */}
          {resultsMode === 'capacity' && capacityPlan && (
            <div className="space-y-5">

              {/* Section A: Centre metrics */}
              <div>
                <p className={`text-xs font-bold text-slate-400 mb-3 ${isAr ? '' : 'uppercase tracking-widest'}`}>
                  {isAr ? 'ملخص طاقة المركز' : 'Centre Capacity Summary'}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile
                    label={isAr ? 'إجمالي الطاقة الاستيعابية' : 'Total Capacity'}
                    value={`${capacityPlan.totalCapacity.toLocaleString()} ${isAr ? 'طفل' : 'children'}`}
                    color="slate"
                  />
                  <MetricTile
                    label={isAr ? 'الإيراد المستهدف' : 'Revenue Goal'}
                    value={fc(capacityPlan.desiredRevenue)}
                    color="amber"
                  />
                  <MetricTile
                    label={isAr ? 'إيراد مطلوب لكل فصل' : 'Revenue per Classroom'}
                    value={fc(capacityPlan.metrics.revenuePerClass)}
                    color="blue"
                  />
                  <MetricTile
                    label={isAr ? 'إيراد مطلوب لكل موظف' : 'Revenue per Staff Member'}
                    value={fc(capacityPlan.metrics.revenuePerStaff)}
                    color="purple"
                  />
                  <MetricTile
                    label={isAr ? 'أطفال لكل موظف (طاقة كاملة)' : 'Children per Staff (full cap.)'}
                    value={`${capacityPlan.metrics.childrenPerStaff.toFixed(1)} ${isAr ? 'طفل/موظف' : 'children/staff'}`}
                    color="teal"
                  />
                </div>
              </div>

              {/* Section B: Per-service scenarios */}
              <div className="border-t border-slate-100 pt-4">
                <p className={`text-xs font-bold text-slate-400 mb-3 ${isAr ? '' : 'uppercase tracking-widest'}`}>
                  {isAr
                    ? 'كم طفل تحتاج لتحقيق هدفك (من كل خدمة بمفردها؟)'
                    : 'Children needed to hit goal (each service type alone)'}
                </p>
                <div className="space-y-3">
                  {Object.entries(capacityPlan.scenarios).map(([svc, sc]) => {
                    const overCapacity = sc.childrenNeeded > capacityPlan.totalCapacity
                    const pctUsed = capacityPlan.totalCapacity > 0
                      ? Math.min(1, sc.childrenNeeded / capacityPlan.totalCapacity)
                      : 0
                    return (
                      <div key={svc} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-800">
                            {SERVICE_ICONS[svc]} {svc}
                          </span>
                          <Badge variant={sc.feasible ? 'success' : 'danger'}>
                            {sc.feasible
                              ? (isAr ? '✅ ضمن الطاقة' : '✅ Within capacity')
                              : (isAr ? '❌ يتجاوز الطاقة' : '❌ Exceeds capacity')}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                          <div>
                            <span className="block text-slate-400">{isAr ? 'مطلوب' : 'Needed'}</span>
                            <span className="font-bold text-slate-800">
                              {sc.childrenNeeded.toLocaleString()} {isAr ? 'طفل' : 'children'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-slate-400">{isAr ? 'سعر الوحدة' : 'Unit price'}</span>
                            <span className="font-bold text-slate-800">{fc(capacityPlan.pricing[svc] ?? 0)}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400">{isAr ? 'أقصى إيراد (طاقة كاملة)' : 'Max revenue (full cap.)'}</span>
                            <span className="font-bold text-emerald-700">{fc(sc.maxRevenue)}</span>
                          </div>
                        </div>
                        {/* Utilisation bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1 text-slate-400">
                            <span>{isAr ? 'استغلال الطاقة' : 'Capacity utilisation'}</span>
                            <span className={overCapacity ? 'text-red-500 font-bold' : 'text-slate-600'}>
                              {fpct(pctUsed)}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2" dir="ltr">
                            <div
                              className={`h-2 rounded-full ${sc.feasible ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(100, Math.round(pctUsed * 100))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Section C: Recommended mix */}
              <div className="border-t border-slate-100 pt-4">
                <p className={`text-xs font-bold text-slate-400 mb-3 ${isAr ? '' : 'uppercase tracking-widest'}`}>
                  {isAr ? '🏆 التوزيع المقترح (50٪ حضانة · 30٪ استضافة · 20٪ جلسات)' : '🏆 Recommended Mix (50% nursery · 30% hosting · 20% sessions)'}
                </p>
                <div className="space-y-2">
                  {Object.entries(capacityPlan.recommendedMix).map(([svc, count]) => {
                    const price = capacityPlan.pricing[svc] ?? 0
                    const revenue = count * price
                    return (
                      <div key={svc} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-slate-700">{SERVICE_ICONS[svc]} {svc}</span>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-slate-400">
                            {count} × {fc(price)}
                          </span>
                          <span className="font-bold font-mono text-emerald-700">{fc(revenue)}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Total vs goal */}
                  <div className="border-t border-slate-200 pt-3 mt-1">
                    <div className="flex justify-between font-bold text-sm">
                      <span className="text-slate-700">{isAr ? 'الإيراد المتوقع بالتوزيع المقترح' : 'Projected revenue (recommended mix)'}</span>
                      <span className="text-emerald-600 font-mono">{fc(capacityPlan.recommendedRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-slate-500">{isAr ? 'هدفك الشهري' : 'Your monthly goal'}</span>
                      <span className="text-amber-600 font-mono">{fc(capacityPlan.desiredRevenue)}</span>
                    </div>

                    {/* Gap / surplus */}
                    {capacityPlan.metrics.revenueGap > 0 ? (
                      <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
                        <p className="text-sm font-semibold text-red-700">
                          ⚠️ {isAr ? 'فجوة في الإيراد:' : 'Revenue gap:'}{' '}
                          <span className="font-mono">{fc(capacityPlan.metrics.revenueGap)}</span>
                        </p>
                        <p className="text-xs text-red-500 mt-1">
                          {isAr
                            ? 'الطاقة الاستيعابية الحالية لا تكفي لتحقيق هدفك برفع الأسعار أو زيادة الطاقة.'
                            : 'The current capacity cannot reach your goal — consider raising prices or expanding capacity.'}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
                        <p className="text-sm font-semibold text-emerald-700">
                          ✅ {isAr
                            ? `طاقتك تفوق الهدف بمقدار ${fc(capacityPlan.recommendedRevenue - capacityPlan.desiredRevenue)}`
                            : `Capacity exceeds goal by ${fc(capacityPlan.recommendedRevenue - capacityPlan.desiredRevenue)}`}
                        </p>
                        <p className="text-xs text-emerald-600 mt-1">
                          {isAr
                            ? 'يمكنك تحقيق الهدف دون ملء الطاقة الكاملة.'
                            : 'You can reach your goal without filling every spot.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ── tiny helper component ──────────────────────────────────────────────────

function MetricTile({ label, value, color }: { label: string; value: string; color: string }) {
  const bg: Record<string, string> = {
    slate:  'bg-slate-50  border-slate-200  text-slate-800',
    amber:  'bg-amber-50  border-amber-200  text-amber-800',
    blue:   'bg-blue-50   border-blue-200   text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    teal:   'bg-teal-50   border-teal-200   text-teal-800',
  }
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bg[color] ?? bg.slate}`}>
      <p className="text-xs opacity-70 leading-tight">{label}</p>
      <p className="font-bold text-sm mt-0.5 font-mono">{value}</p>
    </div>
  )
}
