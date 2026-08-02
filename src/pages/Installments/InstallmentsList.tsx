import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/useAuthStore.js'
import { useBranchStore } from '../../store/useBranchStore.js'
import { Card } from '../../components/ui/Card.js'
import { Table } from '../../components/ui/Table.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Alert } from '../../components/ui/Alert.js'
import type { InstallmentMonth, StudentInstallment } from '../../types/index.js'

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/**
 * The instalment schedule: which month each payment is due in, and how much.
 *
 * The year strip is the point of the page — a plan is spread across the months it was agreed
 * for, so an unpaid plan shows up as "500 due in March, 500 in April…" rather than the entire
 * remaining fee piled onto whichever month you happen to be looking at.
 */
export default function InstallmentsList() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState<string | null>(ARABIC_MONTHS[new Date().getMonth()])
  const [calendar, setCalendar] = useState<InstallmentMonth[]>([])
  const [rows, setRows] = useState<StudentInstallment[]>([])
  const [summary, setSummary] = useState({ total: 0, collected: 0, outstanding: 0, overdue: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Collect-payment modal
  const [payTarget, setPayTarget] = useState<StudentInstallment | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethodId, setPayMethodId] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [methods, setMethods] = useState<{ id: number; name: string }[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [payError, setPayError] = useState('')

  const formatCurrency = useCallback(
    (val: number) =>
      new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
        style: 'currency', currency: 'EGP', maximumFractionDigits: 0,
      }).format(val || 0),
    [isAr]
  )

  const monthLabel = useCallback(
    (arabicMonth: string) => (isAr ? arabicMonth : ENGLISH_MONTHS[ARABIC_MONTHS.indexOf(arabicMonth)] ?? arabicMonth),
    [isAr]
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [cal, list] = await Promise.all([
        window.api.installments.calendar({ year }),
        window.api.installments.list({
          year,
          month: month ?? undefined,
          branch_id: selectedBranchId ?? undefined,
        }),
      ])
      setCalendar(cal || [])
      setRows(list?.installments ?? [])
      setSummary(list?.summary ?? { total: 0, collected: 0, outstanding: 0, overdue: 0 })
    } catch (err: any) {
      setError(err.message || 'Failed to load instalments')
    } finally {
      setIsLoading(false)
    }
  }, [year, month, selectedBranchId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.api.paymentMethods.list()
      .then((list: any[]) => setMethods(list || []))
      .catch(() => setMethods([]))
  }, [])

  const yearTotals = useMemo(
    () => calendar.reduce(
      (acc, m) => ({
        due: acc.due + m.due,
        collected: acc.collected + m.collected,
        outstanding: acc.outstanding + m.outstanding,
      }),
      { due: 0, collected: 0, outstanding: 0 }
    ),
    [calendar]
  )

  const openPay = (inst: StudentInstallment) => {
    setPayTarget(inst)
    setPayAmount(String(inst.balance))
    setPayMethodId('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayError('')
  }

  const submitPay = async () => {
    if (!payTarget) return
    setIsSaving(true)
    setPayError('')
    try {
      await window.api.installments.pay({
        id: payTarget.id,
        amount: Number(payAmount),
        payment_method_id: payMethodId === '' ? null : Number(payMethodId),
        paid_date: payDate,
      })
      setSuccessMsg(isAr ? 'تم تسجيل الدفعة' : 'Payment recorded')
      setPayTarget(null)
      await load()
    } catch (err: any) {
      setPayError(err.message || 'Failed to record payment')
    } finally {
      setIsSaving(false)
    }
  }

  const statusBadge = (inst: StudentInstallment) => {
    if (inst.status === 'paid') return <Badge variant="success">{isAr ? 'مدفوعة' : 'Paid'}</Badge>
    if (inst.is_overdue) return <Badge variant="danger">{isAr ? 'متأخرة' : 'Overdue'}</Badge>
    if (inst.status === 'partial') return <Badge variant="warning">{isAr ? 'جزئية' : 'Partial'}</Badge>
    return <Badge variant="neutral">{isAr ? 'مستحقة' : 'Due'}</Badge>
  }

  const columns = [
    {
      key: 'student',
      header: isAr ? 'الطالب' : 'Student',
      render: (i: StudentInstallment) => (
        <div className="flex flex-col text-start">
          <span className="font-semibold text-slate-800">{i.student_name}</span>
          <span className="text-xs text-slate-400">{i.student_guardian_phone}</span>
        </div>
      ),
    },
    {
      key: 'seq',
      header: isAr ? 'رقم الدفعة' : 'Instalment',
      render: (i: StudentInstallment) => <span className="text-slate-600 font-semibold">#{i.seq}</span>,
    },
    {
      key: 'due_date',
      header: isAr ? 'تاريخ الاستحقاق' : 'Due date',
      render: (i: StudentInstallment) => (
        <span className={i.is_overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>{i.due_date}</span>
      ),
    },
    {
      key: 'amount',
      header: isAr ? 'المبلغ' : 'Amount',
      render: (i: StudentInstallment) => <span className="font-semibold text-slate-800">{formatCurrency(i.amount)}</span>,
    },
    {
      key: 'paid',
      header: isAr ? 'المحصّل' : 'Collected',
      render: (i: StudentInstallment) => <span className="text-emerald-700">{formatCurrency(i.paid)}</span>,
    },
    {
      key: 'balance',
      header: isAr ? 'المتبقي' : 'Balance',
      render: (i: StudentInstallment) => (
        <span className={i.balance > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}>
          {formatCurrency(i.balance)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (i: StudentInstallment) => statusBadge(i),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (i: StudentInstallment) =>
        i.balance > 0 ? (
          <Button variant="outline" size="sm" onClick={() => openPay(i)}>
            {isAr ? 'تحصيل' : 'Collect'}
          </Button>
        ) : (
          <span className="text-xs text-slate-400">{i.paid_date ?? '—'}</span>
        ),
    },
  ]

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1 text-start">
          <h2 className="text-2xl font-bold text-slate-800 m-0">
            {isAr ? 'الدفعات' : 'Instalments'}
          </h2>
          <span className="text-slate-400 text-sm font-semibold">
            {isAr
              ? 'كل دفعة في شهر استحقاقها — لا تُجمع كلها كمتأخرات في شهر واحد'
              : 'Each instalment sits in the month it is due — never lumped into one month as arrears'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>‹</Button>
          <span className="text-lg font-bold text-slate-800 w-16 text-center">{year}</span>
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>›</Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}
      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

      {/* Year strip: what is due in each month of the year */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-700">
            {isAr ? 'جدول الاستحقاق الشهري' : 'Monthly due schedule'}
          </span>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-slate-500">
              {isAr ? 'المستحق: ' : 'Due: '}{formatCurrency(yearTotals.due)}
            </span>
            <span className="text-emerald-700">
              {isAr ? 'المحصّل: ' : 'Collected: '}{formatCurrency(yearTotals.collected)}
            </span>
            <span className="text-amber-700">
              {isAr ? 'المتبقي: ' : 'Outstanding: '}{formatCurrency(yearTotals.outstanding)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {calendar.map((m) => {
            const active = month === m.month
            const empty = m.count === 0
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => setMonth(active ? null : m.month)}
                className={`rounded-lg border px-3 py-2 text-start transition-colors ${
                  active
                    ? 'border-primary bg-primary/5'
                    : empty
                      ? 'border-slate-100 bg-slate-50/60 text-slate-400'
                      : 'border-slate-200 bg-white hover:border-primary/40'
                }`}
              >
                <div className="text-xs font-bold text-slate-600">{monthLabel(m.month)}</div>
                <div className="text-sm font-bold text-slate-900">{formatCurrency(m.due)}</div>
                {m.outstanding > 0 && (
                  <div className="text-[11px] font-semibold text-amber-700">
                    {isAr ? 'متبقي ' : 'left '}{formatCurrency(m.outstanding)}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-slate-400">
          {month
            ? (isAr ? `يعرض دفعات ${monthLabel(month)} — اضغط الشهر مرة أخرى لعرض السنة كاملة`
                    : `Showing ${monthLabel(month)} — click the month again to show the whole year`)
            : (isAr ? 'يعرض كل دفعات السنة — اضغط شهراً لتصفيته' : 'Showing the whole year — click a month to filter')}
        </p>
      </Card>

      {/* Totals for what is currently listed */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي الدفعات' : 'Total instalments', value: summary.total, tone: 'text-slate-900' },
          { label: isAr ? 'المحصّل' : 'Collected', value: summary.collected, tone: 'text-emerald-700' },
          { label: isAr ? 'المتبقي' : 'Outstanding', value: summary.outstanding, tone: 'text-amber-700' },
          { label: isAr ? 'متأخرات' : 'Overdue', value: summary.overdue, tone: 'text-red-600' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{stat.label}</div>
            <div className={`text-xl font-bold mt-1 ${stat.tone}`}>{formatCurrency(stat.value)}</div>
          </Card>
        ))}
      </div>

      <Card>
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(i) => i.id}
          isLoading={isLoading}
          emptyMessage={isAr ? 'لا توجد دفعات في هذه الفترة' : 'No instalments due in this period'}
        />
      </Card>

      {!isAdmin && (
        <p className="text-xs text-slate-400">
          {isAr
            ? 'تعديل الخطط وحذفها متاح للمسؤولين فقط — يمكنك تسجيل التحصيل.'
            : 'Editing and deleting plans is admin-only — you can still record collections.'}
        </p>
      )}

      {/* Collect payment */}
      <Modal
        isOpen={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title={isAr ? 'تحصيل دفعة' : 'Collect instalment'}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={isSaving}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={submitPay} isLoading={isSaving}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {payError && <Alert variant="danger" onClose={() => setPayError('')}>{payError}</Alert>}

          {payTarget && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
              <div className="font-semibold text-slate-800">{payTarget.student_name}</div>
              <div className="text-xs">
                {isAr ? `الدفعة #${payTarget.seq} — تستحق ${payTarget.due_date}` : `Instalment #${payTarget.seq} — due ${payTarget.due_date}`}
              </div>
              <div className="text-xs">
                {isAr ? 'المتبقي: ' : 'Balance: '}
                <span className="font-bold">{formatCurrency(payTarget.balance)}</span>
              </div>
            </div>
          )}

          <Input
            label={isAr ? 'المبلغ (EGP)' : 'Amount (EGP)'}
            type="number"
            min={0}
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />

          <Select
            label={isAr ? 'طريقة الدفع' : 'Payment method'}
            value={payMethodId}
            onChange={(e) => setPayMethodId(e.target.value)}
            options={[
              { value: '', label: isAr ? 'بدون تحديد' : 'Unspecified' },
              ...methods.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />

          <Input
            label={isAr ? 'تاريخ التحصيل' : 'Collection date'}
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
