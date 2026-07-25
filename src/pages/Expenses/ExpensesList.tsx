import { useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useExpensesStore, arabicMonths } from '../../store/useExpensesStore.js'
import { useSalariesStore } from '../../store/useSalariesStore.js'
import { Card } from '../../components/ui/Card.js'
import { Stat } from '../../components/ui/Stat.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Modal } from '../../components/ui/Modal.js'
import { useExport } from '../../hooks/useExport.js'
import type { Expense } from '../../types/index.js'
import { ReportActions } from '../../components/reports/ReportActions.js'

const englishMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export default function ExpensesList() {
  const { t, i18n } = useTranslation()
  const { exportExpenses } = useExport()

  const {
    expenses,
    isLoading,
    error,
    currentYear,
    setYear,
    fetchExpenses,
    updateExpense,
    addItem,
    removeItem,
    clearError,
    getDistinctItems,
    getItemTotal,
    getMonthTotal,
    getGrandTotal
  } = useExpensesStore()

  // Salaries store for combined total (T070)
  const { salaryPayments, fetchSalaryPayments } = useSalariesStore()

  // Add Item Modal
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'ثابت' | 'متغير' | ''>('ثابت')
  const [formError, setFormError] = useState<string | null>(null)

  // Remove Item Confirm
  const [removingItem, setRemovingItem] = useState<string | null>(null)

  // Inline cell editing
  const [editingCell, setEditingCell] = useState<{ item: string; month: string } | null>(null)
  const [editAmount, setEditAmount] = useState('0')

  // Load initial data
  useEffect(() => {
    fetchExpenses()
  }, [])

  // Also fetch current-month salary payments for combined total display
  useEffect(() => {
    fetchSalaryPayments()
  }, [])

  const isAr = i18n.language === 'ar'

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP'
    }).format(amount)

  const yearOptions = useMemo(() =>
    yearsList.map((y) => ({ value: y, label: y.toString() })),
    []
  )

  // Derived data
  const distinctItems = useMemo(() => getDistinctItems(), [expenses])
  const grandTotal = useMemo(() => getGrandTotal(), [expenses])

  // Monthly salary total for the selected year (across all months)
  const annualSalaryTotal = useMemo(() => {
    // We don't have annual salary data in store (only current month), so show what we have
    return salaryPayments.reduce((s, p) => s + p.actual_paid, 0)
  }, [salaryPayments])

  // Combined operational total
  const combinedTotal = grandTotal + annualSalaryTotal

  const getCell = useCallback(
    (item: string, month: string): Expense | undefined => {
      return expenses.find((e) => e.item === item && e.month === month)
    },
    [expenses]
  )

  const startEdit = (item: string, month: string) => {
    const cell = getCell(item, month)
    setEditingCell({ item, month })
    setEditAmount((cell?.amount ?? 0).toString())
  }

  const saveEdit = async () => {
    if (!editingCell) return
    const amount = Number(editAmount)
    if (isNaN(amount) || amount < 0) {
      alert(isAr ? 'قيمة غير صحيحة' : 'Invalid value')
      return
    }
    await updateExpense({
      item: editingCell.item,
      month: editingCell.month,
      year: currentYear,
      amount
    })
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!newItemName.trim()) {
      setFormError(isAr ? 'اسم البند مطلوب' : 'Item name is required')
      return
    }
    const ok = await addItem({ item: newItemName.trim(), category: newItemCategory.trim() || null })
    if (ok) {
      setIsAddItemModalOpen(false)
      setNewItemName('')
      setNewItemCategory('')
    }
  }

  const handleRemoveItem = async () => {
    if (!removingItem) return
    await removeItem(removingItem)
    setRemovingItem(null)
  }

  const handleExport = async (format: 'xlsx' | 'pdf' | 'csv') => {
    try {
      await exportExpenses(currentYear, format)
    } catch (err) {
      console.error(err)
    }
  }

  const handlePrint = async () => {
    const { html } = await window.api.print.preview({ reportType: 'expenses', year: currentYear, lang: i18n.language })
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
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'إدارة المصروفات التشغيلية' : 'Operational Expenses'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? 'تسجيل وتتبع مصروفات المنشأة الشهرية والسنوية مع إجمالي التكاليف التشغيلية الكاملة.'
              : 'Track monthly and annual facility expenses with combined operational cost totals.'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select
            label={isAr ? 'السنة' : 'Year'}
            value={currentYear.toString()}
            options={yearOptions}
            onChange={(e) => setYear(Number(e.target.value))}
          />

          {expenses.length > 0 && (
            <ReportActions
              onPrint={handlePrint}
              onExportPdf={() => handleExport('pdf')}
              onExportExcel={() => handleExport('xlsx')}
              onExportCsv={() => handleExport('csv')}
            />
          )}

          <Button variant="primary" onClick={() => {
            setNewItemName('')
            setNewItemCategory('ثابت')
            setFormError(null)
            setIsAddItemModalOpen(true)
          }}>
            ➕ {isAr ? 'إضافة بند' : 'Add Item'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Stat
          title={isAr ? 'إجمالي المصروفات السنوية' : 'Annual Expenses Total'}
          value={formatCurrency(grandTotal)}
          icon="💸"
          description={isAr ? `لعام ${currentYear}` : `For year ${currentYear}`}
        />
        <Stat
          title={isAr ? 'إجمالي الرواتب (هذا الشهر)' : 'Salary Total (current month)'}
          value={formatCurrency(annualSalaryTotal)}
          icon="💵"
          description={isAr ? 'بناءً على بيانات المسير الحالي' : 'Based on current payroll data'}
        />
        <Stat
          title={isAr ? 'إجمالي التكاليف التشغيلية المدمجة' : 'Combined Operational Total'}
          value={formatCurrency(combinedTotal)}
          icon="📊"
          description={isAr ? 'مصروفات + رواتب' : 'Expenses + Salaries'}
        />
      </div>

      {/* Expenses Grid */}
      {isLoading && distinctItems.length === 0 ? (
        <div className="flex justify-center py-12 text-slate-400">
          <span>{isAr ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : distinctItems.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-4xl mb-3">💡</div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            {isAr ? 'لا توجد بنود مصروفات بعد' : 'No expense items yet'}
          </h3>
          <p className="text-slate-400 text-sm mb-4">
            {isAr
              ? 'أضف بنود المصروفات كالإيجار والكهرباء والمياه لتتبعها شهرياً.'
              : 'Add expense items like rent, electricity, and water to track them monthly.'}
          </p>
          <Button variant="primary" onClick={() => {
            setNewItemName('')
            setNewItemCategory('ثابت')
            setFormError(null)
            setIsAddItemModalOpen(true)
          }}>
            ➕ {isAr ? 'إضافة بند جديد' : 'Add First Item'}
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-start font-semibold text-slate-600 min-w-[140px]">
                    {isAr ? 'البند' : 'Item'}
                  </th>
                  {arabicMonths.map((month, idx) => (
                    <th
                      key={month}
                      className="px-2 py-3 text-center font-semibold text-slate-600 min-w-[90px]"
                    >
                      {isAr ? month : englishMonths[idx]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-end font-bold text-slate-700 min-w-[110px] bg-slate-100">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                  <th className="px-4 py-3 min-w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {distinctItems.map((item, rowIdx) => {
                  const itemTotal = getItemTotal(item)
                  const firstExpense = expenses.find((e) => e.item === item)
                  const category = firstExpense?.category

                  return (
                    <tr
                      key={item}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${
                        rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-800">{item}</div>
                        {category && (
                          <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mt-0.5 ${
                            category === 'ثابت'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {category === 'ثابت' ? (isAr ? 'ثابت' : 'Fixed') : (isAr ? 'متغير' : 'Variable')}
                          </span>
                        )}
                      </td>
                      {arabicMonths.map((month) => {
                        const cell = getCell(item, month)
                        const amount = cell?.amount ?? 0
                        const isEditing =
                          editingCell?.item === item && editingCell?.month === month

                        return (
                          <td key={month} className="px-2 py-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit()
                                    if (e.key === 'Escape') cancelEdit()
                                  }}
                                  autoFocus
                                  className="w-20 px-1.5 py-1 text-xs border border-primary-300 rounded text-end font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                                <button
                                  onClick={saveEdit}
                                  className="text-emerald-600 hover:text-emerald-800 font-bold text-xs"
                                  title="Save"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-slate-400 hover:text-slate-600 text-xs"
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(item, month)}
                                className={`font-mono text-xs px-2 py-1 rounded hover:bg-primary-50 hover:text-primary-700 transition-colors ${
                                  amount > 0 ? 'text-slate-700 font-semibold' : 'text-slate-300'
                                }`}
                                title={isAr ? 'انقر للتعديل' : 'Click to edit'}
                              >
                                {amount > 0
                                  ? new Intl.NumberFormat('en-US').format(amount)
                                  : '—'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-end">
                        <span className="font-bold text-slate-800 font-mono text-xs">
                          {formatCurrency(itemTotal)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => setRemovingItem(item)}
                          className="text-slate-300 hover:text-red-500 transition-colors text-base"
                          title={isAr ? 'حذف البند' : 'Remove item'}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td className="px-4 py-3 font-bold text-slate-700">
                    {isAr ? 'الإجمالي الشهري' : 'Monthly Total'}
                  </td>
                  {arabicMonths.map((month) => {
                    const monthTotal = getMonthTotal(month)
                    return (
                      <td key={month} className="px-2 py-3 text-center">
                        <span className={`font-mono font-bold text-xs ${monthTotal > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                          {monthTotal > 0
                            ? new Intl.NumberFormat('en-US').format(monthTotal)
                            : '—'}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-end">
                    <span className="font-bold text-primary-700 font-mono text-sm">
                      {formatCurrency(grandTotal)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Combined Total Banner (T070) */}
      {distinctItems.length > 0 && (
        <Card className="p-5 bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-2xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📊</span>
              <div>
                <p className="text-slate-300 text-sm font-medium">
                  {isAr ? 'إجمالي التكاليف التشغيلية المدمجة' : 'Combined Operational Cost'}
                </p>
                <p className="text-white text-xs opacity-70">
                  {isAr ? 'مصروفات تشغيلية + رواتب الموظفين' : 'Operational expenses + staff salaries'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-slate-400 text-xs">{isAr ? 'مصروفات' : 'Expenses'}</p>
                <p className="text-white font-bold font-mono">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="text-slate-500 text-xl">+</div>
              <div className="text-center">
                <p className="text-slate-400 text-xs">{isAr ? 'رواتب' : 'Salaries'}</p>
                <p className="text-white font-bold font-mono">{formatCurrency(annualSalaryTotal)}</p>
              </div>
              <div className="text-slate-500 text-xl">=</div>
              <div className="text-center">
                <p className="text-slate-400 text-xs">{isAr ? 'الإجمالي' : 'Total'}</p>
                <p className="text-emerald-400 text-2xl font-bold font-mono">{formatCurrency(combinedTotal)}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Add Item Modal */}
      <Modal
        isOpen={isAddItemModalOpen}
        onClose={() => setIsAddItemModalOpen(false)}
        title={isAr ? 'إضافة بند مصروف جديد' : 'Add New Expense Item'}
      >
        <form onSubmit={handleAddItem} className="space-y-4 mt-2">
          {formError && <Alert variant="danger" title={t('error')}>{formError}</Alert>}

          <Input
            label={isAr ? 'اسم البند (مثل: إيجار، كهرباء، ماء)' : 'Item Name (e.g., Rent, Electricity, Water)'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            required
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">
              {isAr ? 'نوع المصروف' : 'Expense Type'}
            </label>
            <div className="flex gap-3">
              {(['ثابت', 'متغير'] as const).map((val) => (
                <label
                  key={val}
                  className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border-2 transition-colors ${
                    newItemCategory === val
                      ? 'border-primary bg-primary/5 text-primary font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="expense_type"
                    value={val}
                    checked={newItemCategory === val}
                    onChange={() => setNewItemCategory(val)}
                    className="sr-only"
                  />
                  <span>{val === 'ثابت' ? (isAr ? 'ثابت' : 'Fixed') : (isAr ? 'متغير' : 'Variable')}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsAddItemModalOpen(false)}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" isLoading={isLoading}>
              {isAr ? 'إضافة البند' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove Item Confirm Modal */}
      <Modal
        isOpen={removingItem !== null}
        onClose={() => setRemovingItem(null)}
        title={isAr ? 'تأكيد حذف البند' : 'Confirm Remove Item'}
      >
        <div className="space-y-4 mt-2">
          <p className="text-slate-600 text-sm">
            {isAr
              ? `هل أنت متأكد من حذف بند "${removingItem}" وجميع بياناته من جميع السنوات؟ هذه العملية لا يمكن التراجع عنها.`
              : `Are you sure you want to remove item "${removingItem}" and all its data across all years? This cannot be undone.`}
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" onClick={() => setRemovingItem(null)}>
              {isAr ? 'تراجع' : 'Back'}
            </Button>
            <Button variant="danger" onClick={handleRemoveItem} isLoading={isLoading}>
              {isAr ? 'نعم، حذف' : 'Yes, Remove'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}