import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStudentsStore } from '../../store/useStudentsStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { useExport } from '../../hooks/useExport.js'
import { SearchBar } from '../../components/ui/SearchBar.js'
import { Select } from '../../components/ui/Select.js'
import { Table } from '../../components/ui/Table.js'
import { Badge } from '../../components/ui/Badge.js'
import { Button } from '../../components/ui/Button.js'
import { Card } from '../../components/ui/Card.js'
import { Alert } from '../../components/ui/Alert.js'
import { Pagination } from '../../components/ui/Pagination.js'
import { Modal } from '../../components/ui/Modal.js'
import type { Student } from '../../types/index.js'

type SortKey = 'id' | 'name' | 'guardian' | 'price' | 'reg_date' | 'is_active'
type SortOrder = 'asc' | 'desc'

export default function StudentsList() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const {
    students,
    isLoading,
    error,
    filters,
    setFilters,
    fetchStudents,
    deactivateStudent,
    deleteStudent,
    clearError,
  } = useStudentsStore()

  // Local state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const [sortKey, setSortKey] = useState<SortKey>('id')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Deactivate modal state
  const [deactivateTarget, setDeactivateTarget] = useState<Student | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  // Hard-delete modal state (only offered for inactive students)
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch students when filters change
  useEffect(() => {
    fetchStudents()
    setCurrentPage(1)
  }, [filters])

  // Sorting logic
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === undefined || aVal === null) return 1
      if (bVal === undefined || bVal === null) return -1

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
  }, [students, sortKey, sortOrder, i18n.language])

  // Pagination logic
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedStudents.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedStudents, currentPage, itemsPerPage])

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  // Handle student deactivation
  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return
    setIsDeactivating(true)
    const success = await deactivateStudent(deactivateTarget.id)
    setIsDeactivating(false)
    if (success) {
      setDeactivateTarget(null)
    }
  }

  // Handle permanent student deletion (inactive students only)
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    const success = await deleteStudent(deleteTarget.id)
    setIsDeleting(false)
    if (success) {
      setDeleteTarget(null)
    }
  }

  // Handle Export
  const currentYear = new Date().getFullYear()
  const { exportFull } = useExport()
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    if (format === 'xlsx') {
      setIsExportingExcel(true)
    } else {
      setIsExportingPdf(true)
    }
    try {
      const result = await exportFull(currentYear, format)
      if (result && result.filePath) {
        console.log('Exported successfully to:', result.filePath)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExportingExcel(false)
      setIsExportingPdf(false)
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
    }).format(amount)
  }

  // Columns definition
  const columns = [
    {
      key: 'index',
      header: t('index'),
      className: 'w-12 text-center',
      render: (student: Student) => (
        <span className="font-mono text-slate-400 text-sm">
          {sortedStudents.findIndex((c) => c.id === student.id) + 1}
        </span>
      ),
    },
    {
      key: 'name',
      header: (
        <button
          onClick={() => handleSort('name')}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          {t('student_name')} {sortKey === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
        </button>
      ),
      render: (student: Student) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            {student.photo_url ? (
              <img src={student.photo_url} alt={student.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm text-slate-300">🧒</span>
            )}
          </div>
          <div className="font-semibold text-slate-900 hover:text-primary cursor-pointer" onClick={() => navigate(`/students/${student.id}/statement`)}>
            {student.name}
          </div>
        </div>
      ),
    },
    {
      key: 'guardian',
      header: (
        <button
          onClick={() => handleSort('guardian')}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          {t('guardian')} {sortKey === 'guardian' && (sortOrder === 'asc' ? '▲' : '▼')}
        </button>
      ),
      render: (student: Student) => student.guardian,
    },
    {
      key: 'guardian_phone',
      header: t('guardian_phone'),
      render: (student: Student) => (
        <span className="font-mono text-slate-600">{student.guardian_phone}</span>
      ),
    },
    {
      key: 'service',
      header: t('service'),
      render: (student: Student) => {
        const enrollments = student.services?.length ? student.services : [{ service: student.service, unit: student.unit, price: student.price }];

        return (
          <div className="flex flex-wrap gap-1">
            {enrollments.map((s: any, idx: number) => {
              const variant =
                s.service === 'حضانة'
                  ? 'info'
                  : s.service === 'استضافة'
                    ? 'warning'
                    : 'success'

              let label: string = s.service
              if (i18n.language === 'en') {
                if (s.service === 'حضانة') label = t('services.nursery')
                if (s.service === 'استضافة') label = t('services.hosting')
                if (s.service === 'جلسة') label = t('services.session')
              }
              return <Badge key={idx} variant={variant as any}>{label}</Badge>
            })}
          </div>
        )
      },
    },
    {
      key: 'price',
      header: (
        <button
          onClick={() => handleSort('price')}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          {t('price')} {sortKey === 'price' && (sortOrder === 'asc' ? '▲' : '▼')}
        </button>
      ),
      render: (student: Student) => {
        const enrollments = student.services?.length ? student.services : [{ service: student.service, unit: student.unit, price: student.price }];
        return (
          <div className="space-y-1">
            {enrollments.map((s: any, idx: number) => (
              <span key={idx} className="font-mono font-medium text-slate-800 block whitespace-nowrap text-sm">
                {formatCurrency(s.price)}
                <span className="text-xs text-slate-400 ms-1 inline-block">
                  / {s.unit === 'شهر' ? t('units.month') : s.unit === 'يوم' ? t('units.day') : s.unit === 'ساعة' ? t('units.hour') : t('units.session')}
                </span>
              </span>
            ))}
          </div>
        )
      },
    },
    {
      key: 'reg_date',
      header: (
        <button
          onClick={() => handleSort('reg_date')}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          {t('reg_date')} {sortKey === 'reg_date' && (sortOrder === 'asc' ? '▲' : '▼')}
        </button>
      ),
      render: (student: Student) => (
        <span className="font-mono text-slate-500">{student.reg_date}</span>
      ),
    },
    {
      key: 'status',
      header: (
        <button
          onClick={() => handleSort('is_active')}
          className="flex items-center gap-1 hover:text-slate-900 transition-colors"
        >
          {t('status')} {sortKey === 'is_active' && (sortOrder === 'asc' ? '▲' : '▼')}
        </button>
      ),
      render: (student: Student) => (
        <Badge variant={student.is_active === 1 ? 'success' : 'neutral'}>
          {student.is_active === 1 ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      className: 'w-20 text-center',
      render: (student: Student) => (
        <div className="flex items-center gap-2 justify-start">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/students/${student.id}/statement`)}
            title={t('statement')}
          >
            {t('statement')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/students/${student.id}/details`)}
          >
            {i18n.language === 'ar' ? 'التفاصيل' : 'Details'}
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/students/${student.id}/edit`)}
                title={t('edit')}
              >
                {t('edit')}
              </Button>
              {student.is_active === 1 ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeactivateTarget(student)}
                  title={t('delete')}
                >
                  {t('delete')}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget(student)}
                  title={i18n.language === 'ar' ? 'حذف نهائي' : 'Delete permanently'}
                >
                  {i18n.language === 'ar' ? 'حذف نهائي' : 'Delete permanently'}
                </Button>
              )}
            </>
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
          <h1 className="text-2xl font-bold text-slate-900">{t('students')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {i18n.language === 'ar'
              ? `إجمالي الطلاب المسجلين: ${students.length}`
              : `Total students registered: ${students.length}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Employees (not only admins) can add students — feature 004, FR-012 */}
          <Button variant="primary" onClick={() => navigate('/students/new')}>
            {t('add_student')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Filters Card */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Search */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('search')}
            </label>
            <SearchBar
              value={filters.search}
              onChange={(val) => setFilters({ search: val })}
              placeholder={
                i18n.language === 'ar'
                  ? 'بحث بالاسم، ولي الأمر، الهاتف...'
                  : 'Search by name, guardian, phone...'
              }
            />
          </div>

          {/* Service Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('service')}
            </label>
            <Select
              value={filters.service}
              onChange={(e) => setFilters({ service: e.target.value })}
              options={[
                { value: '', label: i18n.language === 'ar' ? 'جميع الخدمات' : 'All Services' },
                { value: 'حضانة', label: t('services.nursery') },
                { value: 'استضافة', label: t('services.hosting') },
                { value: 'جلسة', label: t('services.session') },
              ]}
            />
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('status')}
            </label>
            <Select
              value={filters.activeOnly ? 'active' : 'all'}
              onChange={(e) => setFilters({ activeOnly: e.target.value === 'active' })}
              options={[
                { value: 'active', label: t('active_only') },
                { value: 'all', label: t('all_records') },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Roster Table */}
      <div className="space-y-4">
        <Table
          columns={columns}
          data={paginatedStudents}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage={
            i18n.language === 'ar'
              ? 'لم يتم العثور على طلاب يطابقون خيارات البحث'
              : 'No students found matching the search criteria'
          }
        />

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={(page) => setCurrentPage(page)}
        />
      </div>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title={t('deactivate_confirm')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {i18n.language === 'ar'
              ? `سيتم إلغاء تفعيل الطالب: ${deactivateTarget?.name}. لن يظهر في القوائم النشطة أو كشوف دفع الشهور القادمة.`
              : `This will deactivate: ${deactivateTarget?.name}. They will no longer appear in active lists or future billing months.`}
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={isDeactivating}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeactivate}
              isLoading={isDeactivating}
            >
              {t('delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Permanent Delete Confirmation Modal (inactive students only) */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={i18n.language === 'ar' ? 'حذف نهائي' : 'Delete Permanently'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {i18n.language === 'ar'
              ? `سيتم حذف الطالب "${deleteTarget?.name}" نهائياً مع جميع سجلاته (الخدمات، المدفوعات، الحضور). لا يمكن التراجع عن هذا الإجراء.`
              : `Student "${deleteTarget?.name}" will be permanently deleted along with all their records (services, payments, attendance). This action cannot be undone.`}
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              {i18n.language === 'ar' ? 'حذف نهائي' : 'Delete permanently'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}