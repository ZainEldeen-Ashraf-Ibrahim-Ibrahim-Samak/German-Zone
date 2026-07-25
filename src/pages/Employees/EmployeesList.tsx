import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSalariesStore } from '../../store/useSalariesStore.js'
import { useRolesStore } from '../../store/useRolesStore.js'
import { useSalaryTypesStore } from '../../store/useSalaryTypesStore.js'
import { useExport } from '../../hooks/useExport.js'
import { SearchBar } from '../../components/ui/SearchBar.js'
import { Select } from '../../components/ui/Select.js'
import { Table } from '../../components/ui/Table.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Badge } from '../../components/ui/Badge.js'
import { Alert } from '../../components/ui/Alert.js'
import { Card } from '../../components/ui/Card.js'
import { Pagination } from '../../components/ui/Pagination.js'
import type { Employee } from '../../types/index.js'

type SortKey = 'name' | 'role' | 'base_salary' | 'net_salary' | 'is_active'
type SortOrder = 'asc' | 'desc'

const ITEMS_PER_PAGE = 10

export default function EmployeesList() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const fmt = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP' }).format(n || 0)

  const {
    employees,
    isLoading,
    error,
    fetchEmployees,
    addEmployee,
    updateEmployee,
    deactivateEmployee,
    clearError,
    currentMonth,
    currentYear,
  } = useSalariesStore()

  const { roles, fetchRoles, addRole } = useRolesStore()
  const { salaryTypes, fetchSalaryTypes } = useSalaryTypesStore()

  const [successMsg, setSuccessMsg] = useState('')

  // Filters / sort / pagination
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [currentPage, setCurrentPage] = useState(1)

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState<number | ''>('')
  const [salaryTypeOverrideId, setSalaryTypeOverrideId] = useState<number | ''>('')
  const [baseSalary, setBaseSalary] = useState('')
  const [housing, setHousing] = useState('')
  const [transport, setTransport] = useState('')
  const [teacherSessionRate, setTeacherSessionRate] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitLoading, setIsSubmitLoading] = useState(false)

  // Live forecast for the current payroll period (feature: salary type per child) — what this
  // employee has already earned this month plus a projection for their remaining scheduled
  // sessions. Read-only, computed on the fly; only meaningful for an existing employee.
  const [expectedSalary, setExpectedSalary] = useState<{ actual_to_date: number; projected_remaining: number; expected_total: number } | null>(null)
  const [isLoadingExpected, setIsLoadingExpected] = useState(false)

  // Inline add-new-role state
  const [showAddRole, setShowAddRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [isAddingRole, setIsAddingRole] = useState(false)

  // Deactivate confirm
  const [toDeactivate, setToDeactivate] = useState<Employee | null>(null)

  // Export
  const { exportEmployees } = useExport()
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    if (format === 'xlsx') setIsExportingExcel(true)
    else setIsExportingPdf(true)
    try {
      await exportEmployees(format)
    } catch (err) {
      console.error('Employee export failed:', err)
    } finally {
      setIsExportingExcel(false)
      setIsExportingPdf(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
    fetchRoles()
    fetchSalaryTypes()
  }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, roleFilter, statusFilter])

  // Distinct roles for the filter dropdown
  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set(employees.map((e) => e.role).filter(Boolean))).sort()
    return [
      { value: '', label: isAr ? 'جميع الوظائف' : 'All roles' },
      ...roles.map((r) => ({ value: r, label: r })),
    ]
  }, [employees, isAr])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (statusFilter === 'active' && e.is_active !== 1) return false
      if (roleFilter && e.role !== roleFilter) return false
      if (q && !(`${e.name} ${e.role}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [employees, search, roleFilter, statusFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal, i18n.language)
          : bVal.localeCompare(aVal, i18n.language)
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [filtered, sortKey, sortOrder, i18n.language])

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return sorted.slice(start, start + ITEMS_PER_PAGE)
  }, [sorted, currentPage])

  const totals = useMemo(() => {
    const active = employees.filter((e) => e.is_active === 1)
    return { count: active.length, payroll: active.reduce((s, e) => s + (e.net_salary || 0), 0) }
  }, [employees])

  const previewNet =
    (Number(baseSalary) || 0) + (Number(housing) || 0) + (Number(transport) || 0)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortOrder('asc') }
  }

  const sortHeader = (key: SortKey, label: string) => (
    <button onClick={() => handleSort(key)} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
      {label} {sortKey === key && (sortOrder === 'asc' ? '▲' : '▼')}
    </button>
  )

  const openCreate = () => {
    setEditing(null)
    setName(''); setRoleId(''); setSalaryTypeOverrideId('')
    setBaseSalary(''); setHousing(''); setTransport(''); setTeacherSessionRate('')
    setFormError(''); setShowAddRole(false); setNewRoleName('')
    setExpectedSalary(null)
    setIsFormOpen(true)
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setName(emp.name)
    setRoleId(emp.role_id ?? '')
    setSalaryTypeOverrideId(emp.salary_type_override_id ?? '')
    setBaseSalary(String(emp.base_salary)); setHousing(String(emp.housing)); setTransport(String(emp.transport))
    setTeacherSessionRate(emp.teacher_session_rate != null ? String(emp.teacher_session_rate) : '')
    setFormError(''); setShowAddRole(false); setNewRoleName('')
    setExpectedSalary(null)
    setIsLoadingExpected(true)
    window.api.salary.getExpected({ employee_id: emp.id, month: currentMonth, year: currentYear })
      .then(setExpectedSalary)
      .catch(() => setExpectedSalary(null))
      .finally(() => setIsLoadingExpected(false))
    setIsFormOpen(true)
  }

  const handleAddNewRole = async () => {
    if (!newRoleName.trim()) return
    setIsAddingRole(true)
    const result = await addRole(newRoleName.trim())
    setIsAddingRole(false)
    if (result) {
      setRoleId(result.id)
      setNewRoleName('')
      setShowAddRole(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setFormError('')
    if (!name.trim()) {
      setFormError(isAr ? 'الاسم مطلوب.' : 'Name is required.')
      return
    }
    if (!roleId) {
      setFormError(isAr ? 'يجب اختيار الوظيفة.' : 'Role is required.')
      return
    }
    setIsSubmitLoading(true)
    const payload: any = {
      name: name.trim(),
      role_id: Number(roleId),
      salary_type_override_id: salaryTypeOverrideId !== '' ? Number(salaryTypeOverrideId) : null,
      base_salary: Number(baseSalary) || 0,
      housing: Number(housing) || 0,
      transport: Number(transport) || 0,
      teacher_session_rate: teacherSessionRate !== '' ? Number(teacherSessionRate) : null,
    }
    const result = editing ? await updateEmployee(editing.id, payload) : await addEmployee(payload)
    setIsSubmitLoading(false)
    if (result) {
      setSuccessMsg(editing ? (isAr ? 'تم تحديث بيانات الموظف.' : 'Employee updated.') : (isAr ? 'تمت إضافة الموظف.' : 'Employee added.'))
      setIsFormOpen(false)
    }
  }

  // Roles without a salary type (FR-037 warning)
  const rolesWithoutSalaryType = useMemo(() => roles.filter((r) => r.salary_type_id == null), [roles])

  const confirmDeactivate = async () => {
    if (!toDeactivate) return
    const ok = await deactivateEmployee(toDeactivate.id)
    if (ok) setSuccessMsg(isAr ? 'تم إلغاء تنشيط الموظف.' : 'Employee deactivated.')
    setToDeactivate(null)
  }

  const columns = [
    {
      key: 'name',
      header: sortHeader('name', isAr ? 'الاسم' : 'Name'),
      render: (e: Employee) => <span className="font-semibold text-slate-800">{e.name}</span>,
    },
    {
      key: 'role',
      header: sortHeader('role', isAr ? 'الوظيفة' : 'Role'),
      render: (e: Employee) => (
        <span className="text-slate-600">
          {(e as any).role_name ?? e.role}
        </span>
      ),
    },
    {
      key: 'base_salary',
      header: sortHeader('base_salary', isAr ? 'الراتب الأساسي' : 'Base Salary'),
      render: (e: Employee) => <span className="font-mono text-slate-600">{fmt(e.base_salary)}</span>,
    },
    {
      key: 'allowances',
      header: isAr ? 'البدلات' : 'Allowances',
      render: (e: Employee) => (
        <span className="font-mono text-slate-500">{fmt((e.housing || 0) + (e.transport || 0))}</span>
      ),
    },
    {
      key: 'net_salary',
      header: sortHeader('net_salary', isAr ? 'صافي الراتب' : 'Net Salary'),
      render: (e: Employee) => <span className="font-mono font-bold text-primary">{fmt(e.net_salary)}</span>,
    },
    {
      key: 'status',
      header: sortHeader('is_active', isAr ? 'الحالة' : 'Status'),
      render: (e: Employee) => (
        <Badge variant={e.is_active === 1 ? 'success' : 'neutral'}>
          {e.is_active === 1 ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: isAr ? 'الإجراءات' : 'Actions',
      render: (e: Employee) => (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(e)}>{t('edit')}</Button>
          {e.is_active === 1 && (
            <Button variant="danger" size="sm" onClick={() => setToDeactivate(e)}>{t('delete')}</Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('employees')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAr
              ? `إجمالي الموظفين النشطين: ${totals.count}`
              : `Total active employees: ${totals.count}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => handleExport('xlsx')} isLoading={isExportingExcel} disabled={isExportingPdf}>
            📊 {isAr ? 'تصدير إكسل' : 'Excel Export'}
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf')} isLoading={isExportingPdf} disabled={isExportingExcel}>
            📕 {isAr ? 'تصدير PDF' : 'PDF Export'}
          </Button>
          <Button variant="primary" onClick={openCreate}>
            {isAr ? '+ إضافة موظف' : '+ Add Employee'}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{isAr ? 'الموظفون النشطون' : 'Active Employees'}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totals.count}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{isAr ? 'إجمالي الرواتب الشهرية' : 'Monthly Payroll'}</p>
          <p className="text-2xl font-bold text-primary mt-1">{fmt(totals.payroll)}</p>
        </Card>
      </div>

      {/* FR-037 warning: roles with no salary type */}
      {rolesWithoutSalaryType.length > 0 && (
        <Alert variant="warning">
          {isAr
            ? `تحذير: الوظائف التالية لا تملك نوع راتب محدداً: ${rolesWithoutSalaryType.map((r) => r.name).join('، ')} — يرجى تعيين نوع راتب من إعدادات الرواتب.`
            : `Warning: The following roles have no salary type configured: ${rolesWithoutSalaryType.map((r) => r.name).join(', ')} — please assign a salary type in Settings.`}
        </Alert>
      )}

      {/* Messages */}
      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" title={t('error')} onClose={clearError}>{error}</Alert>}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('search')}</label>
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder={isAr ? 'بحث بالاسم أو الوظيفة...' : 'Search by name or role...'}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'الوظيفة' : 'Role'}</label>
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} options={roleOptions} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isAr ? 'الحالة' : 'Status'}</label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}
              options={[
                { value: 'active', label: isAr ? 'النشطون فقط' : 'Active only' },
                { value: 'all', label: isAr ? 'كل السجلات' : 'All records' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <div className="space-y-4">
        <Table
          columns={columns}
          data={paginated}
          keyExtractor={(e) => e.id}
          isLoading={isLoading}
          emptyMessage={isAr ? 'لا يوجد موظفون مطابقون.' : 'No employees match the filters.'}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل بيانات موظف' : 'Edit Employee') : (isAr ? 'إضافة موظف جديد' : 'Add Employee')}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitLoading}>{t('cancel')}</Button>
            <Button variant="primary" onClick={() => handleSubmit()} isLoading={isSubmitLoading}>{t('save')}</Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}
          <Input label={isAr ? 'الاسم' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitLoading} required />

          {/* Dynamic role selector */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{isAr ? 'الوظيفة' : 'Role'} *</label>
            <div className="flex gap-2 items-center">
              <Select
                value={String(roleId)}
                onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')}
                options={[
                  { value: '', label: isAr ? '— اختر وظيفة —' : '— Select role —' },
                  ...roles.map((r) => ({ value: String(r.id), label: r.name + (r.salary_type_id == null ? (isAr ? ' ⚠️' : ' ⚠️') : '') }))
                ]}
                disabled={isSubmitLoading}
              />
              <Button variant="outline" size="sm" type="button" onClick={() => setShowAddRole(!showAddRole)} disabled={isSubmitLoading}>
                {isAr ? '+ دور جديد' : '+ New role'}
              </Button>
            </div>
            {showAddRole && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder={isAr ? 'اسم الوظيفة الجديدة' : 'New role name'}
                  disabled={isAddingRole}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddNewRole())}
                />
                <Button variant="primary" size="sm" type="button" onClick={handleAddNewRole} isLoading={isAddingRole} disabled={!newRoleName.trim()}>
                  {isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
            )}
          </div>

          {/* Optional salary type override */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{isAr ? 'تجاوز نوع الراتب (اختياري)' : 'Salary type override (optional)'}</label>
            <Select
              value={String(salaryTypeOverrideId)}
              onChange={(e) => setSalaryTypeOverrideId(e.target.value ? Number(e.target.value) : '')}
              options={[
                { value: '', label: isAr ? '— استخدام افتراضي الوظيفة —' : '— Use role default —' },
                ...salaryTypes.map((s) => ({ value: String(s.id), label: s.name }))
              ]}
              disabled={isSubmitLoading}
            />
          </div>

          {/* Base salary input hidden — the fixed monthly amount is managed by salary types.
              The existing value is preserved unchanged when editing (state still submitted). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label={isAr ? 'بدل سكن' : 'Housing'} type="number" value={housing} onChange={(e) => setHousing(e.target.value)} disabled={isSubmitLoading} min={0} />
            <Input label={isAr ? 'بدل مواصلات' : 'Transport'} type="number" value={transport} onChange={(e) => setTransport(e.target.value)} disabled={isSubmitLoading} min={0} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label={isAr ? 'تكلفة الجلسة الواحدة' : 'Per Session Cost'}
              type="number"
              value={teacherSessionRate}
              onChange={(e) => setTeacherSessionRate(e.target.value)}
              disabled={isSubmitLoading}
              min={0}
              placeholder={isAr ? 'اختياري — للمعلمين فقط' : 'Optional — teachers only'}
            />
          </div>
          <div className="flex justify-between items-center bg-slate-50 rounded-lg px-4 py-3 text-sm">
            <span className="text-slate-500 font-medium">{isAr ? 'صافي الراتب (محسوب)' : 'Net Salary (computed)'}</span>
            <span className="font-bold text-primary">{fmt(previewNet)}</span>
          </div>

          {editing && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-emerald-700 font-semibold">
                  {isAr ? `الراتب المتوقع (${currentMonth} ${currentYear})` : `Expected Salary (${currentMonth} ${currentYear})`}
                </span>
                {isLoadingExpected && <span className="text-xs text-emerald-500">{isAr ? 'جارٍ الحساب...' : 'Calculating...'}</span>}
              </div>
              {expectedSalary && !isLoadingExpected && (
                <>
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>{isAr ? 'محقق حتى الآن' : 'Earned so far'}</span>
                    <span>{fmt(expectedSalary.actual_to_date)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>{isAr ? 'المتبقي من المتوقع' : 'Remaining of expected'}</span>
                    <span>{fmt(expectedSalary.projected_remaining)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800 border-t border-emerald-200 pt-1.5">
                    <span>{isAr ? 'الراتب المتوقع (الشهر كاملاً)' : 'Expected Salary (full month)'}</span>
                    <span>{fmt(expectedSalary.expected_total)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <Modal
        isOpen={!!toDeactivate}
        onClose={() => setToDeactivate(null)}
        title={isAr ? 'إلغاء تنشيط موظف' : 'Deactivate Employee'}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setToDeactivate(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={confirmDeactivate}>{isAr ? 'إلغاء التنشيط' : 'Deactivate'}</Button>
          </div>
        }
      >
        <p className="text-slate-600 text-sm">
          {isAr
            ? `سيتم إلغاء تنشيط الموظف "${toDeactivate?.name}". يبقى سجله محفوظاً ويختفي من القوائم النشطة.`
            : `Employee "${toDeactivate?.name}" will be deactivated. Their history is preserved and they are hidden from active lists.`}
        </p>
      </Modal>
    </div>
  )
}
