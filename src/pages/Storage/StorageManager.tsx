import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import { Modal } from '../../components/ui/Modal.js'
import { ProgressBar } from '../../components/ui/ProgressBar.js'
import { useProgress } from '../../hooks/useProgress.js'

interface StorageStats {
  counts: {
    users: number
    children: number
    payments: number
    employees: number
    salary_payments: number
    expenses: number
  }
  sizeBytes: number
}

interface AuditRow {
  id: number
  action: string
  entity_type: string
  record_id: string
  status: string
  error: string | null
  created_at: string
}

interface ImportSummary {
  children: { imported: number; skipped: number }
  payments: { imported: number; skipped: number }
  employees: { imported: number; skipped: number }
  salaryPayments: { imported: number; skipped: number }
  expenses: { imported: number; skipped: number }
  settings: { imported: number; skipped: number }
  snapshots: { imported: number; skipped: number }
  sheetsProcessed: string[]
  sheetsIgnored: string[]
  year: number
  rowErrors: number
  rowErrorDetails?: { sheet: string; row: number; name: string; message: string }[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function StorageManager() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [stats, setStats] = useState<StorageStats | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Action states
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const { get: getProgress, reset: resetProgress } = useProgress()

  const loadStats = async () => {
    setIsLoading(true)
    try {
      const result = await window.api.storage.stats()
      setStats(result)
      const rows = await window.api.storage.audit()
      setAudit(rows || [])
    } catch (err: any) {
      let msg = err.message || 'Failed to load storage stats'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  const handleBackup = async () => {
    setIsBackingUp(true)
    resetProgress('backup')
    setError(null)
    try {
      const result = await window.api.storage.backup()
      setSuccess(isAr
        ? `تم إنشاء نسخة احتياطية بنجاح: ${result.path}`
        : `Backup created successfully: ${result.path}`)
    } catch (err: any) {
      let msg = err.message || 'Backup failed'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      if (!msg.includes('cancelled')) setError(msg)
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleRestore = async () => {
    setIsRestoring(true)
    resetProgress('restore')
    setError(null)
    try {
      await window.api.storage.restore({})
      setSuccess(isAr ? 'تم استعادة قاعدة البيانات بنجاح. يُنصح بإعادة تشغيل التطبيق.' : 'Database restored successfully. Please restart the app.')
      await loadStats()
    } catch (err: any) {
      let msg = err.message || 'Restore failed'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      if (!msg.includes('cancelled')) setError(msg)
    } finally {
      setIsRestoring(false)
    }
  }

  const handleImport = async () => {
    setIsImporting(true)
    resetProgress('import')
    setError(null)
    setImportResult(null)
    try {
      const result = await window.api.storage.import({})
      setImportResult(result.imported)
      await loadStats()
    } catch (err: any) {
      let msg = err.message || 'Import failed'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      if (!msg.includes('cancelled')) setError(msg)
    } finally {
      setIsImporting(false)
    }
  }

  const handleClear = async () => {
    setIsClearing(true)
    setError(null)
    try {
      await window.api.storage.clear({ confirm: true })
      setShowClearConfirm(false)
      setSuccess(isAr ? 'تم مسح جميع البيانات بنجاح.' : 'All data has been cleared.')
      await loadStats()
    } catch (err: any) {
      let msg = err.message || 'Clear failed'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setError(msg)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'إدارة التخزين والنسخ الاحتياطي' : 'Storage & Backup Management'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAr
            ? 'مراقبة قاعدة البيانات، النسخ الاحتياطي، الاستعادة، استيراد البيانات ومسح الإدخالات.'
            : 'Monitor your database, create backups, restore from backup, import data, and clear records.'}
        </p>
      </div>

      {success && (
        <Alert variant="success" title={isAr ? 'تمت العملية' : 'Success'} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" title={isAr ? 'خطأ' : 'Error'} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* DB Stats */}
      {stats && (
        <Card className="p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-5">
            📊 {isAr ? 'إحصائيات قاعدة البيانات' : 'Database Statistics'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: isAr ? 'الأطفال' : 'Children', count: stats.counts.children, icon: '👶' },
              { label: isAr ? 'الدفعات' : 'Payments', count: stats.counts.payments, icon: '💳' },
              { label: isAr ? 'الموظفون' : 'Employees', count: stats.counts.employees, icon: '👔' },
              { label: isAr ? 'دفعات الرواتب' : 'Salary Payments', count: stats.counts.salary_payments, icon: '💵' },
              { label: isAr ? 'المصروفات' : 'Expenses', count: stats.counts.expenses, icon: '💸' },
              { label: isAr ? 'المستخدمون' : 'Users', count: stats.counts.users, icon: '👤' },
              {
                label: isAr ? 'حجم قاعدة البيانات' : 'DB Size',
                count: null,
                text: formatBytes(stats.sizeBytes),
                icon: '💾'
              }
            ].map(({ label, count, text, icon }) => (
              <div key={label} className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="text-xl font-bold text-slate-800 font-mono">
                  {count !== null && count !== undefined ? count : text}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💾</span>
            <div>
              <h2 className="font-bold text-slate-800">{isAr ? 'نسخة احتياطية' : 'Backup Database'}</h2>
              <p className="text-xs text-slate-400">
                {isAr ? 'يحفظ نسخة من قاعدة البيانات على جهازك.' : 'Saves a copy of your database to your device.'}
              </p>
            </div>
          </div>
          <Button variant="primary" onClick={handleBackup} isLoading={isBackingUp} className="w-full">
            📥 {isAr ? 'حفظ نسخة احتياطية...' : 'Create Backup...'}
          </Button>
          {isBackingUp && (
            <ProgressBar percent={getProgress('backup').percent} label={isAr ? 'جارٍ النسخ الاحتياطي...' : 'Backing up...'} />
          )}
        </Card>

        {/* Restore */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📤</span>
            <div>
              <h2 className="font-bold text-slate-800">{isAr ? 'استعادة النسخة الاحتياطية' : 'Restore Backup'}</h2>
              <p className="text-xs text-slate-400">
                {isAr ? 'يستعيد قاعدة البيانات من ملف نسخة احتياطية سابقة.' : 'Restores the database from a previous backup file.'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleRestore} isLoading={isRestoring} className="w-full">
            🔄 {isAr ? 'استعادة من نسخة...' : 'Restore from Backup...'}
          </Button>
          {isRestoring && (
            <ProgressBar percent={getProgress('restore').percent} label={isAr ? 'جارٍ الاستعادة...' : 'Restoring...'} />
          )}
        </Card>

        {/* Import */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📂</span>
            <div>
              <h2 className="font-bold text-slate-800">{isAr ? 'استيراد بيانات Excel' : 'Import from Excel'}</h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'يستورد البيانات من دفتر العمل الأصلي بصيغة .xlsx بدون تكرار.'
                  : 'Imports data from the original .xlsx workbook without duplicates.'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleImport} isLoading={isImporting} className="w-full">
            📊 {isAr ? 'استيراد من Excel...' : 'Import from Excel...'}
          </Button>
          {isImporting && (() => {
            const p = getProgress('import')
            return (
              <ProgressBar
                percent={p.percent}
                label={isAr ? 'جارٍ استيراد الأوراق...' : 'Importing sheets...'}
                detail={p.total > 0 ? `${p.current}/${p.total}` : undefined}
              />
            )
          })()}

          {importResult && (
            <div className="bg-emerald-50 rounded-xl p-3 space-y-1.5 text-xs">
              <p className="font-bold text-emerald-700">
                {isAr ? '✅ نتائج الاستيراد' : '✅ Import Results'}
                <span className="text-slate-400 font-normal"> — {isAr ? 'سنة' : 'year'} {importResult.year}</span>
              </p>
              {[
                ['children', isAr ? 'أطفال' : 'children'],
                ['payments', isAr ? 'دفعات' : 'payments'],
                ['employees', isAr ? 'موظفون' : 'employees'],
                ['salaryPayments', isAr ? 'رواتب' : 'salary payments'],
                ['expenses', isAr ? 'مصروفات' : 'expenses'],
                ['settings', isAr ? 'الإعدادات' : 'settings'],
                ['snapshots', isAr ? 'لقطات (داشبورد/كشف حساب)' : 'snapshots (dashboard/statement)'],
              ].map(([key, label]) => {
                const stat = importResult[key as keyof ImportSummary] as { imported: number; skipped: number }
                if (!stat || typeof stat !== 'object') return null
                return (
                  <div key={key} className="flex justify-between text-slate-600">
                    <span>{label}</span>
                    <span>
                      <span className="text-emerald-600 font-semibold">+{stat.imported}</span>
                      {stat.skipped > 0 && <span className="text-slate-400"> ({stat.skipped} {isAr ? 'تخطّي' : 'skipped'})</span>}
                    </span>
                  </div>
                )
              })}
              {importResult.rowErrors > 0 && (
                <div className="flex justify-between text-amber-600 pt-1 border-t border-emerald-100">
                  <span>{isAr ? 'صفوف متجاهَلة' : 'rows skipped (errors)'}</span>
                  <span className="font-semibold">{importResult.rowErrors}</span>
                </div>
              )}
              {importResult.rowErrorDetails && importResult.rowErrorDetails.length > 0 && (
                <details className="pt-1 border-t border-emerald-100">
                  <summary className="cursor-pointer text-amber-600">
                    {isAr ? 'تفاصيل أسباب الفشل' : 'Why rows failed'}
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-500 ltr:text-left rtl:text-right">
                    {importResult.rowErrorDetails.map((e, i) => (
                      <li key={i} className="font-mono break-all">
                        [{e.sheet} #{e.row}] {e.name && `"${e.name}" — `}{e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {importResult.sheetsIgnored?.length > 0 && (
                <p className="text-slate-400 pt-1 border-t border-emerald-100">
                  {isAr ? 'شيتات متجاهَلة: ' : 'Ignored sheets: '}
                  {importResult.sheetsIgnored.join('، ')}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Danger Zone: Clear Data */}
        <Card className="p-6 space-y-4 border-red-100">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🗑️</span>
            <div>
              <h2 className="font-bold text-red-700">{isAr ? 'مسح جميع البيانات' : 'Clear All Data'}</h2>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'يحذف جميع بيانات الأطفال والرواتب والمصروفات. لا يمكن التراجع عن ذلك.'
                  : 'Deletes all children, payment, salary, and expense records. Irreversible.'}
              </p>
            </div>
          </div>
          <Button variant="danger" onClick={() => setShowClearConfirm(true)} className="w-full">
            ⚠️ {isAr ? 'مسح جميع البيانات...' : 'Clear All Data...'}
          </Button>
        </Card>
      </div>

      {/* Audit Log */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">
            📋 {isAr ? 'سجل أحداث المزامنة (آخر 50 إدخالاً)' : 'Sync Audit Log (last 50)'}
          </h2>
          <Button variant="outline" onClick={loadStats} isLoading={isLoading}>
            🔄 {isAr ? 'تحديث' : 'Refresh'}
          </Button>
        </div>

        {audit.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm">{isAr ? 'لا توجد أحداث مزامنة مسجّلة.' : 'No sync events recorded.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'الإجراء' : 'Action'}</th>
                  <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'النوع' : 'Entity'}</th>
                  <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'التوقيت' : 'Time'}</th>
                  <th className="px-4 py-3 text-start font-semibold text-slate-600">{isAr ? 'الخطأ' : 'Error'}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs">{row.action}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{row.entity_type}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={row.status === 'success' ? 'success' : 'danger'}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">
                      {new Date(row.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                    </td>
                    <td className="px-4 py-2.5 text-red-500 text-xs max-w-xs truncate">
                      {row.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Clear Confirm Modal */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title={isAr ? '⚠️ تحذير: مسح جميع البيانات' : '⚠️ Warning: Clear All Data'}
      >
        <div className="space-y-4 mt-2">
          <Alert variant="danger" title={isAr ? 'لا يمكن التراجع عن هذا الإجراء' : 'This action cannot be undone'}>
            {isAr
              ? 'سيتم حذف جميع سجلات الأطفال والدفعات والرواتب والمصروفات من قاعدة البيانات نهائياً. يُنصح بأخذ نسخة احتياطية قبل المتابعة.'
              : 'All children, payment, salary, and expense records will be permanently deleted. Please create a backup before proceeding.'}
          </Alert>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleClear} isLoading={isClearing}>
              {isAr ? 'نعم، احذف جميع البيانات' : 'Yes, Delete All Data'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}