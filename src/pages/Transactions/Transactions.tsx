import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTransactionsStore, type TransactionRange } from '../../store/useTransactionsStore.js'
import { Select } from '../../components/ui/Select.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import { Button } from '../../components/ui/Button.js'

export default function Transactions() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const {
    range, date, from, to, transactions, isLoading, error,
    setRange, setDate, setFrom, setTo, fetchTransactions,
  } = useTransactionsStore()

  // Client-side refinement over the fetched date-range results — search by child name and
  // narrow by service/type, since the backend only knows how to slice by date.
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    fetchTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, date, from, to])

  const rangeOptions = [
    { value: 'day', label: isAr ? 'يوم' : 'Day' },
    { value: 'week', label: isAr ? 'أسبوع' : 'Week' },
    { value: 'month', label: isAr ? 'شهر' : 'Month' },
    { value: 'custom', label: isAr ? 'فترة محددة' : 'Custom range' },
  ]

  const typeLabel = (type: string) => {
    if (type === 'payment') return isAr ? 'دفعة' : 'Payment'
    if (type === 'refund') return isAr ? 'استرداد' : 'Refund'
    return isAr ? 'مستحق' : 'Charge'
  }

  const serviceOptions = useMemo(() => {
    const names = Array.from(new Set(transactions.map((t) => t.service_name).filter(Boolean)))
    return [
      { value: '', label: isAr ? 'كل الخدمات' : 'All services' },
      ...names.map((name) => ({ value: name, label: name })),
    ]
  }, [transactions, isAr])

  const typeOptions = [
    { value: '', label: isAr ? 'كل الأنواع' : 'All types' },
    { value: 'payment', label: isAr ? 'دفعة' : 'Payment' },
    { value: 'charge', label: isAr ? 'مستحق' : 'Charge' },
    { value: 'refund', label: isAr ? 'استرداد' : 'Refund' },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return transactions.filter((t) => {
      if (q && !t.child_name?.toLowerCase().includes(q)) return false
      if (serviceFilter && t.service_name !== serviceFilter) return false
      if (typeFilter && t.type !== typeFilter) return false
      return true
    })
  }, [transactions, search, serviceFilter, typeFilter])

  const hasActiveFilters = search !== '' || serviceFilter !== '' || typeFilter !== ''
  const clearFilters = () => {
    setSearch('')
    setServiceFilter('')
    setTypeFilter('')
  }

  const total = filtered.reduce((sum, t) => sum + Number(t.amount || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        {isAr ? 'المعاملات المالية' : 'Transactions'}
      </h1>

      <div className="flex flex-wrap items-end gap-4 bg-white border border-slate-200/80 p-4 rounded-lg shadow-sm">
        <Select
          label={isAr ? 'الفترة' : 'Range'}
          value={range}
          onChange={(e) => setRange(e.target.value as TransactionRange)}
          options={rangeOptions}
        />
        {range === 'custom' ? (
          <>
            <Input type="date" label={isAr ? 'من' : 'From'} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" label={isAr ? 'إلى' : 'To'} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : (
          <Input type="date" label={isAr ? 'التاريخ' : 'Date'} value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4 bg-white border border-slate-200/80 p-4 rounded-lg shadow-sm">
        <Input
          label={isAr ? 'بحث باسم الطفل' : 'Search by child name'}
          placeholder={isAr ? 'اكتب اسم الطفل...' : 'Type a child name...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label={isAr ? 'الخدمة' : 'Service'}
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          options={serviceOptions}
        />
        <Select
          label={isAr ? 'النوع' : 'Type'}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={typeOptions}
        />
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters}>{isAr ? 'مسح الفلاتر' : 'Clear filters'}</Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="bg-white border border-slate-200/80 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead>
            <tr>
              <th className="px-4 py-2 text-start text-xs font-medium text-slate-500">{isAr ? 'الطفل' : 'Child'}</th>
              <th className="px-4 py-2 text-start text-xs font-medium text-slate-500">{isAr ? 'الخدمة' : 'Service'}</th>
              <th className="px-4 py-2 text-start text-xs font-medium text-slate-500">{isAr ? 'النوع' : 'Type'}</th>
              <th className="px-4 py-2 text-start text-xs font-medium text-slate-500">{isAr ? 'المبلغ' : 'Amount'}</th>
              <th className="px-4 py-2 text-start text-xs font-medium text-slate-500">{isAr ? 'التاريخ' : 'Date'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                {transactions.length === 0
                  ? (isAr ? 'لا توجد معاملات في هذه الفترة' : 'No transactions in this period')
                  : (isAr ? 'لا توجد نتائج مطابقة للفلاتر' : 'No transactions match the current filters')}
              </td></tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-sm text-slate-900">{t.child_name}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{t.service_name}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{typeLabel(t.type)}</td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">{Number(t.amount).toFixed(2)} {isAr ? 'ج.م' : 'EGP'}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">{t.date}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-slate-900">{isAr ? 'الإجمالي' : 'Total'}</td>
                <td className="px-4 py-2 text-sm font-semibold text-slate-900">{total.toFixed(2)} {isAr ? 'ج.م' : 'EGP'}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
