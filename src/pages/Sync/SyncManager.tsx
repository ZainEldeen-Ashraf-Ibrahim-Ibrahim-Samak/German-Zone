import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '../../store/useSyncStore.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import { Input } from '../../components/ui/Input.js'
import { ProgressBar } from '../../components/ui/ProgressBar.js'
import { useProgress } from '../../hooks/useProgress.js'

const getEntityName = (entity: string, isAr: boolean) => {
  const map: Record<string, { ar: string; en: string }> = {
    children: { ar: 'الأطفال', en: 'Children' },
    child_services: { ar: 'خدمات الأطفال', en: 'Child Services' },
    payments: { ar: 'دفعات الأطفال', en: 'Children Payments' },
    employees: { ar: 'الموظفين', en: 'Employees' },
    salary_payments: { ar: 'الرواتب', en: 'Salary Payments' },
    expenses: { ar: 'المصروفات', en: 'Expenses' },
    imported_snapshots: { ar: 'النسخ المستوردة', en: 'Imported Snapshots' },
    tombstones: { ar: 'السجلات المحذوفة', en: 'Deleted Records' },
    scheduled_sessions: { ar: 'الجلسات المجدولة', en: 'Scheduled Sessions' },
    session_teachers: { ar: 'معلمي الجلسات', en: 'Session Teachers' },
    attendance_records: { ar: 'سجلات الحضور', en: 'Attendance Records' },
    attendance_conflicts: { ar: 'تعارضات الحضور', en: 'Attendance Conflicts' },
    employee_deductions: { ar: 'خصومات الموظفين', en: 'Employee Deductions' },
    payment_transactions: { ar: 'حركات الدفع', en: 'Payment Transactions' },
    service_teachers: { ar: 'معلمي الخدمات', en: 'Service Teachers' },
    teacher_payments: { ar: 'دفعات المعلمين', en: 'Teacher Payments' },
    settings: { ar: 'الإعدادات', en: 'Settings' }
  }
  return map[entity] ? (isAr ? map[entity].ar : map[entity].en) : entity
}

export default function SyncManager() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const {
    status,
    isConnecting,
    isPushing,
    isPulling,
    isLoading,
    lastPushResults,
    lastPullResults,
    error,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    fetchStatus,
    connect,
    disconnect,
    push,
    pull,
    setAutoSync,
    clearError
  } = useSyncStore()

  const [mongoUri, setMongoUri] = useState('')
  const [autoInterval, setAutoInterval] = useState('30')
  const { get: getProgress, reset: resetProgress } = useProgress()

  const handlePush = () => { resetProgress('push'); push() }
  const handlePull = () => { resetProgress('pull'); pull() }

  useEffect(() => {
    fetchStatus()
  }, [])

  // Reflect the persisted interval instead of the hardcoded default, so the
  // field shows the saved value after a restart or when returning to this page.
  useEffect(() => {
    setAutoInterval(String(autoSyncIntervalMinutes))
  }, [autoSyncIntervalMinutes])

  const handleConnect = async () => {
    if (!mongoUri.trim()) return
    await connect(mongoUri.trim())
  }

  const handleToggleAutoSync = async () => {
    await setAutoSync(!autoSyncEnabled, Number(autoInterval) || 30)
  }

  // Applying while enabled restarts the timer with the new interval and
  // persists it — otherwise the edit only takes effect after Stop/Start.
  const handleIntervalCommit = async () => {
    const minutes = Number(autoInterval)
    if (!autoSyncEnabled || !Number.isFinite(minutes) || minutes < 1) return
    if (minutes === autoSyncIntervalMinutes) return
    await setAutoSync(true, minutes)
  }

  // Auto-save shortly after typing stops, so no Enter/blur is required.
  useEffect(() => {
    const timer = setTimeout(() => { void handleIntervalCommit() }, 800)
    return () => clearTimeout(timer)
  }, [autoInterval])

  const isConnected = status?.connected ?? false

  const totalPending = status
    ? Object.values(status.pending).reduce((s, n) => s + n, 0)
    : 0

  const formatResults = (results: Record<string, any> | null, mode: 'push' | 'pull') => {
    if (!results) return null
    return Object.entries(results).map(([entity, stats]) => ({
      entity,
      count: mode === 'push' ? stats.pushed ?? 0 : stats.pulled ?? 0,
      merged: stats.merged ?? 0,
      failed: stats.failed ?? 0,
      skipped: stats.skipped ?? 0,
      errors: (stats.errors ?? []) as { recordId: string; message: string }[],
      skipReasons: (stats.skipReasons ?? []) as { recordId: string; message: string }[]
    }))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'المزامنة السحابية' : 'Cloud Synchronization'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAr
            ? 'مزامنة البيانات مع قاعدة بيانات MongoDB السحابية. يتطلب صلاحيات المسؤول.'
            : 'Sync data with MongoDB cloud database. Requires administrator access.'}
        </p>
      </div>

      {error && (
        <Alert variant="danger" title={isAr ? 'خطأ في المزامنة' : 'Sync Error'} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Connection Status */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-md shadow-emerald-200' : 'bg-slate-300'}`} />
            <h2 className="font-bold text-slate-800">
              {isAr ? 'حالة الاتصال' : 'Connection Status'}
            </h2>
            <Badge variant={isConnected ? 'success' : 'neutral'}>
              {isConnected ? (isAr ? 'متصل' : 'Connected') : (isAr ? 'غير متصل' : 'Disconnected')}
            </Badge>
          </div>

          {isConnected && (
            <Button variant="outline" onClick={disconnect}>
              🔌 {isAr ? 'قطع الاتصال' : 'Disconnect'}
            </Button>
          )}
        </div>

        {status?.lastSync && (
          <div className="text-xs text-slate-400">
            {isAr ? 'آخر مزامنة:' : 'Last sync:'}{' '}
            <span className="font-mono">{new Date(status.lastSync.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>
            {' '}—{' '}
            <Badge variant={status.lastSync.status === 'success' ? 'success' : 'danger'}>
              {status.lastSync.action} / {status.lastSync.status}
            </Badge>
          </div>
        )}

        {!isConnected && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-sm text-slate-600 font-medium">
              {isAr ? 'أدخل رابط الاتصال بـ MongoDB:' : 'Enter MongoDB connection URI:'}
            </p>
            <div className="flex gap-3">
              <Input
                label=""
                type="password"
                value={mongoUri}
                onChange={(e) => setMongoUri(e.target.value)}
                placeholder="mongodb+srv://user:pass@cluster.mongodb.net/nursery"
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={handleConnect}
                isLoading={isConnecting}
                disabled={!mongoUri.trim()}
              >
                🔗 {isAr ? 'اتصل' : 'Connect'}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'مثال: mongodb+srv://user:password@cluster0.mongodb.net/nursery_db'
                : 'Example: mongodb+srv://user:password@cluster0.mongodb.net/nursery_db'}
            </p>
          </div>
        )}
      </Card>

      {/* Pending Records */}
      {status && totalPending > 0 && (
        <Alert variant="warning" title={isAr ? `${totalPending} سجل بانتظار المزامنة` : `${totalPending} records pending sync`}>
          {isAr
            ? 'توجد سجلات محلية لم تُرفع بعد إلى السحابة. اضغط "رفع" لمزامنتها.'
            : 'There are local records not yet synced to the cloud. Press "Push" to sync them.'}
        </Alert>
      )}

      {/* Push/Pull Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⬆️</span>
            <div>
              <h2 className="font-bold text-slate-800">{isAr ? 'رفع (Push)' : 'Push to Cloud'}</h2>
              <p className="text-xs text-slate-400">
                {isAr ? 'يرفع السجلات المحلية غير المزامنة إلى MongoDB.' : 'Uploads unsynced local records to MongoDB.'}
              </p>
            </div>
          </div>

          {status && (
            <div className="text-sm space-y-1">
              {Object.entries(status.pending).map(([entity, count]) => (
                <div key={entity} className="flex justify-between text-slate-600">
                  <span>{getEntityName(entity, isAr)}</span>
                  <Badge variant={count > 0 ? 'warning' : 'success'}>
                    {count > 0 ? `${count} ${isAr ? 'قيد الانتظار' : 'pending'}` : `✅ ${isAr ? 'مُتزامن' : 'synced'}`}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="primary"
            onClick={handlePush}
            isLoading={isPushing}
            disabled={!isConnected}
            className="w-full"
          >
            ⬆️ {isAr ? 'رفع البيانات' : 'Push Data'}
          </Button>

          {isPushing && (() => {
            const p = getProgress('push')
            return (
              <ProgressBar
                percent={p.percent}
                label={isAr ? 'جارٍ الرفع...' : 'Pushing...'}
                detail={p.total > 0 ? `${p.current}/${p.total}` : undefined}
              />
            )
          })()}

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ {isAr
                ? 'استخدم "رفع إجباري" إذا قمت بتغيير قاعدة البيانات السحابية وتريد إجبار جميع بياناتك المحلية على الرفع من جديد حتى لو كانت تعتبر مزامنة مسبقاً.'
                : 'Use "Force Push" if you changed your cloud database and need to force upload all local data again, even if it is already marked as synced.'}
            </p>
            <Button
              variant="danger"
              onClick={() => { resetProgress('push'); push(true) }}
              isLoading={isPushing}
              disabled={!isConnected}
              className="w-full"
            >
              ⚠️ {isAr ? 'رفع إجباري (رفع كل السجلات)' : 'Force Push (upload all records)'}
            </Button>
          </div>

          {lastPushResults && (
            <div className="bg-emerald-50 rounded-xl p-3 space-y-1 text-xs">
              <p className="font-bold text-emerald-700">✅ {isAr ? 'نتائج الرفع:' : 'Push Results:'}</p>
              {formatResults(lastPushResults, 'push')?.map(({ entity, count, failed }) => (
                <div key={entity} className="flex justify-between text-slate-600">
                  <span>{getEntityName(entity, isAr)}</span>
                  <span>
                    <span className="text-emerald-600 font-semibold">↑ {count}</span>
                    {failed > 0 && <span className="text-red-500"> ({failed} {isAr ? 'فشلت' : 'failed'})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⬇️</span>
            <div>
              <h2 className="font-bold text-slate-800">{isAr ? 'سحب (Pull)' : 'Pull from Cloud'}</h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'يجلب السجلات الأحدث من MongoDB ويطبق استراتيجية حل التعارض (الأحدث يفوز).'
                  : 'Fetches newer records from MongoDB. Conflict strategy: most recent wins.'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">{isAr ? 'استراتيجية حل التعارض:' : 'Conflict Strategy:'}</p>
            <p>⏱️ {isAr ? 'الأحدث updated_at يفوز' : 'Most recent updated_at wins'}</p>
            <p>🔢 {isAr ? 'تعادل: id الأعلى يفوز' : 'Tie-break: higher id wins'}</p>
          </div>

          <Button
            variant="outline"
            onClick={handlePull}
            isLoading={isPulling}
            disabled={!isConnected}
            className="w-full"
          >
            ⬇️ {isAr ? 'سحب البيانات' : 'Pull Data'}
          </Button>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ {isAr
                ? 'السجلات المتعارضة الآن تُدمج تلقائياً بدلاً من تخطيها: أي حقل فارغ محلياً يُملأ من السحابة، وتبقى قيم جهازك المحلي كما هي فيما عداه. إذا أردت استبدال بيانات هذا الجهاز بالكامل ببيانات السحابة (وليس فقط دمج الفراغات)، استخدم "سحب إجباري" أدناه.'
                : 'Conflicting records are now merged automatically instead of being skipped: any field empty locally gets filled in from the cloud, while this device\'s own values are kept everywhere else. If you want to fully replace this device\'s data with the cloud version (not just fill gaps), use "Force Pull" below.'}
            </p>
            <Button
              variant="danger"
              onClick={() => { resetProgress('pull'); pull(true) }}
              isLoading={isPulling}
              disabled={!isConnected}
              className="w-full"
            >
              ⚠️ {isAr ? 'سحب إجباري (استبدال المحلي بالسحابة)' : 'Force Pull (overwrite local with cloud)'}
            </Button>
          </div>

          {isPulling && (() => {
            const p = getProgress('pull')
            return (
              <ProgressBar
                percent={p.percent}
                label={isAr ? 'جارٍ السحب...' : 'Pulling...'}
                detail={p.total > 0 ? `${p.current}/${p.total}` : undefined}
              />
            )
          })()}

          {lastPullResults && (
            <div className="bg-blue-50 rounded-xl p-3 space-y-1 text-xs">
              <p className="font-bold text-blue-700">✅ {isAr ? 'نتائج السحب:' : 'Pull Results:'}</p>
              {formatResults(lastPullResults, 'pull')?.map(({ entity, count, merged, failed, skipped, errors, skipReasons }) => (
                <div key={entity} className="space-y-0.5">
                  <div className="flex justify-between text-slate-600">
                    <span>{getEntityName(entity, isAr)}</span>
                    <span>
                      <span className="text-blue-600 font-semibold">↓ {count}</span>
                      {merged > 0 && <span className="text-emerald-600"> ({merged} {isAr ? 'تم دمجها' : 'merged'})</span>}
                      {skipped > 0 && <span className="text-slate-400"> ({skipped} {isAr ? 'تم تخطيها' : 'skipped'})</span>}
                      {failed > 0 && <span className="text-red-500"> ({failed} {isAr ? 'فشلت' : 'failed'})</span>}
                    </span>
                  </div>
                  {errors.length > 0 && (
                    <ul className="ltr:pl-3 rtl:pr-3 space-y-0.5 text-[11px] text-red-500 ltr:text-left rtl:text-right">
                      {errors.map((e, i) => (
                        <li key={i} className="font-mono break-all">
                          [{e.recordId}] {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {skipReasons.length > 0 && (
                    <details className="ltr:pl-3 rtl:pr-3">
                      <summary className="text-[11px] text-slate-500 cursor-pointer">
                        {isAr ? `تفاصيل الدمج (${skipReasons.length})` : `Merge details (${skipReasons.length})`}
                      </summary>
                      <ul className="space-y-0.5 text-[11px] text-slate-500 ltr:text-left rtl:text-right mt-1">
                        {skipReasons.map((s, i) => (
                          <li key={i} className="font-mono break-all">
                            [{s.recordId}] {s.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Auto-Sync (T090) */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⏰</span>
          <div>
            <h2 className="font-bold text-slate-800">{isAr ? 'المزامنة التلقائية' : 'Auto-Sync'}</h2>
            <p className="text-xs text-slate-400">
              {isAr ? 'تشغيل المزامنة تلقائياً على فترات منتظمة.' : 'Automatically push unsynced records on a regular interval.'}
            </p>
          </div>
          <Badge variant={autoSyncEnabled ? 'success' : 'neutral'}>
            {autoSyncEnabled ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'موقف' : 'Off')}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <Input
            label={isAr ? 'الفترة (دقيقة)' : 'Interval (minutes)'}
            type="number"
            min="1"
            max="1440"
            value={autoInterval}
            onChange={(e) => setAutoInterval(e.target.value)}
            onBlur={handleIntervalCommit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleIntervalCommit() }}
            className="w-32"
          />
          <Button
            variant={autoSyncEnabled ? 'outline' : 'primary'}
            onClick={handleToggleAutoSync}
            disabled={!isConnected && !autoSyncEnabled}
          >
            {autoSyncEnabled
              ? (isAr ? '⏹ إيقاف' : '⏹ Stop Auto-Sync')
              : (isAr ? '▶ تشغيل' : '▶ Start Auto-Sync')}
          </Button>
        </div>
      </Card>

      {/* Refresh Status */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={fetchStatus} isLoading={isLoading}>
          🔄 {isAr ? 'تحديث الحالة' : 'Refresh Status'}
        </Button>
      </div>
    </div>
  )
}