import * as React from 'react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import type { Payment } from '../../types/index.js'
import type { PaymentMethod } from '../../store/usePaymentMethodsStore.js'

interface PaymentRowProps {
  payment: Payment
  isSelected: boolean
  onToggleSelect: () => void
  onUpdate: (id: number, quantity: number, paid: number, notes: string, payment_method_id?: number | null) => Promise<any>
  paymentMethods: PaymentMethod[]
  onOpenInstallments: () => void
  isAdmin?: boolean
}

export default function PaymentRow({
  payment,
  isSelected,
  onToggleSelect,
  onUpdate,
  paymentMethods,
  onOpenInstallments,
  isAdmin = false,
}: PaymentRowProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  // When partial-payment installments exist, paid/method are derived from them — edit via the modal.
  const hasInstallments = (payment.transaction_count ?? 0) > 0

  // Local state for editing fields to prevent slow keystrokes
  const [localQty, setLocalQty] = useState(payment.quantity.toString())
  const [localPaid, setLocalPaid] = useState(payment.paid.toString())
  const [localNotes, setLocalNotes] = useState(payment.notes || '')
  const [localMethodId, setLocalMethodId] = useState<number | null>(payment.payment_method_id ?? null)
  const [isSaving, setIsSaving] = useState(false)

  // Keep local state in sync when payment changes from database (e.g. bulk pay)
  useEffect(() => {
    setLocalQty(payment.quantity.toString())
    setLocalPaid(payment.paid.toString())
    setLocalNotes(payment.notes || '')
    setLocalMethodId(payment.payment_method_id ?? null)
  }, [payment])

  const handleBlur = async () => {
    const qtyNum = parseFloat(localQty)
    const paidNum = parseFloat(localPaid)

    if (isNaN(qtyNum) || qtyNum < 0 || isNaN(paidNum) || paidNum < 0) {
      // Revert to database values on invalid input
      setLocalQty(payment.quantity.toString())
      setLocalPaid(payment.paid.toString())
      return
    }

    // Only update if something actually changed
    if (
      qtyNum !== payment.quantity ||
      paidNum !== payment.paid ||
      localNotes !== (payment.notes || '') ||
      localMethodId !== (payment.payment_method_id ?? null)
    ) {
      setIsSaving(true)
      await onUpdate(payment.id, qtyNum, paidNum, localNotes, localMethodId)
      setIsSaving(false)
    }
  }

  const handleMethodChange = async (newMethodId: number | null) => {
    setLocalMethodId(newMethodId)
    setIsSaving(true)
    await onUpdate(payment.id, payment.quantity, payment.paid, localNotes, newMethodId)
    setIsSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  // Handle pay in full click
  const handlePayFull = async () => {
    setIsSaving(true)
    await onUpdate(payment.id, payment.quantity, payment.total, localNotes, localMethodId)
    setIsSaving(false)
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount)
  }

  // Localize service and unit
  const localizedService = () => {
    if (i18n.language === 'en') {
      if (payment.service === 'حضانة') return t('services.nursery')
      if (payment.service === 'استضافة') return t('services.hosting')
      if (payment.service === 'جلسة') return t('services.session')
    }
    return payment.service
  }

  const localizedUnit = () => {
    if (payment.unit === 'شهر') return t('units.month')
    if (payment.unit === 'يوم') return t('units.day')
    if (payment.unit === 'ساعة') return t('units.hour')
    if (payment.unit === 'جلسة') return t('units.session')
    return payment.unit
  }

  const getStatusBadge = () => {
    if (payment.status === 'paid') return <Badge variant="success">{t('paid', 'Paid')}</Badge>
    if (payment.status === 'partial') return <Badge variant="warning">{t('partial', 'Partial')}</Badge>
    return <Badge variant="danger">{t('unpaid', 'Unpaid')}</Badge>
  }

  return (
    <tr className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : ''}`}>
      {/* Checkbox */}
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
        />
      </td>

      {/* Child Name */}
      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap text-start">
        {payment.child_name || `Child #${payment.child_id}`}
      </td>

      {/* Service Type & Unit */}
      <td className="px-4 py-3 whitespace-nowrap text-start">
        <div className="flex flex-col">
          <span className="font-medium text-slate-800 text-sm">{localizedService()}</span>
          <span className="text-xs text-slate-400">{localizedUnit()}</span>
        </div>
      </td>

      {/* Rate/Price */}
      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap text-start">
        {formatCurrency(payment.price)}
      </td>

      {/* Quantity (Editable input) */}
      <td className="px-4 py-3 whitespace-nowrap text-start w-24">
        <input
          type="number"
          step="0.1"
          value={localQty}
          onChange={(e) => setLocalQty(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isSaving || !isAdmin}
          min={0.1}
          className="w-16 px-2 py-1 text-center font-mono border border-slate-300 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200"
        />
      </td>

      {/* Total Amount */}
      <td className="px-4 py-3 font-mono font-semibold text-slate-850 whitespace-nowrap text-start">
        {formatCurrency(payment.total)}
      </td>

      {/* Paid Amount (Editable input — read-only when installments drive the total) */}
      <td className="px-4 py-3 whitespace-nowrap text-start w-28">
        {hasInstallments ? (
          <span className="inline-flex flex-col items-center">
            <span className="font-mono font-semibold text-slate-800">{formatCurrency(payment.paid)}</span>
            <span className="text-[10px] text-slate-400">{isAr ? `${payment.transaction_count} دفعات` : `${payment.transaction_count} installments`}</span>
          </span>
        ) : (
          <input
            type="number"
            step="1"
            value={localPaid}
            onChange={(e) => setLocalPaid(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            min={0}
            className="w-20 px-2 py-1 text-center font-mono border border-slate-300 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        )}
      </td>

      {/* Balance */}
      <td className="px-4 py-3 font-mono whitespace-nowrap text-start">
        {payment.balance < 0 ? (
          <span className="text-emerald-600 font-semibold">
            {formatCurrency(Math.abs(payment.balance))} ({i18n.language === 'ar' ? 'رصيد' : 'Credit'})
          </span>
        ) : payment.balance > 0 ? (
          <span className="text-red-600 font-semibold">{formatCurrency(payment.balance)}</span>
        ) : (
          <span className="text-slate-400">0.00</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap text-start">
        {getStatusBadge()}
      </td>

      {/* Payment Method */}
      <td className="px-4 py-3 text-start min-w-[10rem]">
        {hasInstallments ? (
          <span className="text-xs text-slate-500">{isAr ? 'طرق متعددة (حسب الدفعات)' : 'Multiple (per installment)'}</span>
        ) : (
          <select
            value={localMethodId ?? ''}
            onChange={(e) => handleMethodChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={isSaving}
            className="w-full min-w-[9rem] text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
          >
            <option value="">{isAr ? '— غير محدد —' : '— None —'}</option>
            {paymentMethods.filter(m => m.is_active === 1 || m.id === localMethodId).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </td>

      {/* Notes (Editable inline input) */}
      <td className="px-4 py-3 w-40 text-start">
        <input
          type="text"
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
          className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-300"
        />
      </td>

      {/* Quick Actions */}
      <td className="px-4 py-3 text-center whitespace-nowrap w-32">
        <div className="flex flex-col gap-1 items-stretch">
          {payment.balance > 0 && !hasInstallments && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePayFull}
              isLoading={isSaving}
              className="text-xs"
            >
              {i18n.language === 'ar' ? 'دفع كامل' : 'Pay Full'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenInstallments}
            className="text-xs"
          >
            {i18n.language === 'ar' ? '💳 دفعات جزئية' : '💳 Installments'}
          </Button>
        </div>
      </td>
    </tr>
  )
}
