import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Select } from '../../components/ui/Select.js'
import { Table } from '../../components/ui/Table.js'
import { Alert } from '../../components/ui/Alert.js'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.js'
import { ReportActions } from '../../components/reports/ReportActions.js'
import type { PayrollReportRow } from '../../types/index.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]
const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export default function PayrollReport() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<PayrollReportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.api.payroll.report(month, year)
      setRows(result)
    } catch (err: any) {
      setError(err.message || 'Failed to generate payroll report')
    }
    setIsLoading(false)
  }

  useEffect(() => { fetchReport() }, [month, year])

  const totalSalary = rows.reduce((sum, r) => sum + r.total_salary, 0)

  const handlePrint = async () => {
    const { html } = await window.api.print.preview({ reportType: 'payroll', month, year, lang: i18n.language })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    await window.api.export.payrollReport({ month, year, format, lang: i18n.language })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-800">{isAr ? 'تقرير رواتب المعلمين الشهري' : 'Monthly Teacher Payroll Report'}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <ReportActions
            onPrint={handlePrint}
            onExportPdf={() => handleExport('pdf')}
            onExportExcel={() => handleExport('xlsx')}
            onExportCsv={() => handleExport('csv')}
          />
          <Button variant="outline" onClick={() => navigate('/salaries')}>{isAr ? '← عودة للرواتب' : '← Back to Salaries'}</Button>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <Select
            label={isAr ? 'الشهر' : 'Month'}
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
            options={arabicMonths.map((_, idx) => ({ value: String(idx + 1), label: isAr ? arabicMonths[idx] : englishMonths[idx] }))}
          />
        </div>
        <div className="w-32">
          <Select
            label={isAr ? 'السنة' : 'Year'}
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>
      </Card>

      {error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <Table
          columns={[
            { key: 'teacher_name', header: isAr ? 'اسم المعلم' : 'Teacher Name', render: (r: PayrollReportRow) => r.teacher_name },
            { key: 'sessions_paid', header: isAr ? 'عدد الجلسات المدفوعة' : 'Sessions Paid', render: (r: PayrollReportRow) => r.sessions_paid },
            { key: 'session_cost', header: isAr ? 'تكلفة الجلسة' : 'Session Cost', render: (r: PayrollReportRow) => `${r.session_cost} EGP` },
            { key: 'total_salary', header: isAr ? 'إجمالي الراتب' : 'Total Salary', render: (r: PayrollReportRow) => <span className="font-bold">{r.total_salary} EGP</span> },
          ]}
          data={rows}
          keyExtractor={(row) => String(row.teacher_id)}
          emptyMessage={isAr ? 'لا توجد جلسات مدفوعة لهذا الشهر.' : 'No paid sessions for this month.'}
        />
      )}

      {rows.length > 0 && (
        <div className="flex justify-end bg-slate-50 rounded-lg px-4 py-3 text-sm font-semibold text-slate-700">
          {isAr ? `إجمالي الرواتب: ${totalSalary} ج.م` : `Total Payroll: ${totalSalary} EGP`}
        </div>
      )}
    </div>
  )
}
