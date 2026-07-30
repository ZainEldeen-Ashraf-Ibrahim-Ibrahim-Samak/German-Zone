import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionTimersStore } from '../../store/useSessionTimersStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { Button } from '../ui/Button.js'
import { Select } from '../ui/Select.js'
import { Alert } from '../ui/Alert.js'
import { Badge } from '../ui/Badge.js'
import type { SessionTimeLog } from '../../types/index.js'

/** "1h 25m" / "0h 07m" — the elapsed form used everywhere in this panel. */
function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

interface Props {
  /** Session the clocked time is attributed to. */
  sessionId: number
  sessionDate?: string
}

/**
 * Start/stop timer for hourly-paid employees on one session. Starting records the instant the
 * session began for that person; stopping freezes the elapsed time, prices it at their hourly
 * rate and adds it to their salary for the month.
 */
export default function SessionTimerPanel({ sessionId, sessionDate }: Props) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'

  const {
    logs, running, hourlyEmployees, error,
    fetchLogs, fetchRunning, fetchHourlyEmployees, startTimer, stopTimer, voidLog, clearError,
  } = useSessionTimersStore()

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | ''>('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  // Ticks once a second purely so running timers show live elapsed time.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    fetchHourlyEmployees()
    fetchRunning()
    fetchLogs({ session_id: sessionId })
  }, [sessionId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const fmtMoney = (n: number | null | undefined) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP' }).format(n || 0)

  // Running timers belong to the employee, not the session, so a stint started elsewhere is
  // still shown here — otherwise it would look startable twice.
  const runningByEmployee = useMemo(() => {
    const map = new Map<number, SessionTimeLog>()
    for (const log of running) map.set(log.employee_id, log)
    return map
  }, [running])

  const sessionLogs = logs.filter((l) => l.session_id === sessionId)
  const completedTotal = sessionLogs
    .filter((l) => l.status === 'completed')
    .reduce((sum, l) => sum + (l.amount ?? 0), 0)

  const availableEmployees = hourlyEmployees.filter((e) => !runningByEmployee.has(e.id))

  const handleStart = async () => {
    if (!selectedEmployeeId) return
    setIsStarting(true)
    const result = await startTimer(Number(selectedEmployeeId), sessionId)
    setIsStarting(false)
    if (result) {
      setSelectedEmployeeId('')
      fetchLogs({ session_id: sessionId })
    }
  }

  const handleStop = async (log: SessionTimeLog) => {
    setBusyId(log.id)
    await stopTimer(log.id)
    setBusyId(null)
    fetchLogs({ session_id: sessionId })
  }

  const handleVoid = async (log: SessionTimeLog) => {
    setBusyId(log.id)
    await voidLog(log.id)
    setBusyId(null)
    fetchLogs({ session_id: sessionId })
  }

  const elapsedOf = (log: SessionTimeLog) => (now - new Date(log.started_at).getTime()) / 60000

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      <p className="text-xs text-slate-400">
        {isAr
          ? '⏱ ابدأ المؤقت عند بدء الحصة وأوقفه عند انتهائها — يُحسب إجمالي الوقت × سعر الساعة ويُضاف إلى راتب الموظف تلقائياً.'
          : '⏱ Start the timer when the session begins and stop it at the end — the total time × the hourly rate is added to the employee\'s salary automatically.'}
      </p>

      {hourlyEmployees.length === 0 ? (
        <p className="text-sm text-slate-400">
          {isAr
            ? 'لا يوجد موظفون بنظام الأجر بالساعة. عيّن نوع راتب «بالساعة» من الإعدادات أولاً.'
            : 'No hourly-paid employees. Assign an "Hourly" salary type in Settings first.'}
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{isAr ? 'الموظف' : 'Employee'}</label>
            <Select
              value={String(selectedEmployeeId)}
              onChange={(e) => setSelectedEmployeeId(e.target.value ? Number(e.target.value) : '')}
              options={[
                { value: '', label: isAr ? '— اختر موظفاً —' : '— Select employee —' },
                ...availableEmployees.map((e) => ({
                  value: String(e.id),
                  label: e.effective_hourly_rate != null
                    ? `${e.name} — ${e.effective_hourly_rate} EGP/${isAr ? 'ساعة' : 'hr'}`
                    : `${e.name} — ${isAr ? '⚠️ بدون سعر ساعة' : '⚠️ no hourly rate'}`,
                })),
              ]}
            />
          </div>
          <Button variant="primary" onClick={handleStart} isLoading={isStarting} disabled={!selectedEmployeeId}>
            {isAr ? '▶ بدء المؤقت' : '▶ Start Timer'}
          </Button>
        </div>
      )}

      {/* Currently running */}
      {running.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">{isAr ? 'قيد التشغيل' : 'Running now'}</p>
          {running.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-emerald-800">{log.employee_name}</p>
                <p className="text-xs text-emerald-600">
                  {isAr ? 'بدأ' : 'Started'} {new Date(log.started_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US')}
                  {log.session_id !== sessionId && (
                    <span className="ms-2 text-amber-600">
                      {isAr ? '(جلسة أخرى)' : '(another session)'}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-emerald-700">{formatMinutes(elapsedOf(log))}</span>
                <Button variant="danger" size="sm" onClick={() => handleStop(log)} isLoading={busyId === log.id}>
                  {isAr ? '■ إيقاف' : '■ Stop'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logged stints for this session */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">
            {isAr ? 'الأوقات المسجلة لهذه الجلسة' : 'Logged time for this session'}
            {sessionDate && <span className="text-xs text-slate-400 ms-2">{sessionDate}</span>}
          </p>
          {completedTotal > 0 && (
            <span className="text-sm font-bold text-primary">{fmtMoney(completedTotal)}</span>
          )}
        </div>
        {sessionLogs.length === 0 ? (
          <p className="text-sm text-slate-400">{isAr ? 'لا توجد أوقات مسجلة بعد.' : 'No time logged yet.'}</p>
        ) : (
          <div className="space-y-1.5">
            {sessionLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-slate-800">{log.employee_name}</p>
                  <p className="text-xs text-slate-400">
                    {log.status === 'running'
                      ? (isAr ? 'قيد التشغيل' : 'Running')
                      : `${formatMinutes(log.duration_minutes ?? 0)} × ${log.hourly_rate ?? 0} EGP/${isAr ? 'ساعة' : 'hr'}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {log.status === 'void'
                    ? <Badge variant="neutral">{isAr ? 'ملغى' : 'Void'}</Badge>
                    : <span className="font-mono text-sm text-slate-700">{fmtMoney(log.amount)}</span>}
                  {isAdmin && log.status === 'completed' && (
                    <Button variant="ghost" size="sm" onClick={() => handleVoid(log)} isLoading={busyId === log.id}>
                      {isAr ? 'إلغاء' : 'Void'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
