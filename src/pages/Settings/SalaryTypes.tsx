import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSalaryTypesStore } from '../../store/useSalaryTypesStore.js'
import { useRolesStore } from '../../store/useRolesStore.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import type { SalaryType, SalaryMode } from '../../types/index.js'

const MODES: { value: SalaryMode; labelEn: string; labelAr: string }[] = [
  { value: 'fixed_monthly', labelEn: 'Fixed Monthly', labelAr: 'راتب شهري ثابت' },
  { value: 'per_session_fixed', labelEn: 'Per Session (Fixed)', labelAr: 'مبلغ ثابت لكل جلسة' },
  { value: 'per_session_pct', labelEn: 'Per Session (% of child\'s service price)', labelAr: 'نسبة مئوية من سعر خدمة الطفل' },
  { value: 'hybrid', labelEn: 'Hybrid (Monthly + Per Session)', labelAr: 'هجين (شهري + لكل جلسة)' },
  { value: 'per_child_session', labelEn: 'Per Child (Attendance-based)', labelAr: 'حسب الطفل (بناءً على الحضور)' },
]

export default function SalaryTypes() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { salaryTypes, isLoading, error, fetchSalaryTypes, addSalaryType, updateSalaryType, deleteSalaryType, clearError } = useSalaryTypesStore()
  const { roles, fetchRoles, updateRole } = useRolesStore()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<SalaryType | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<SalaryMode>('fixed_monthly')
  const [monthlyRate, setMonthlyRate] = useState('')
  const [sessionRate, setSessionRate] = useState('')
  const [sessionPct, setSessionPct] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [toDelete, setToDelete] = useState<SalaryType | null>(null)
  const [roleAssignId, setRoleAssignId] = useState<number | ''>('')
  const [assigningRoleId, setAssigningRoleId] = useState<number | null>(null)

  useEffect(() => {
    fetchSalaryTypes(); fetchRoles()
  }, [])

  const openCreate = () => {
    setEditing(null); setName(''); setMode('fixed_monthly'); setMonthlyRate(''); setSessionRate(''); setSessionPct(''); setFormError('')
    setIsFormOpen(true)
  }
  const openEdit = (st: SalaryType) => {
    setEditing(st); setName(st.name); setMode(st.mode)
    setMonthlyRate(st.monthly_rate != null ? String(st.monthly_rate) : '')
    setSessionRate(st.session_rate != null ? String(st.session_rate) : '')
    setSessionPct(st.session_pct != null ? String(st.session_pct) : '')
    setFormError(''); setIsFormOpen(true)
  }

  const handleSubmit = async () => {
    setFormError('')
    if (!name.trim()) { setFormError(isAr ? 'الاسم مطلوب' : 'Name is required'); return }
    if ((mode === 'fixed_monthly' || mode === 'hybrid') && !monthlyRate) { setFormError(isAr ? 'المبلغ الشهري مطلوب' : 'Monthly rate is required'); return }
    if ((mode === 'per_session_fixed' || mode === 'hybrid') && !sessionRate) { setFormError(isAr ? 'مبلغ الجلسة مطلوب' : 'Session rate is required'); return }
    if (mode === 'per_session_pct' && (!sessionPct || Number(sessionPct) <= 0 || Number(sessionPct) > 1)) { setFormError(isAr ? 'النسبة يجب أن تكون بين 0 و 1' : 'Percentage must be between 0 and 1'); return }
    setIsSubmitting(true)
    const payload = { name: name.trim(), mode, monthly_rate: monthlyRate ? Number(monthlyRate) : null, session_rate: sessionRate ? Number(sessionRate) : null, session_pct: sessionPct ? Number(sessionPct) : null }
    const result = editing ? await updateSalaryType(editing.id, payload) : await addSalaryType(payload)
    setIsSubmitting(false)
    if (result) { setSuccessMsg(isAr ? 'تم الحفظ.' : 'Saved.'); setIsFormOpen(false) }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    const ok = await deleteSalaryType(toDelete.id)
    if (ok) setSuccessMsg(isAr ? 'تم الحذف.' : 'Deleted.')
    setToDelete(null)
  }

  const handleAssignRoleDefault = async (salaryTypeId: number) => {
    if (!roleAssignId) return
    setAssigningRoleId(Number(roleAssignId))
    await updateRole(Number(roleAssignId), { salary_type_id: salaryTypeId })
    setAssigningRoleId(null)
    setRoleAssignId('')
    fetchRoles()
    setSuccessMsg(isAr ? 'تم تعيين نوع الراتب للوظيفة.' : 'Salary type assigned to role.')
  }

  const modeLabel = (m: SalaryMode) => {
    const found = MODES.find((x) => x.value === m)
    return found ? (isAr ? found.labelAr : found.labelEn) : m
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{isAr ? 'أنواع الرواتب' : 'Salary Types'}</h2>
        <Button variant="primary" onClick={openCreate}>{isAr ? '+ إضافة نوع راتب' : '+ Add Salary Type'}</Button>
      </div>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      {isLoading ? (
        <p className="text-slate-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : salaryTypes.length === 0 ? (
        <p className="text-slate-400 text-sm">{isAr ? 'لا توجد أنواع رواتب بعد.' : 'No salary types yet.'}</p>
      ) : (
        <div className="space-y-3">
          {salaryTypes.map((st) => (
            <div key={st.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold text-slate-800">{st.name}</p>
                <Badge variant="neutral">{modeLabel(st.mode)}</Badge>
                {st.monthly_rate != null && <span className="text-xs text-slate-500 ms-2">{isAr ? 'شهري:' : 'Monthly:'} {st.monthly_rate} EGP</span>}
                {st.session_rate != null && <span className="text-xs text-slate-500 ms-2">{isAr ? 'جلسة:' : 'Session:'} {st.session_rate} EGP</span>}
                {st.session_pct != null && <span className="text-xs text-slate-500 ms-2">{isAr ? 'نسبة:' : 'Pct:'} {(st.session_pct * 100).toFixed(0)}%</span>}
                <div className="flex items-center gap-2 mt-1">
                  <Select
                    value={String(roleAssignId)}
                    onChange={(e) => setRoleAssignId(e.target.value ? Number(e.target.value) : '')}
                    options={[
                      { value: '', label: isAr ? '— تعيين لوظيفة —' : '— Assign to role —' },
                      ...roles.map((r) => ({ value: String(r.id), label: r.name }))
                    ]}
                  />
                  <Button variant="outline" size="sm" onClick={() => handleAssignRoleDefault(st.id)} isLoading={assigningRoleId === Number(roleAssignId)} disabled={!roleAssignId}>
                    {isAr ? 'تعيين' : 'Assign'}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(st)}>{isAr ? 'تعديل' : 'Edit'}</Button>
                <Button variant="danger" size="sm" onClick={() => setToDelete(st)}>{isAr ? 'حذف' : 'Delete'}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editing ? (isAr ? 'تعديل نوع الراتب' : 'Edit Salary Type') : (isAr ? 'إضافة نوع راتب' : 'Add Salary Type')}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setIsFormOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>{isAr ? 'حفظ' : 'Save'}</Button></div>}
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}
          <Input label={isAr ? 'الاسم' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">{isAr ? 'النوع' : 'Mode'}</label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as SalaryMode)} options={MODES.map((m) => ({ value: m.value, label: isAr ? m.labelAr : m.labelEn }))} />
          </div>
          {(mode === 'fixed_monthly' || mode === 'hybrid') && (
            <Input label={isAr ? 'المبلغ الشهري (جنيه)' : 'Monthly Rate (EGP)'} type="number" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} min={0} />
          )}
          {(mode === 'per_session_fixed' || mode === 'hybrid') && (
            <Input label={isAr ? 'مبلغ الجلسة (جنيه)' : 'Per Session Rate (EGP)'} type="number" value={sessionRate} onChange={(e) => setSessionRate(e.target.value)} min={0} />
          )}
          {mode === 'per_session_pct' && (
            <Input label={isAr ? 'النسبة (0–1)' : 'Percentage (0–1)'} type="number" value={sessionPct} onChange={(e) => setSessionPct(e.target.value)} min={0} max={1} step={0.01} />
          )}
          {mode === 'per_child_session' && (
            <>
              <p className="text-xs text-slate-400">
                {isAr
                  ? 'يُصرف مبلغ الحضور حسب كل طفل: سعر المعلم المحدد للطفل (إن وُجد) أولاً، ثم سعر الجلسة المحدد في نوع الراتب أدناه — ولا يُستخدم أبداً سعر خدمة الطفل ولا سعر جلسة المعلم في ملفه.'
                  : 'Attendance pay follows each child: the child’s teacher-rate override first (if set), then this salary type’s per-session rate below — the child’s service price and the teacher’s own "Per Session Cost" are never used in this mode.'}
              </p>
              <Input label={isAr ? 'مبلغ الجلسة (جنيه)' : 'Per Session Rate (EGP)'} type="number" value={sessionRate} onChange={(e) => setSessionRate(e.target.value)} min={0} />
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title={isAr ? 'حذف نوع الراتب' : 'Delete Salary Type'}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setToDelete(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="danger" onClick={handleDelete}>{isAr ? 'حذف' : 'Delete'}</Button></div>}
      >
        <p className="text-sm text-slate-600">{isAr ? `حذف "${toDelete?.name}"؟ يجب تحديث الوظائف والموظفين المرتبطين.` : `Delete "${toDelete?.name}"? Roles and employees using it must be updated first.`}</p>
      </Modal>
    </div>
  )
}
