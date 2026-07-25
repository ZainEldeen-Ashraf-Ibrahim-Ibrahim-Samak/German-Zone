import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useExport } from '../../hooks/useExport.js'
import { Card } from '../../components/ui/Card.js'
import { Stat } from '../../components/ui/Stat.js'
import { Button } from '../../components/ui/Button.js'
import { Table } from '../../components/ui/Table.js'
import { Badge } from '../../components/ui/Badge.js'
import { Alert } from '../../components/ui/Alert.js'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { ReportActions } from '../../components/reports/ReportActions.js'
import type { ChildStatement as ChildStatementType, ChildStatementRow, AttendanceHistoryRow } from '../../types/index.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function ChildStatement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { exportChild } = useExport()

  const [statement, setStatement] = useState<ChildStatementType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  

  // Attendance history (FR-019) — admin-only, per the access-control clarification.
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryRow[]>([])

  useEffect(() => {
    if (!id || !isAdmin) return
    window.api.attendance.getChildHistory(Number(id)).then(setAttendanceHistory).catch(() => setAttendanceHistory([]))
  }, [id, isAdmin])

  // Fetch statement data
  const fetchStatement = async () => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await window.api.children.statement({ childId: Number(id) })
      setStatement(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to load child statement')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatement()
  }, [id])

  // Localized currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount)
  }

  // Translate month helper
  const formatMonth = (monthAr: string) => {
    if (i18n.language === 'ar') return monthAr
    const idx = arabicMonths.indexOf(monthAr)
    return idx !== -1 ? englishMonths[idx] : monthAr
  }

  // Handle statement exports
  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    if (!id) return
    try {
      const result = await exportChild(Number(id), format)
      if (result && result.filePath) {
        console.log(`Statement exported successfully to: ${result.filePath}`)
      }
    } catch (err: any) {
      console.error('Statement export failed:', err)
    }
  }

  const handlePrint = async () => {
    if (!id) return
    const { html } = await window.api.print.preview({ reportType: 'child', childId: Number(id), lang: i18n.language })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleChildReportExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!id) return
    await window.api.export.childReport({ childId: Number(id), format, lang: i18n.language })
  }

  const handleChildReportPrint = async () => {
    if (!id) return
    const { html } = await window.api.print.preview({ reportType: 'childReport', childId: Number(id), lang: i18n.language })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  // Table columns definition
  const columns = useMemo(() => [
    {
      key: 'period',
      header: i18n.language === 'ar' ? 'الفترة' : 'Billing Period',
      render: (row: ChildStatementRow) => (
        <span className="font-semibold text-slate-900">
          {formatMonth(row.month)} {row.year}
        </span>
      )
    },
    {
      key: 'service',
      header: t('service'),
      render: (row: ChildStatementRow) => (
        <span>{row.service} ({row.unit})</span>
      )
    },
    {
      key: 'quantity',
      header: i18n.language === 'ar' ? 'الكمية' : 'Qty',
      render: (row: ChildStatementRow) => <span>{row.quantity}</span>,
      className: 'text-center'
    },
    {
      key: 'price',
      header: t('price'),
      render: (row: ChildStatementRow) => <span>{formatCurrency(row.price)}</span>,
      className: 'text-end'
    },
    {
      key: 'total',
      header: t('invoiced'),
      render: (row: ChildStatementRow) => (
        <span className="font-medium">{formatCurrency(row.total)}</span>
      ),
      className: 'text-end'
    },
    {
      key: 'paid',
      header: t('collected'),
      render: (row: ChildStatementRow) => (
        <span className="text-emerald-600 font-medium">{formatCurrency(row.paid)}</span>
      ),
      className: 'text-end'
    },
    {
      key: 'balance',
      header: t('arrears'),
      render: (row: ChildStatementRow) => {
        if (row.balance < 0) {
          // Credit
          return (
            <span className="text-blue-600 font-medium font-mono">
              ({formatCurrency(Math.abs(row.balance))}) {i18n.language === 'ar' ? 'رصيد' : 'Credit'}
            </span>
          )
        }
        if (row.balance > 0) {
          return (
            <span className="text-red-600 font-medium font-mono">
              {formatCurrency(row.balance)}
            </span>
          )
        }
        return <span className="text-slate-400 font-mono">—</span>
      },
      className: 'text-end'
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: ChildStatementRow) => {
        let variant: 'success' | 'warning' | 'danger' = 'warning'
        if (row.status === 'paid') variant = 'success'
        else if (row.status === 'unpaid') variant = 'danger'
        
        return (
          <Badge variant={variant}>
            {row.status === 'paid' 
              ? (i18n.language === 'ar' ? 'تم السداد' : 'Paid') 
              : row.status === 'partial' 
                ? (i18n.language === 'ar' ? 'سداد جزئي' : 'Partial')
                : (i18n.language === 'ar' ? 'غير مسدد' : 'Unpaid')}
          </Badge>
        )
      },
      className: 'text-center'
    },
    {
      key: 'notes',
      header: t('notes'),
      render: (row: ChildStatementRow) => (
        <span className="text-slate-500 max-w-xs block truncate" title={row.notes}>
          {row.notes || '—'}
        </span>
      )
    }
  ], [i18n.language, t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !statement) {
    return (
      <div className="p-6">
        <Alert variant="danger" title={t('error')}>
          {error || 'Child statement not found'}
        </Alert>
        <Button onClick={() => navigate('/children')} className="mt-4">
          {i18n.language === 'ar' ? 'العودة لقائمة الأطفال' : 'Back to Children'}
        </Button>
      </div>
    )
  }

  const { child, rows, summary } = statement

  return (
    <div className="p-6 space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/children')}
            >
              {i18n.language === 'ar' ? '← عودة' : '← Back'}
            </Button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-500">{t('statement')}</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              {child.photo_url ? (
                <img src={child.photo_url} alt={child.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl text-slate-300">🧒</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {i18n.language === 'ar' ? `كشف حساب: ${child.name}` : `Statement: ${child.name}`}
              </h1>
              {child.teacher_name && (
                <p className="text-sm text-slate-500">
                  {t('teacher')}: <span className="font-semibold text-slate-700">{child.teacher_name}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
            <span className="text-xs text-slate-400 self-center">
              {i18n.language === 'ar' ? 'كشف الحساب:' : 'Statement:'}
            </span>
            <ReportActions
              onPrint={handlePrint}
              onExportPdf={() => handleExport('pdf')}
              onExportExcel={() => handleExport('xlsx')}
              onExportCsv={() => handleExport('csv')}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
            <span className="text-xs text-slate-400 self-center">
              {i18n.language === 'ar' ? 'تقرير الطفل الشامل:' : 'Full Child Report:'}
            </span>
            <ReportActions
              onPrint={handleChildReportPrint}
              onExportPdf={() => handleChildReportExport('pdf')}
              onExportExcel={() => handleChildReportExport('xlsx')}
              onExportCsv={() => handleChildReportExport('csv')}
            />
          </div>
        </div>
      </div>

      {/* Child Information Header Card */}
      <Card className="p-6 bg-slate-50/50">
        <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4">
          👤 {i18n.language === 'ar' ? 'بيانات الطفل والاشتراك الأساسي' : 'Child & Primary Service Info'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {t('guardian')}
            </span>
            <span className="text-slate-800 font-medium mt-1 block">
              {child.guardian}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {t('guardian_phone')}
            </span>
            <span className="text-slate-800 font-medium font-mono mt-1 block">
              {child.guardian_phone}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {i18n.language === 'ar' ? 'الخدمة والسعر المتفق عليه' : 'Service & Agreed Price'}
            </span>
            <span className="text-slate-800 font-medium mt-1 block">
              {child.service} — {formatCurrency(child.price)} / {child.unit}
            </span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {t('reg_date')}
            </span>
            <span className="text-slate-800 font-medium font-mono mt-1 block">
              {child.reg_date}
            </span>
          </div>
        </div>
      </Card>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Stat
          title={i18n.language === 'ar' ? 'أشهر الاشتراك' : 'Active Billing Months'}
          value={summary.activeMonths}
          icon="📅"
        />
        <Stat
          title={t('invoiced')}
          value={formatCurrency(summary.totalInvoiced)}
          icon="💵"
        />
        <Stat
          title={t('collected')}
          value={formatCurrency(summary.totalCollected)}
          icon="✅"
        />
        <Stat
          title={t('arrears')}
          value={formatCurrency(summary.totalBalance)}
          icon="⚠️"
          className={summary.totalBalance > 0 ? 'bg-red-50/10 border-red-100' : ''}
        />
      </div>

      {/* Monthly Statements Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-800">
          📋 {i18n.language === 'ar' ? 'سجل المطالبات والدفعات الشهرية تفصيلياً' : 'Detailed Monthly Invoices & Payments'}
        </h3>
        
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(row, index) => `${row.year}-${row.month}-${index}`}
          emptyMessage={i18n.language === 'ar' ? 'لا يوجد سجل مطالبات لهذا الطفل بعد.' : 'No payment records for this child.'}
        />
      </div>

      {/* Attendance History (FR-019) — admin-only */}
      {isAdmin && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800">
            🗓️ {i18n.language === 'ar' ? 'سجل الحضور الكامل' : 'Complete Attendance History'}
          </h3>
          <Table
            columns={[
              { key: 'attendance_date', header: i18n.language === 'ar' ? 'التاريخ' : 'Date', render: (r: AttendanceHistoryRow) => r.attendance_date },
              { key: 'teacher_name', header: i18n.language === 'ar' ? 'المعلم' : 'Teacher', render: (r: AttendanceHistoryRow) => r.teacher_name || '—' },
              { key: 'teacher_status', header: i18n.language === 'ar' ? 'حالة المعلم' : 'Teacher Status', render: (r: AttendanceHistoryRow) => r.teacher_status === 'present' ? (i18n.language === 'ar' ? 'حاضر' : 'Present') : r.teacher_status === 'absent' ? (i18n.language === 'ar' ? 'غائب' : 'Absent') : '—' },
              { key: 'child_status', header: i18n.language === 'ar' ? 'حالة الطفل' : 'Child Status', render: (r: AttendanceHistoryRow) => r.child_status === 'attended' ? (i18n.language === 'ar' ? 'حاضر' : 'Attended') : r.child_status === 'absent_excused' ? (i18n.language === 'ar' ? 'غائب بعذر' : 'Excused') : (i18n.language === 'ar' ? 'غائب بدون عذر' : 'Unexcused') },
              { key: 'payment_generated', header: i18n.language === 'ar' ? 'تم الدفع' : 'Payment', render: (r: AttendanceHistoryRow) => r.payment_generated ? <Badge variant="success">{i18n.language === 'ar' ? 'نعم' : 'Yes'}</Badge> : <Badge variant="neutral">{i18n.language === 'ar' ? 'لا' : 'No'}</Badge> },
              { key: 'session_cost', header: i18n.language === 'ar' ? 'تكلفة الجلسة' : 'Session Cost', render: (r: AttendanceHistoryRow) => r.session_cost != null ? formatCurrency(r.session_cost) : '—' },
            ]}
            data={attendanceHistory}
            keyExtractor={(row, index) => `${row.attendance_date}-${index}`}
            emptyMessage={i18n.language === 'ar' ? 'لا يوجد سجل حضور لهذا الطفل بعد.' : 'No attendance history for this child yet.'}
          />
        </div>
      )}
    </div>
  )
}