import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaymentsStore } from '../../store/usePaymentsStore.js'
import { usePaymentMethodsStore } from '../../store/usePaymentMethodsStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { useExport } from '../../hooks/useExport.js'
import PaymentRow from './PaymentRow.js'
import PaymentInstallmentsModal from './PaymentInstallmentsModal.js'
import type { Payment } from '../../types/index.js'
import { Card } from '../../components/ui/Card.js'
import { Stat } from '../../components/ui/Stat.js'
import { Button } from '../../components/ui/Button.js'
import { Select } from '../../components/ui/Select.js'
import { Alert } from '../../components/ui/Alert.js'
import { Modal } from '../../components/ui/Modal.js'
import { ReportActions } from '../../components/reports/ReportActions.js'
import * as React from 'react'

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

const englishMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export default function MonthlyPayments() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { exportMonth } = useExport()

  const {
    payments,
    byChild,
    summary,
    isLoading,
    error,
    currentMonth,
    currentYear,
    setPeriod,
    fetchPayments,
    generatePayments,
    updatePayment,
    bulkPay,
    deleteChildPayments,
    deleteSelectedPayments,
    deleteAllPayments,
    clearError,
  } = usePaymentsStore()

  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const { methods: paymentMethods, fetchMethods: fetchPaymentMethods } = usePaymentMethodsStore()

  useEffect(() => { fetchPaymentMethods() }, [])

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all')

  // Selection state
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkMethodId, setBulkMethodId] = useState<number | ''>('')
  const [installmentsFor, setInstallmentsFor] = useState<Payment | null>(null)

  // Fetch payments on mount
  useEffect(() => {
    fetchPayments()
  }, [])

  // Clear selection when period changes
  useEffect(() => {
    setSelectedIds([])
  }, [currentMonth, currentYear])

  // Localized months options
  const monthOptions = useMemo(() => {
    return arabicMonths.map((m, idx) => ({
      value: m,
      label: i18n.language === 'ar' ? m : englishMonths[idx],
    }))
  }, [i18n.language])

  const yearOptions = useMemo(() => {
    return yearsList.map((y) => ({
      value: y,
      label: y.toString(),
    }))
  }, [])

  const filteredByChild = useMemo(() => {
    let data = byChild ?? []
    // Name filter: match child name or guardian name
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      data = data.filter((g: any) =>
        g.child_name?.toLowerCase().includes(q) ||
        g.child_guardian?.toLowerCase().includes(q)
      )
    }
    // Phone filter: digits-only partial match
    if (phoneQuery.trim()) {
      const digits = phoneQuery.trim().replace(/\D/g, '')
      if (digits.length >= 3) {
        data = data.filter((g: any) => {
          const phone = (g.child_guardian_phone ?? '').replace(/\D/g, '')
          return phone.includes(digits)
        })
      }
    }
    if (statusFilter !== 'all') {
      data = data.filter((g: any) => g.status === statusFilter)
    }
    return data
  }, [byChild, searchQuery, phoneQuery, statusFilter])

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPeriod(e.target.value, currentYear)
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPeriod(currentMonth, Number(e.target.value))
  }

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedIds.length === payments.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(payments.map((p) => p.id))
    }
  }

  const handleToggleSelectRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]
    )
  }

  // Bulk Payment
  const [isBulkPaying, setIsBulkPaying] = useState(false)
  const handleBulkPay = async () => {
    if (selectedIds.length === 0) return
    setIsBulkPaying(true)
    const count = await bulkPay(selectedIds, bulkMethodId !== '' ? Number(bulkMethodId) : null)
    setIsBulkPaying(false)
    if (count > 0) setSelectedIds([])
  }

  // Delete selected / delete all — admin-only, both gated behind a confirmation panel since
  // they permanently remove payment history (and any linked installment transactions).
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'selected' | 'all' | null>(null)
  const [isDeletingPayments, setIsDeletingPayments] = useState(false)

  const handleConfirmDelete = async () => {
    setIsDeletingPayments(true)
    if (confirmDeleteMode === 'selected') {
      const count = await deleteSelectedPayments(selectedIds)
      if (count > 0) setSelectedIds([])
    } else if (confirmDeleteMode === 'all') {
      await deleteAllPayments()
      setSelectedIds([])
    }
    setIsDeletingPayments(false)
    setConfirmDeleteMode(null)
  }

  // Update row
  const handleUpdateRow = async (id: number, quantity: number, paid: number, notes: string, payment_method_id?: number | null) => {
    return await updatePayment({ id, quantity, paid, notes, payment_method_id })
  }

  // Generate payments for this period
  const [isGenerating, setIsGenerating] = useState(false)
  const handleGenerate = async () => {
    setIsGenerating(true)
    await generatePayments()
    setIsGenerating(false)
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    if (status === 'paid') return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">{t('paid', 'Paid')}</span>
    if (status === 'partial') return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">{t('partial', 'Partial')}</span>
    return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">{t('unpaid', 'Unpaid')}</span>
  }

  // Export handlers — export the current selection; if nothing is selected, export all payments
  // for the period (select-to-export with "no selection = export all" fallback).
  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    try {
      const result = await exportMonth(currentMonth, currentYear, format, selectedIds.length > 0 ? selectedIds : undefined)
      if (result && result.filePath) {
        console.log(`Exported successfully to: ${result.filePath}`)
      }
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handlePrint = async () => {
    const { html } = await window.api.print.preview({
      reportType: 'month',
      month: currentMonth,
      year: currentYear,
      lang: i18n.language,
      paymentIds: selectedIds.length > 0 ? selectedIds : undefined,
    })
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('payments')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {i18n.language === 'ar'
              ? 'متابعة سداد اشتراكات ومطالبات الأطفال الشهرية.'
              : 'Track and record monthly child billing and collections.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {payments.length > 0 && (
            <ReportActions
              onPrint={handlePrint}
              onExportPdf={() => handleExport('pdf')}
              onExportExcel={() => handleExport('xlsx')}
              onExportCsv={() => handleExport('csv')}
            />
          )}
          <Button variant="primary" onClick={handleGenerate} isLoading={isGenerating}>
            ⚡ {t('generate_payments')}
          </Button>
          {isAdmin && payments.length > 0 && (
            <Button variant="danger" onClick={() => setConfirmDeleteMode('all')}>
              🗑️ {isAr ? 'حذف الكل' : 'Delete All'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Selectors and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Period Selector Card */}
        <Card className="p-4 space-y-4">
          <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2">
            📅 {i18n.language === 'ar' ? 'الفترة الزمنية' : 'Billing Period'}
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase">{t('select_month')}</span>
              <Select value={currentMonth} onChange={handleMonthChange} options={monthOptions} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase">{t('select_year')}</span>
              <Select value={currentYear} onChange={handleYearChange} options={yearOptions} />
            </div>
          </div>
        </Card>

        {/* Summary stats */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Stat
            title={t('invoiced')}
            value={formatCurrency(summary.totalInvoiced)}
            icon="💰"
          />
          <Stat
            title={t('collected')}
            value={formatCurrency(summary.totalCollected)}
            icon="✅"
          />
          <Stat
            title={t('arrears')}
            value={formatCurrency(summary.arrears)}
            icon="⚠️"
          />
        </div>
      </div>

      {/* Search & Filter Bar */}
      {payments.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Search inputs row */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Name / guardian search */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم الطفل أو الأب…' : 'Search by child or father name…'}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            {/* Phone search */}
            <div className="relative sm:w-56">
              <span className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-slate-400 text-sm">📞</span>
              <input
                type="tel"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
                placeholder={isAr ? 'بحث برقم الهاتف…' : 'Search by phone…'}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-mono"
              />
              {phoneQuery && (
                <button
                  onClick={() => setPhoneQuery('')}
                  className="absolute inset-y-0 end-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {/* Status filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">
              {isAr ? 'الحالة:' : 'Status:'}
            </span>
            {(['all', 'paid', 'partial', 'unpaid'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s
                    ? s === 'all'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : s === 'paid'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : s === 'partial'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                }`}
              >
                {s === 'all'
                  ? isAr ? 'الكل' : 'All'
                  : s === 'paid'
                  ? isAr ? 'مدفوع' : 'Paid'
                  : s === 'partial'
                  ? isAr ? 'جزئي' : 'Partial'
                  : isAr ? 'غير مدفوع' : 'Unpaid'}
              </button>
            ))}
            {(searchQuery || phoneQuery || statusFilter !== 'all') && (
              <span className="text-xs text-slate-400 ms-1">
                {isAr
                  ? `${filteredByChild.length} من ${byChild?.length ?? 0}`
                  : `${filteredByChild.length} of ${byChild?.length ?? 0}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main content table */}
      <Card className="overflow-hidden">
        {isLoading && payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 gap-3">
            <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-slate-500 font-medium">
              جاري التحميل... / Loading...
            </span>
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center p-16 space-y-6">
            <div className="text-5xl">📝</div>
            <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
              {t('no_payments')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Bulk actions header */}
            {selectedIds.length > 0 && (
              <div className="bg-primary/5 px-6 py-3 border-b border-slate-200 flex items-center justify-between transition-all">
                <span className="text-sm font-semibold text-primary">
                  {isAr
                    ? `تم تحديد ${selectedIds.length} من أصل ${payments.length} مطالبات — سيتم تصدير/طباعة المحدد فقط`
                    : `Selected ${selectedIds.length} of ${payments.length} records — export/print will use only the selected rows`}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkMethodId}
                    onChange={(e) => setBulkMethodId(e.target.value === '' ? '' : Number(e.target.value))}
                    className="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-primary"
                  >
                    <option value="">{isAr ? '— طريقة الدفع —' : '— Payment method —'}</option>
                    {paymentMethods.filter(m => m.is_active === 1).map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <Button variant="secondary" size="sm" onClick={handleBulkPay} isLoading={isBulkPaying}>
                    💵 {t('bulk_pay_selected')}
                  </Button>
                  {isAdmin && (
                    <Button variant="danger" size="sm" onClick={() => setConfirmDeleteMode('selected')}>
                      🗑️ {isAr ? 'حذف المحدد' : 'Delete Selected'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable table container */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-500 border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold text-start border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === payments.length && payments.length > 0}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('child_name')}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('service')}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('price')}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{i18n.language === 'ar' ? 'الكمية' : 'Qty'}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('total')}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{i18n.language === 'ar' ? 'المدفوع' : 'Paid'}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{i18n.language === 'ar' ? 'المتبقي' : 'Balance'}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('status')}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{isAr ? 'طريقة الدفع' : 'Payment Method'}</th>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">{t('notes')}</th>
                    <th scope="col" className="px-4 py-3 text-center font-semibold">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredByChild && filteredByChild.length > 0 ? filteredByChild.map((childGroup) => {
                    const childPaymentIds = childGroup.services.map((s: any) => s.id)
                    const isAllSelected = childPaymentIds.every((id: number) => selectedIds.includes(id))
                    
                    const handleToggleChildSelect = () => {
                      if (isAllSelected) {
                        setSelectedIds(prev => prev.filter(id => !childPaymentIds.includes(id)))
                      } else {
                        setSelectedIds(prev => [...new Set([...prev, ...childPaymentIds])])
                      }
                    }

                    const totalExpectedSessions = childGroup.totalExpectedSessions
                    const totalExpectedPayment = childGroup.totalExpectedPayment
                    // Expected total minus what's been collected this month minus any credit
                    // carried in from prior months — how much more is needed to cover the month.
                    const remainingToPay = childGroup.remainingAfterWallet

                    return (
                      <React.Fragment key={childGroup.child_id}>
                        <tr className="bg-primary/5">
                          <td colSpan={12} className="px-4 py-2">
                            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                              <span>
                                <span className="font-semibold text-slate-500">{isAr ? 'إجمالي الجلسات المتوقعة: ' : 'Total Expected Sessions: '}</span>
                                <span className="font-bold text-slate-800">
                                  {childGroup.totalSessions} {isAr ? 'من' : 'of'} {totalExpectedSessions}
                                </span>
                              </span>
                              <span>
                                <span className="font-semibold text-slate-500">{isAr ? 'إجمالي المطلوب المتوقع: ' : 'Total Expected Payment: '}</span>
                                <span className="font-bold text-slate-800">{formatCurrency(totalExpectedPayment)}</span>
                              </span>
                              <span>
                                <span className="font-semibold text-slate-500">{isAr ? 'رصيد المحفظة: ' : 'Wallet Balance: '}</span>
                                {childGroup.walletCredit > 0 ? (
                                  <span className="font-bold text-emerald-700">{formatCurrency(childGroup.walletCredit)}</span>
                                ) : (
                                  <span className="font-bold text-slate-400">{isAr ? 'لا يوجد رصيد في المحفظة' : 'Nothing in wallet'}</span>
                                )}
                              </span>
                              <span>
                                <span className="font-semibold text-slate-500">{isAr ? 'المتبقي للدفع: ' : 'Left To Pay: '}</span>
                                <span className={`font-bold ${remainingToPay > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                  {formatCurrency(remainingToPay)}
                                </span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        <tr className="bg-slate-50/50 border-t-2 border-slate-200">
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isAllSelected && childPaymentIds.length > 0}
                              onChange={handleToggleChildSelect}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-start">
                            <div className="font-bold text-slate-900 whitespace-nowrap">
                              {childGroup.child_guardian
                                ? `${childGroup.child_name} / ${childGroup.child_guardian}`
                                : childGroup.child_name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-semibold" colSpan={4}>
                            {i18n.language === 'ar' ? `إجمالي الطفل (${childGroup.services.length} خدمات)` : `Child Total (${childGroup.services.length} services)`}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap text-start">
                            {formatCurrency(childGroup.totalInvoiced)}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-800 whitespace-nowrap text-start">
                            {formatCurrency(childGroup.totalCollected)}
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap text-start">
                            {childGroup.balance < 0 ? (
                              <span className="text-emerald-600 font-bold">
                                {formatCurrency(Math.abs(childGroup.balance))} ({i18n.language === 'ar' ? 'رصيد' : 'Credit'})
                              </span>
                            ) : childGroup.balance > 0 ? (
                              <span className="text-red-600 font-bold">{formatCurrency(childGroup.balance)}</span>
                            ) : (
                              <span className="text-slate-400 font-bold">0.00</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-start">
                            {getStatusBadge(childGroup.status)}
                          </td>
                          <td colSpan={2} className="px-4 py-3 text-center">
                            {isAdmin && childGroup.child_is_active === 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs py-1 h-auto font-semibold"
                                onClick={() => {
                                  if (window.confirm(isAr ? `هل أنت متأكد من حذف مطالبات ${childGroup.child_name} لهذا الشهر؟` : `Are you sure you want to delete payments for ${childGroup.child_name} for this month?`)) {
                                    deleteChildPayments(childGroup.child_id)
                                  }
                                }}
                              >
                                🗑️ {isAr ? 'حذف من القائمة' : 'Delete from list'}
                              </Button>
                            )}
                          </td>
                        </tr>
                        <tr className="bg-white">
                          <td colSpan={12} className="px-4 pb-2 pt-0">
                            <div className="flex flex-wrap gap-2">
                              {childGroup.services.map((payment: any) => (
                                <div
                                  key={payment.id}
                                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 flex items-center gap-2"
                                >
                                  <span className="font-semibold text-slate-500">{payment.service}</span>
                                  <span>
                                    {i18n.language === 'ar'
                                      ? `${payment.expected_quantity ?? payment.quantity} ${payment.unit} × ${payment.price} ج.م`
                                      : `${payment.expected_quantity ?? payment.quantity} ${payment.unit} × ${payment.price} EGP`}
                                  </span>
                                  <span className="font-bold text-slate-800">{formatCurrency(payment.expected_total ?? payment.total)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                        {childGroup.services.map((payment: any) => (
                          <PaymentRow
                            key={payment.id}
                            payment={payment}
                            isSelected={selectedIds.includes(payment.id)}
                            onToggleSelect={() => handleToggleSelectRow(payment.id)}
                            onUpdate={handleUpdateRow}
                            paymentMethods={paymentMethods}
                            onOpenInstallments={() => setInstallmentsFor(payment)}
                            isAdmin={isAdmin}
                          />
                        ))}
                      </React.Fragment>
                    )
                  }) : (
                    <tr>
                      <td colSpan={12} className="text-center py-12 text-slate-400 text-sm">
                        {isAr ? 'لا توجد نتائج مطابقة للبحث أو الفلتر' : 'No results match your search or filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {installmentsFor && (
        <PaymentInstallmentsModal
          payment={installmentsFor}
          paymentMethods={paymentMethods}
          onClose={() => setInstallmentsFor(null)}
          onChanged={() => fetchPayments()}
        />
      )}

      <Modal
        isOpen={confirmDeleteMode !== null}
        onClose={() => setConfirmDeleteMode(null)}
        title={isAr ? 'تأكيد الحذف' : 'Confirm Deletion'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteMode(null)} disabled={isDeletingPayments}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} isLoading={isDeletingPayments}>
              {isAr ? 'حذف نهائياً' : 'Delete Permanently'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {confirmDeleteMode === 'selected'
            ? (isAr
                ? `سيتم حذف ${selectedIds.length} مطالبة نهائياً، بما في ذلك أي دفعات جزئية مسجلة عليها. لا يمكن التراجع عن هذا الإجراء.`
                : `This will permanently delete ${selectedIds.length} payment record${selectedIds.length !== 1 ? 's' : ''}, including any partial-payment installments recorded on them. This cannot be undone.`)
            : (isAr
                ? `سيتم حذف جميع مطالبات ${monthOptions.find(m => m.value === currentMonth)?.label ?? currentMonth} ${currentYear} (${payments.length} مطالبة) نهائياً، بما في ذلك أي دفعات جزئية مسجلة عليها. لا يمكن التراجع عن هذا الإجراء.`
                : `This will permanently delete ALL payments for ${monthOptions.find(m => m.value === currentMonth)?.label ?? currentMonth} ${currentYear} (${payments.length} record${payments.length !== 1 ? 's' : ''}), including any partial-payment installments recorded on them. This cannot be undone.`)}
        </p>
      </Modal>
    </div>
  )
}