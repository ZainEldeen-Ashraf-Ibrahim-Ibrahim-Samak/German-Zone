import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesStore } from '../../store/useRolesStore.js'
import { useSalaryTypesStore } from '../../store/useSalaryTypesStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import type { EmployeeRole, SalaryMode } from '../../types/index.js'

const MODE_LABELS: Record<SalaryMode, { en: string; ar: string }> = {
  fixed_monthly: { en: 'Fixed Monthly', ar: 'راتب شهري ثابت' },
  per_session_fixed: { en: 'Per Session (Fixed)', ar: 'مبلغ ثابت لكل جلسة' },
  per_session_pct: { en: 'Per Session (%)', ar: 'نسبة من سعر الخدمة' },
  hybrid: { en: 'Hybrid', ar: 'هجين' },
  per_student_session: { en: 'Per Student', ar: 'حسب الطالب' },
  hourly: { en: 'Hourly', ar: 'بالساعة' },
}

/**
 * Job types (employee roles) manager. Every signed-in user can see the list — it is what the
 * employee form and reports label people by — while creating, editing and deleting is limited
 * to admins/managers, matching the IPC guards.
 */
export default function JobTypes() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'

  const { roles, isLoading, error, fetchRoles, addRole, updateRole, deleteRole, clearError } = useRolesStore()
  const { salaryTypes, fetchSalaryTypes } = useSalaryTypesStore()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeRole | null>(null)
  const [name, setName] = useState('')
  const [salaryTypeId, setSalaryTypeId] = useState<number | ''>('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [toDelete, setToDelete] = useState<EmployeeRole | null>(null)

  useEffect(() => {
    fetchRoles()
    // Salary types are admin-only; employees just see the name already joined onto each role.
    if (isAdmin) fetchSalaryTypes()
  }, [isAdmin])

  const openCreate = () => {
    setEditing(null); setName(''); setSalaryTypeId(''); setFormError(''); setIsFormOpen(true)
  }

  const openEdit = (role: EmployeeRole) => {
    setEditing(role); setName(role.name); setSalaryTypeId(role.salary_type_id ?? '')
    setFormError(''); setIsFormOpen(true)
  }

  const handleSubmit = async () => {
    setFormError('')
    if (!name.trim()) { setFormError(isAr ? 'اسم الوظيفة مطلوب' : 'Job type name is required'); return }
    setIsSubmitting(true)
    const salary_type_id = salaryTypeId !== '' ? Number(salaryTypeId) : null
    const result = editing
      ? await updateRole(editing.id, { name: name.trim(), salary_type_id })
      : await addRole(name.trim(), salary_type_id)
    setIsSubmitting(false)
    if (result) {
      setSuccessMsg(isAr ? 'تم الحفظ.' : 'Saved.')
      setIsFormOpen(false)
      fetchRoles()
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    const ok = await deleteRole(toDelete.id)
    if (ok) { setSuccessMsg(isAr ? 'تم الحذف.' : 'Deleted.'); fetchRoles() }
    setToDelete(null)
  }

  const salaryTypeLabel = (role: EmployeeRole) => {
    if (!role.salary_type_name) return null
    const mode = role.salary_type_mode ? MODE_LABELS[role.salary_type_mode] : null
    return mode ? `${role.salary_type_name} — ${isAr ? mode.ar : mode.en}` : role.salary_type_name
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{isAr ? 'المسميات الوظيفية' : 'Job Types'}</h2>
        {isAdmin && (
          <Button variant="primary" onClick={openCreate}>{isAr ? '+ إضافة مسمى وظيفي' : '+ Add Job Type'}</Button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {isAr
          ? 'المسميات الوظيفية تظهر لكل الموظفين وتُستخدم عند إضافة موظف جديد. نوع الراتب المرتبط بالمسمى هو الافتراضي لكل من يشغله، ويمكن تجاوزه لموظف بعينه من صفحة الموظفين.'
          : 'Job types are visible to every employee and are what you pick from when adding one. The salary type attached here is the default for everyone holding that job, and can be overridden per employee on the Employees page.'}
      </p>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      {isLoading ? (
        <p className="text-slate-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : roles.length === 0 ? (
        <p className="text-slate-400 text-sm">{isAr ? 'لا توجد مسميات وظيفية بعد.' : 'No job types yet.'}</p>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold text-slate-800">{role.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {role.salary_type_name ? (
                    <Badge variant="neutral">{salaryTypeLabel(role)}</Badge>
                  ) : (
                    <Badge variant="warning">{isAr ? '⚠️ بدون نوع راتب' : '⚠️ No salary type'}</Badge>
                  )}
                  <span className="text-xs text-slate-500">
                    {isAr
                      ? `${role.active_employee_count ?? 0} موظف نشط`
                      : `${role.active_employee_count ?? 0} active employee${(role.active_employee_count ?? 0) === 1 ? '' : 's'}`}
                  </span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(role)}>{isAr ? 'تعديل' : 'Edit'}</Button>
                  <Button variant="danger" size="sm" onClick={() => setToDelete(role)}>{isAr ? 'حذف' : 'Delete'}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل مسمى وظيفي' : 'Edit Job Type') : (isAr ? 'إضافة مسمى وظيفي' : 'Add Job Type')}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>{isAr ? 'حفظ' : 'Save'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}
          <Input label={isAr ? 'اسم المسمى الوظيفي' : 'Job Type Name'} value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{isAr ? 'نوع الراتب الافتراضي' : 'Default Salary Type'}</label>
            <Select
              value={String(salaryTypeId)}
              onChange={(e) => setSalaryTypeId(e.target.value ? Number(e.target.value) : '')}
              options={[
                { value: '', label: isAr ? '— بدون —' : '— None —' },
                ...salaryTypes.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${isAr ? MODE_LABELS[s.mode].ar : MODE_LABELS[s.mode].en})`,
                })),
              ]}
            />
            <p className="text-xs text-slate-400">
              {isAr
                ? 'اختر «بالساعة» لمن يُحتسب أجرهم بالمؤقت — عندها يجب ضبط سعر الساعة في نوع الراتب أو في ملف الموظف.'
                : 'Pick an "Hourly" salary type for people paid by the timer — its hourly rate (or the employee\'s own) is what the clocked time is multiplied by.'}
            </p>
          </div>
          {editing && (editing.employee_count ?? 0) > 0 && (
            <p className="text-xs text-amber-600">
              {isAr
                ? `سيتم تحديث المسمى الوظيفي لـ ${editing.employee_count} موظف مرتبط.`
                : `Renaming updates the job title on ${editing.employee_count} linked employee${editing.employee_count === 1 ? '' : 's'}.`}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        title={isAr ? 'حذف المسمى الوظيفي' : 'Delete Job Type'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="danger" onClick={handleDelete}>{isAr ? 'حذف' : 'Delete'}</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">
          {isAr
            ? `حذف "${toDelete?.name}"؟ لا يمكن الحذف إذا كان هناك موظفون نشطون بهذا المسمى.`
            : `Delete "${toDelete?.name}"? It cannot be deleted while active employees hold it.`}
        </p>
      </Modal>
    </div>
  )
}
