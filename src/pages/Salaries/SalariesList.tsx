import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSalariesStore } from '../../store/useSalariesStore.js'
import { Card } from '../../components/ui/Card.js'
import { Stat } from '../../components/ui/Stat.js'
import { Button } from '../../components/ui/Button.js'
import { Table } from '../../components/ui/Table.js'
import { Badge } from '../../components/ui/Badge.js'
import { Alert } from '../../components/ui/Alert.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Modal } from '../../components/ui/Modal.js'
import { useExport } from '../../hooks/useExport.js'
import { useNavigate } from 'react-router-dom'
import type { Employee, SalaryPayment } from '../../types/index.js'

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030]

export default function SalariesList() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { exportSalaries } = useExport()

  const {
    employees,
    salaryPayments,
    isLoading,
    error,
    currentMonth,
    currentYear,
    setPeriod,
    fetchEmployees,
    addEmployee,
    updateEmployee,
    deactivateEmployee,
    updateSalaryPayment,
    clearError
  } = useSalariesStore()

  // State
  const [activeTab, setActiveTab] = useState<'payroll' | 'employees'>('payroll')
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  // Employee Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [deactivatingEmployee, setDeactivatingEmployee] = useState<Employee | null>(null)

  // Form Fields for Add/Edit Employee
  const [empName, setEmpName] = useState('')
  const [empRole, setEmpRole] = useState('')
  const [empBaseSalary, setEmpBaseSalary] = useState('0')
  const [empHousing, setEmpHousing] = useState('0')
  const [empTransport, setEmpTransport] = useState('0')
  const [formError, setFormError] = useState<string | null>(null)

  // Inline Editing for Payroll
  const [editingPayrollId, setEditingPayrollId] = useState<number | null>(null)
  const [bonus, setBonus] = useState('0')
  const [payDate, setPayDate] = useState('')
  const [notes, setNotes] = useState('')

  // Deductions modal
  const [deductionsRow, setDeductionsRow] = useState<SalaryPayment | null>(null)
  const [deductionItems, setDeductionItems] = useState<any[]>([])
  const [newDeductionReason, setNewDeductionReason] = useState('')
  const [newDeductionAmount, setNewDeductionAmount] = useState('')
  const [savingDeduction, setSavingDeduction] = useState(false)

  // Load initial data
  useEffect(() => {
    fetchEmployees()
    setPeriod(currentMonth, currentYear)
  }, [])

  // Localized currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount)
  }

  // Month select options
  const monthOptions = useMemo(() => {
    return arabicMonths.map((m, idx) => ({
      value: m,
      label: i18n.language === 'ar' ? m : englishMonths[idx]
    }))
  }, [i18n.language])

  const yearOptions = useMemo(() => {
    return yearsList.map((y) => ({
      value: y,
      label: y.toString()
    }))
  }, [])

  // Calculate monthly total payroll sum
  const totalPayrollInvoiced = useMemo(() => {
    return salaryPayments.reduce((sum, p) => sum + p.actual_paid, 0)
  }, [salaryPayments])

  // Open modals
  const openAddModal = () => {
    setEmpName('')
    setEmpRole('')
    setEmpBaseSalary('0')
    setEmpHousing('0')
    setEmpTransport('0')
    setFormError(null)
    setIsAddModalOpen(true)
  }

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp)
    setEmpName(emp.name)
    setEmpRole(emp.role)
    setEmpBaseSalary(emp.base_salary.toString())
    setEmpHousing(emp.housing.toString())
    setEmpTransport(emp.transport.toString())
    setFormError(null)
  }

  // Submit Add Employee
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!empName.trim() || !empRole.trim()) {
      setFormError(t('all_fields_required') || 'Missing required fields')
      return
    }

    const base = Number(empBaseSalary)
    const house = Number(empHousing)
    const trans = Number(empTransport)

    if (isNaN(base) || base < 0 || isNaN(house) || house < 0 || isNaN(trans) || trans < 0) {
      setFormError(i18n.language === 'ar' ? 'يجب إدخال قيم مالية صالحة' : 'Invalid monetary values')
      return
    }

    const res = await addEmployee({
      name: empName.trim(),
      role: empRole.trim(),
      base_salary: base,
      housing: house,
      transport: trans
    })

    if (res) {
      setIsAddModalOpen(false)
      // Refresh payroll list since new employee is added
      setPeriod(currentMonth, currentYear)
    }
  }

  // Submit Edit Employee
  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!editingEmployee) return

    if (!empName.trim() || !empRole.trim()) {
      setFormError(t('all_fields_required') || 'Missing required fields')
      return
    }

    const base = Number(empBaseSalary)
    const house = Number(empHousing)
    const trans = Number(empTransport)

    if (isNaN(base) || base < 0 || isNaN(house) || house < 0 || isNaN(trans) || trans < 0) {
      setFormError(i18n.language === 'ar' ? 'يجب إدخال قيم مالية صالحة' : 'Invalid monetary values')
      return
    }

    const res = await updateEmployee(editingEmployee.id, {
      name: empName.trim(),
      role: empRole.trim(),
      base_salary: base,
      housing: house,
      transport: trans
    })

    if (res) {
      setEditingEmployee(null)
      // Refresh payroll list
      setPeriod(currentMonth, currentYear)
    }
  }

  // Confirm Deactivate
  const handleConfirmDeactivate = async () => {
    if (!deactivatingEmployee) return
    const success = await deactivateEmployee(deactivatingEmployee.id)
    if (success) {
      setDeactivatingEmployee(null)
      setPeriod(currentMonth, currentYear)
    }
  }

  // Open deductions modal
  const openDeductions = async (row: SalaryPayment) => {
    setDeductionsRow(row)
    setNewDeductionReason('')
    setNewDeductionAmount('')
    const items = await window.api.deductions.list({ employee_id: row.employee_id, month: currentMonth, year: currentYear })
    setDeductionItems(items)
  }

  const handleAddDeduction = async () => {
    if (!deductionsRow) return
    const amt = Number(newDeductionAmount)
    if (!newDeductionReason.trim() || isNaN(amt) || amt <= 0) return
    setSavingDeduction(true)
    try {
      const item = await window.api.deductions.add({
        employee_id: deductionsRow.employee_id,
        month: currentMonth,
        year: currentYear,
        reason: newDeductionReason.trim(),
        amount: amt
      })
      setDeductionItems(prev => [...prev, item])
      setNewDeductionReason('')
      setNewDeductionAmount('')
      // Refresh payroll to update deductions total
      setPeriod(currentMonth, currentYear)
    } finally {
      setSavingDeduction(false)
    }
  }

  const handleRemoveDeduction = async (id: number) => {
    await window.api.deductions.remove({ id })
    setDeductionItems(prev => prev.filter(d => d.id !== id))
    setPeriod(currentMonth, currentYear)
  }

  // Start Inline Editing for Payroll
  const startEditPayroll = (row: SalaryPayment) => {
    setEditingPayrollId(row.id)
    setBonus(row.bonus.toString())
    setPayDate(row.paid_date || '')
    setNotes(row.notes || '')
  }

  // Save Inline Payroll
  const savePayroll = async (row: SalaryPayment) => {
    const bNum = Number(bonus)
    if (isNaN(bNum) || bNum < 0) {
      alert(i18n.language === 'ar' ? 'القيم المدخلة غير صحيحة' : 'Invalid values entered')
      return
    }

    const res = await updateSalaryPayment({
      employee_id: row.employee_id,
      month: currentMonth,
      year: currentYear,
      bonus: bNum,
      deductions: 0, // computed from employee_deductions table on server
      paid_date: payDate || null,
      notes: notes || null
    })

    if (res) {
      setEditingPayrollId(null)
    }
  }

  // Handle Export
  const handleExport = async (format: 'xlsx' | 'pdf') => {
    if (format === 'xlsx') {
      setIsExportingExcel(true)
    } else {
      setIsExportingPdf(true)
    }

    try {
      await exportSalaries(currentMonth, currentYear, format)
    } catch (err) {
      console.error(err)
    } finally {
      setIsExportingExcel(false)
      setIsExportingPdf(false)
    }
  }

  // Payroll columns
  const payrollColumns = [
    {
      key: 'name',
      header: i18n.language === 'ar' ? 'الموظف' : 'Employee',
      render: (row: SalaryPayment) => (
        <div>
          <div className="font-semibold text-slate-900">{row.employee_name}</div>
          <div className="text-xs text-slate-400">{row.employee_role}</div>
          {(row as any).salary_type_name && (
            <div className="text-xs text-primary font-medium mt-0.5">{(row as any).salary_type_name}</div>
          )}
          {(row as any).payable_sessions != null && (
            <div className="text-xs text-slate-400">{i18n.language === 'ar' ? `جلسات: ${(row as any).payable_sessions}/${(row as any).total_sessions}` : `Sessions: ${(row as any).payable_sessions}/${(row as any).total_sessions}`}</div>
          )}
        </div>
      )
    },
    {
      key: 'net_salary',
      header: i18n.language === 'ar' ? 'الراتب المستحق' : 'Net Salary',
      render: (row: SalaryPayment) => <span>{formatCurrency(row.net_salary ?? 0)}</span>,
      className: 'text-end'
    },
    {
      key: 'bonus',
      header: i18n.language === 'ar' ? 'مكافآت' : 'Bonus',
      render: (row: SalaryPayment) => {
        if (editingPayrollId === row.id) {
          return (
            <input
              type="number"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              className="w-20 px-2 py-1 text-sm border rounded text-end font-mono"
            />
          )
        }
        return <span className="font-mono text-emerald-600 font-medium">+{formatCurrency(row.bonus)}</span>
      },
      className: 'text-end'
    },
    {
      key: 'deductions',
      header: i18n.language === 'ar' ? 'الاستقطاعات' : 'Deductions',
      render: (row: SalaryPayment) => (
        <div className="flex flex-col items-end gap-1">
          {row.deductions > 0 && (
            <span className="font-mono text-red-600 font-medium text-xs">-{formatCurrency(row.deductions)}</span>
          )}
          <button
            onClick={() => openDeductions(row)}
            className="text-xs text-primary hover:underline font-medium"
          >
            {i18n.language === 'ar' ? '+ إدارة' : '+ Manage'}
          </button>
        </div>
      ),
      className: 'text-end'
    },
    {
      key: 'actual_paid',
      header: i18n.language === 'ar' ? 'المدفوع الفعلي' : 'Actual Paid',
      render: (row: SalaryPayment) => {
        if (editingPayrollId === row.id) {
          const preview = (row.net_salary ?? 0) + (Number(bonus) || 0) - (row.deductions ?? 0)
          return <span className="font-bold text-slate-900 font-mono">{formatCurrency(preview)}</span>
        }
        return <span className="font-bold text-slate-900 font-mono">{formatCurrency(row.actual_paid)}</span>
      },
      className: 'text-end'
    },
    {
      key: 'paid_date',
      header: i18n.language === 'ar' ? 'تاريخ الصرف' : 'Pay Date',
      render: (row: SalaryPayment) => {
        if (editingPayrollId === row.id) {
          return (
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="px-2 py-1 text-sm border rounded font-mono"
            />
          )
        }
        return <span className="text-slate-500 font-mono">{row.paid_date || '—'}</span>
      },
      className: 'text-center'
    },
    {
      key: 'notes',
      header: t('notes'),
      render: (row: SalaryPayment) => {
        if (editingPayrollId === row.id) {
          return (
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-32 px-2 py-1 text-sm border rounded"
            />
          )
        }
        return <span className="text-slate-400 block truncate max-w-xs">{row.notes || '—'}</span>
      }
    },
    {
      key: 'actions',
      header: '',
      render: (row: SalaryPayment) => {
        if (editingPayrollId === row.id) {
          return (
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => savePayroll(row)}>
                {i18n.language === 'ar' ? 'حفظ' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingPayrollId(null)}>
                {i18n.language === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
            </div>
          )
        }
        return (
          <Button size="sm" variant="outline" onClick={() => startEditPayroll(row)}>
            ✏️ {i18n.language === 'ar' ? 'تسجيل الصرف' : 'Edit Payroll'}
          </Button>
        )
      },
      className: 'text-center'
    }
  ]

  // Employee directory columns
  const employeeColumns = [
    {
      key: 'name',
      header: i18n.language === 'ar' ? 'الاسم' : 'Name',
      render: (row: Employee) => <span className="font-semibold text-slate-900">{row.name}</span>
    },
    {
      key: 'role',
      header: i18n.language === 'ar' ? 'الوظيفة' : 'Role',
      render: (row: Employee) => <span>{row.role}</span>
    },
    {
      key: 'base_salary',
      header: i18n.language === 'ar' ? 'الراتب الأساسي' : 'Base Salary',
      render: (row: Employee) => <span>{formatCurrency(row.base_salary)}</span>,
      className: 'text-end'
    },
    {
      key: 'housing',
      header: i18n.language === 'ar' ? 'بدل سكن' : 'Housing Allow.',
      render: (row: Employee) => <span>{formatCurrency(row.housing)}</span>,
      className: 'text-end'
    },
    {
      key: 'transport',
      header: i18n.language === 'ar' ? 'بدل انتقال' : 'Transport Allow.',
      render: (row: Employee) => <span>{formatCurrency(row.transport)}</span>,
      className: 'text-end'
    },
    {
      key: 'net_salary',
      header: i18n.language === 'ar' ? 'صافي الراتب المستحق' : 'Net Salary',
      render: (row: Employee) => <span className="font-bold text-slate-800">{formatCurrency(row.net_salary)}</span>,
      className: 'text-end'
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: Employee) => (
        <Badge variant={row.is_active ? 'success' : 'danger'}>
          {row.is_active
            ? (i18n.language === 'ar' ? 'نشط' : 'Active')
            : (i18n.language === 'ar' ? 'غير نشط' : 'Inactive')}
        </Badge>
      ),
      className: 'text-center'
    },
    {
      key: 'actions',
      header: '',
      render: (row: Employee) => (
        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
            ✏️ {i18n.language === 'ar' ? 'تعديل' : 'Edit'}
          </Button>
          {row.is_active === 1 && (
            <Button size="sm" variant="outline" onClick={() => setDeactivatingEmployee(row)}>
              ❌ {i18n.language === 'ar' ? 'إلغاء تنشيط' : 'Deactivate'}
            </Button>
          )}
        </div>
      )
    }
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Top Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{i18n.language === 'ar' ? 'إدارة رواتب الموظفين' : 'Staff Salaries Management'}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {i18n.language === 'ar'
              ? 'إدارة سجلات الموظفين وصرف رواتبهم الشهرية والبدلات والمكافآت.'
              : 'Manage employee profiles, monthly payroll distributions, bonuses, and allowances.'}
          </p>
        </div>

        {/* Tab Selector & Export Buttons */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
          <Button variant="outline" onClick={() => navigate('/salaries/payroll-report')}>
            📊 {i18n.language === 'ar' ? 'تقرير رواتب المعلمين' : 'Teacher Payroll Report'}
          </Button>
          {/* Tab Switcher */}
          <div className="bg-slate-100 p-1 rounded-lg flex self-start">
            <button
              onClick={() => setActiveTab('payroll')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'payroll'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              💵 {i18n.language === 'ar' ? 'المسيرات الشهرية' : 'Monthly Payroll'}
            </button>
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === 'employees'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              👥 {i18n.language === 'ar' ? 'دليل الموظفين' : 'Employee Directory'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {activeTab === 'payroll' && salaryPayments.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleExport('xlsx')}
                  isLoading={isExportingExcel}
                  disabled={isExportingPdf}
                >
                  📊 {i18n.language === 'ar' ? 'تصدير إكسل' : 'Excel Export'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('pdf')}
                  isLoading={isExportingPdf}
                  disabled={isExportingExcel}
                >
                  📕 {i18n.language === 'ar' ? 'تصدير PDF' : 'PDF Export'}
                </Button>
              </>
            )}
            {activeTab === 'employees' && (
              <Button variant="primary" onClick={openAddModal}>
                ➕ {i18n.language === 'ar' ? 'إضافة موظف جديد' : 'Add Employee'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* View Rendering based on Active Tab */}
      {activeTab === 'payroll' ? (
        <div className="space-y-6">
          {/* Filters & KPI Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2">
                📅 {i18n.language === 'ar' ? 'فترة مسير الرواتب' : 'Payroll Period'}
              </h3>
              <div className="space-y-3">
                <Select
                  label={t('select_month')}
                  value={currentMonth}
                  options={monthOptions}
                  onChange={(e) => setPeriod(e.target.value, currentYear)}
                />
                <Select
                  label={t('select_year')}
                  value={currentYear.toString()}
                  options={yearOptions}
                  onChange={(e) => setPeriod(currentMonth, Number(e.target.value))}
                />
              </div>
            </Card>

            <div className="lg:col-span-3">
              <Stat
                title={i18n.language === 'ar' ? 'إجمالي منصرف الرواتب للمسير' : 'Total Payroll Paid'}
                value={formatCurrency(totalPayrollInvoiced)}
                icon="💵"
                description={i18n.language === 'ar' ? `لشهر ${currentMonth} ${currentYear}` : `For the period of ${currentMonth} ${currentYear}`}
              />
            </div>
          </div>

          {/* Payroll Table */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800">
              📋 {i18n.language === 'ar' ? `مسير رواتب شهر ${currentMonth} ${currentYear}` : `Payroll Distribution ${currentMonth} ${currentYear}`}
            </h3>
            <Table
              columns={payrollColumns}
              data={salaryPayments}
              keyExtractor={(row) => row.id.toString()}
              emptyMessage={i18n.language === 'ar' ? 'لا يوجد موظفون مسجلون لتسجيل رواتبهم.' : 'No employees available to distribute payroll.'}
              isLoading={isLoading}
            />
          </div>
        </div>
      ) : (
        /* Staff Directory View */
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-800">
            👥 {i18n.language === 'ar' ? 'قائمة الموظفين' : 'All Staff Members'}
          </h3>
          <Table
            columns={employeeColumns}
            data={employees}
            keyExtractor={(row) => row.id.toString()}
            emptyMessage={i18n.language === 'ar' ? 'لا يوجد موظفون مسجلون بعد.' : 'No employees registered in directory.'}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={i18n.language === 'ar' ? 'إضافة موظف جديد' : 'Register New Employee'}
      >
        <form onSubmit={handleAddEmployee} className="space-y-4 mt-2">
          {formError && <Alert variant="danger" title={t('error')}>{formError}</Alert>}

          <Input
            label={i18n.language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
            value={empName}
            onChange={(e) => setEmpName(e.target.value)}
            required
          />

          <Input
            label={i18n.language === 'ar' ? 'الدور / المسمى الوظيفي' : 'Job Title / Role'}
            value={empRole}
            onChange={(e) => setEmpRole(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label={i18n.language === 'ar' ? 'الراتب الأساسي' : 'Base Salary'}
              type="number"
              value={empBaseSalary}
              onChange={(e) => setEmpBaseSalary(e.target.value)}
              required
            />
            <Input
              label={i18n.language === 'ar' ? 'بدل سكن' : 'Housing'}
              type="number"
              value={empHousing}
              onChange={(e) => setEmpHousing(e.target.value)}
            />
            <Input
              label={i18n.language === 'ar' ? 'بدل انتقال' : 'Transport'}
              type="number"
              value={empTransport}
              onChange={(e) => setEmpTransport(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              {i18n.language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {i18n.language === 'ar' ? 'حفظ الموظف' : 'Register Employee'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        isOpen={editingEmployee !== null}
        onClose={() => setEditingEmployee(null)}
        title={i18n.language === 'ar' ? 'تعديل بيانات الموظف' : 'Edit Employee Details'}
      >
        <form onSubmit={handleEditEmployee} className="space-y-4 mt-2">
          {formError && <Alert variant="danger" title={t('error')}>{formError}</Alert>}

          <Input
            label={i18n.language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
            value={empName}
            onChange={(e) => setEmpName(e.target.value)}
            required
          />

          <Input
            label={i18n.language === 'ar' ? 'الدور / المسمى الوظيفي' : 'Job Title / Role'}
            value={empRole}
            onChange={(e) => setEmpRole(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label={i18n.language === 'ar' ? 'الراتب الأساسي' : 'Base Salary'}
              type="number"
              value={empBaseSalary}
              onChange={(e) => setEmpBaseSalary(e.target.value)}
              required
            />
            <Input
              label={i18n.language === 'ar' ? 'بدل سكن' : 'Housing'}
              type="number"
              value={empHousing}
              onChange={(e) => setEmpHousing(e.target.value)}
            />
            <Input
              label={i18n.language === 'ar' ? 'بدل انتقال' : 'Transport'}
              type="number"
              value={empTransport}
              onChange={(e) => setEmpTransport(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" type="button" onClick={() => setEditingEmployee(null)}>
              {i18n.language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {i18n.language === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deductions Modal */}
      <Modal
        isOpen={deductionsRow !== null}
        onClose={() => setDeductionsRow(null)}
        title={i18n.language === 'ar'
          ? `استقطاعات — ${deductionsRow?.employee_name}`
          : `Deductions — ${deductionsRow?.employee_name}`}
      >
        <div className="space-y-4 mt-2">
          {/* Existing deduction items */}
          {deductionItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              {i18n.language === 'ar' ? 'لا توجد استقطاعات لهذا الشهر' : 'No deductions this month'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {deductionItems.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{d.reason}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-red-600 font-semibold text-sm">
                      -{new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP' }).format(d.amount)}
                    </span>
                    <button
                      onClick={() => handleRemoveDeduction(d.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors text-sm"
                      title={i18n.language === 'ar' ? 'حذف' : 'Remove'}
                    >🗑️</button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2 bg-slate-50 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500">{i18n.language === 'ar' ? 'إجمالي الاستقطاعات' : 'Total Deductions'}</span>
                <span className="font-mono font-bold text-red-700 text-sm">
                  -{new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP' }).format(
                    deductionItems.reduce((s, d) => s + d.amount, 0)
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Add new deduction */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">
              {i18n.language === 'ar' ? 'إضافة استقطاع جديد' : 'Add New Deduction'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDeductionReason}
                onChange={(e) => setNewDeductionReason(e.target.value)}
                placeholder={i18n.language === 'ar' ? 'السبب (مثل: غياب، سلفة...)' : 'Reason (e.g., absence, loan...)'}
                className="flex-1 text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleAddDeduction()}
              />
              <input
                type="number"
                min="1"
                value={newDeductionAmount}
                onChange={(e) => setNewDeductionAmount(e.target.value)}
                placeholder={i18n.language === 'ar' ? 'المبلغ' : 'Amount'}
                className="w-28 text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary font-mono"
                onKeyDown={(e) => e.key === 'Enter' && handleAddDeduction()}
              />
              <Button variant="primary" size="sm" onClick={handleAddDeduction} isLoading={savingDeduction} disabled={!newDeductionReason.trim() || !newDeductionAmount}>
                {i18n.language === 'ar' ? '+ إضافة' : '+ Add'}
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setDeductionsRow(null)}>
              {i18n.language === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={deactivatingEmployee !== null}
        onClose={() => setDeactivatingEmployee(null)}
        title={i18n.language === 'ar' ? 'تأكيد إلغاء تنشيط الموظف' : 'Deactivate Employee'}
      >
        <div className="space-y-4 mt-2">
          <p className="text-slate-600 text-sm">
            {i18n.language === 'ar'
              ? `هل أنت متأكد من إلغاء تنشيط حساب الموظف "${deactivatingEmployee?.name}"؟ لن يتم إدراجه في مسيرات الرواتب الجديدة تلقائياً، ولكن سيتم الاحتفاظ بكافة بياناته وسجلاته التاريخية.`
              : `Are you sure you want to deactivate employee "${deactivatingEmployee?.name}"? They will not be automatically included in future monthly payroll runs, but all historical salary payments will be preserved.`}
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" onClick={() => setDeactivatingEmployee(null)}>
              {i18n.language === 'ar' ? 'تراجع' : 'Back'}
            </Button>
            <Button variant="danger" onClick={handleConfirmDeactivate}>
              {i18n.language === 'ar' ? 'نعم، إلغاء تنشيط' : 'Yes, Deactivate'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}