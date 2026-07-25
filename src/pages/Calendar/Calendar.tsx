import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCalendarStore } from '../../store/useCalendarStore.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'

export default function Calendar() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()
  const {
    year, month, entries, selectedDate, dayEntries, isLoading, error,
    setMonth, fetchMonth, selectDay, clearSelection,
  } = useCalendarStore()

  useEffect(() => {
    fetchMonth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  // Auto-select today on first load so the drill-down is visible without an extra click.
  useEffect(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    selectDay(todayIso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entriesByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.date, (map.get(e.date) || 0) + 1)
    return map
  }, [entries])

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()

  const goPrevMonth = () => setMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
  const goNextMonth = () => setMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'التقويم' : 'Calendar'}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={goPrevMonth}>{isAr ? 'السابق' : 'Prev'}</Button>
          <span className="font-medium">{year}-{String(month).padStart(2, '0')}</span>
          <Button variant="outline" onClick={goNextMonth}>{isAr ? 'التالي' : 'Next'}</Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const count = entriesByDay.get(iso) || 0
          return (
            <button
              key={iso}
              onClick={() => selectDay(iso)}
              className={`aspect-square rounded-lg border p-2 text-start text-sm flex flex-col justify-between hover:border-blue-400 ${selectedDate === iso ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
            >
              <span className="font-medium">{day}</span>
              {count > 0 && <span className="text-xs text-blue-600">{count}</span>}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <Card
          title={`${isAr ? 'جدول يوم' : 'Schedule for'} ${selectedDate}`}
          headerAction={<Button variant="ghost" size="sm" onClick={clearSelection}>{isAr ? 'إغلاق' : 'Close'}</Button>}
        >
          {isLoading ? (
            <p className="p-4 text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
          ) : dayEntries.length === 0 ? (
            <p className="p-4 text-slate-500">{isAr ? 'لا يوجد مواعيد في هذا اليوم' : 'Nothing scheduled this day'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {dayEntries.map((e, i) => (
                <li
                  key={i}
                  onClick={() => e.session_id && navigate(`/sessions?session=${e.session_id}`)}
                  className={`px-4 py-3 flex items-center justify-between text-sm ${e.session_id ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  title={e.session_id ? (isAr ? 'فتح كشف الحضور' : 'Open attendance sheet') : undefined}
                >
                  <span className="font-medium text-slate-800">{e.user_name}</span>
                  <span className="text-slate-600">{e.service_name || '-'}</span>
                  <span className="text-slate-500">{e.teacher_name || (isAr ? 'بدون معلم' : 'No teacher')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
