import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui/Modal.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import type { Payment, PaymentTransaction } from '../../types/index.js'
import type { PaymentMethod } from '../../store/usePaymentMethodsStore.js'

interface Props {
  payment: Payment
  paymentMethods: PaymentMethod[]
  onClose: () => void
  onChanged: () => void // refresh the payments list after add/delete
}

export default function PaymentInstallmentsModal({ payment, paymentMethods, onClose, onChanged }: Props) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // New installment form
  const [amount, setAmount] = useState('')
  const [methodId, setMethodId] = useState<number | ''>('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const fmt = (n: number) => new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP' }).format(n)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await window.api.payments.listTransactions(payment.id)
      setTransactions(rows as PaymentTransaction[])
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [payment.id])

  useEffect(() => { load() }, [load])

  const paidSoFar = transactions.reduce((s, t) => s + t.amount, 0)
  // When no transactions yet, the existing payment.paid will be seeded as the first one on add.
  const effectivePaid = transactions.length > 0 ? paidSoFar : payment.paid
  const remaining = Number((payment.total - effectivePaid).toFixed(2))

  const handleAdd = async () => {
    setError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setError(isAr ? 'أدخل مبلغاً صحيحاً أكبر من صفر' : 'Enter a valid amount greater than zero')
      return
    }
    setIsSaving(true)
    try {
      await window.api.payments.addTransaction({
        payment_id: payment.id,
        amount: amt,
        payment_method_id: methodId === '' ? null : Number(methodId),
        paid_date: date || null,
        notes: notes || null,
      })
      setAmount(''); setNotes('')
      await load()
      onChanged()
    } catch (e: any) {
      setError(e.message || 'Failed to add installment')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    setError('')
    setIsSaving(true)
    try {
      await window.api.payments.deleteTransaction(id)
      await load()
      onChanged()
    } catch (e: any) {
      setError(e.message || 'Failed to delete installment')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`${isAr ? 'الدفعات الجزئية' : 'Partial Payments'} — ${payment.child_name || ''}`}
      footer={<Button variant="outline" onClick={onClose}>{isAr ? 'إغلاق' : 'Close'}</Button>}
    >
      <div className="space-y-4">
        {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-50 rounded-lg p-2">
            <div className="text-xs text-slate-400">{isAr ? 'الإجمالي' : 'Total'}</div>
            <div className="font-mono font-bold text-slate-800">{fmt(payment.total)}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2">
            <div className="text-xs text-emerald-500">{isAr ? 'المدفوع' : 'Paid'}</div>
            <div className="font-mono font-bold text-emerald-700">{fmt(effectivePaid)}</div>
          </div>
          <div className={`rounded-lg p-2 ${remaining > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <div className={`text-xs ${remaining > 0 ? 'text-red-500' : 'text-slate-400'}`}>{isAr ? 'المتبقي' : 'Remaining'}</div>
            <div className={`font-mono font-bold ${remaining > 0 ? 'text-red-600' : 'text-slate-600'}`}>{fmt(remaining)}</div>
          </div>
        </div>

        {/* Transactions list */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">{isAr ? 'سجل الدفعات' : 'Payment History'}</h4>
          {isLoading ? (
            <p className="text-sm text-slate-400">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-400">{isAr ? 'لا توجد دفعات مسجلة بعد.' : 'No installments recorded yet.'}</p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-mono font-semibold text-slate-800">{fmt(t.amount)}</span>
                    <span className="text-xs text-slate-400">
                      {t.paid_date || '—'} · {t.payment_method_name || (isAr ? 'غير محدد' : 'Unspecified')}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={isSaving}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
                  >
                    {isAr ? 'حذف' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add installment form */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">{isAr ? 'إضافة دفعة جديدة' : 'Add a Payment'}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={isAr ? 'المبلغ' : 'Amount'}
              type="number"
              min={0}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={remaining > 0 ? String(remaining) : '0'}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{isAr ? 'طريقة الدفع' : 'Payment Method'}</label>
              <select
                value={methodId}
                onChange={(e) => setMethodId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full text-sm border border-slate-200 rounded px-2 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
              >
                <option value="">{isAr ? '— غير محدد —' : '— None —'}</option>
                {paymentMethods.filter((m) => m.is_active === 1).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <Input label={isAr ? 'التاريخ' : 'Date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label={isAr ? 'ملاحظات' : 'Notes'} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            {remaining > 0 && (
              <Button variant="outline" onClick={() => setAmount(String(remaining))} disabled={isSaving}>
                {isAr ? 'سداد المتبقي' : 'Pay Remaining'}
              </Button>
            )}
            <Button variant="primary" onClick={handleAdd} isLoading={isSaving}>
              {isAr ? 'إضافة الدفعة' : 'Add Payment'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
