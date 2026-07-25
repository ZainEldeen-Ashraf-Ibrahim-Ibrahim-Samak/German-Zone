import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useServiceDefinitionsStore } from '../../store/useServiceDefinitionsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import type { ServiceDefinition, Teacher } from '../../types/index.js'

export default function ServiceDefinitions() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { services, isLoading, error, fetchServices, addService, updateService, deleteService, clearError } = useServiceDefinitionsStore()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceDefinition | null>(null)
  const [name, setName] = useState('')
  const [priceMonthly, setPriceMonthly] = useState('')
  const [priceDaily, setPriceDaily] = useState('')
  const [priceHourly, setPriceHourly] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [toDelete, setToDelete] = useState<ServiceDefinition | null>(null)
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([])
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([])

  useEffect(() => { fetchServices() }, [])
  useEffect(() => { window.api.teachers.list({}).then(setAllTeachers).catch(() => {}) }, [])

  const openCreate = () => {
    setEditing(null); setName(''); setPriceMonthly(''); setPriceDaily(''); setPriceHourly(''); setFormError('')
    setSelectedTeacherIds([])
    setIsFormOpen(true)
  }
  const openEdit = (s: ServiceDefinition) => {
    setEditing(s); setName(s.name)
    setPriceMonthly(s.price_monthly != null ? String(s.price_monthly) : '')
    setPriceDaily(s.price_daily != null ? String(s.price_daily) : '')
    setPriceHourly(s.price_hourly != null ? String(s.price_hourly) : '')
    setFormError('')
    window.api.serviceTeachers.list(s.id).then((list: Teacher[]) => setSelectedTeacherIds(list.map((t) => t.id))).catch(() => setSelectedTeacherIds([]))
    setIsFormOpen(true)
  }

  const toggleTeacher = (id: number) => {
    setSelectedTeacherIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }

  const handleSubmit = async () => {
    setFormError('')
    if (!name.trim()) { setFormError(isAr ? 'الاسم مطلوب' : 'Name is required'); return }
    setIsSubmitting(true)
    const payload = {
      name: name.trim(),
      price_monthly: priceMonthly ? Number(priceMonthly) : null,
      price_daily: priceDaily ? Number(priceDaily) : null,
      price_hourly: priceHourly ? Number(priceHourly) : null,
    }
    const result = editing ? await updateService(editing.id, payload) : await addService(payload)
    if (result) {
      await window.api.serviceTeachers.set(result.id, selectedTeacherIds)
    }
    setIsSubmitting(false)
    if (result) { setSuccessMsg(isAr ? 'تم الحفظ.' : 'Saved.'); setIsFormOpen(false) }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    const ok = await deleteService(toDelete.id)
    if (ok) setSuccessMsg(isAr ? 'تم الحذف.' : 'Deleted.')
    setToDelete(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">{isAr ? 'تعريف الخدمات' : 'Service Definitions'}</h2>
        <Button variant="primary" onClick={openCreate}>{isAr ? '+ إضافة خدمة' : '+ Add Service'}</Button>
      </div>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      {isLoading ? (
        <p className="text-slate-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : services.length === 0 ? (
        <p className="text-slate-400 text-sm">{isAr ? 'لا توجد خدمات بعد.' : 'No services yet.'}</p>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-800">{s.name}</p>
                  <Badge variant={s.is_custom ? 'info' : 'neutral'}>{s.is_custom ? (isAr ? 'مخصصة' : 'Custom') : (isAr ? 'افتراضية' : 'Built-in')}</Badge>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  {s.price_monthly != null && <span>{isAr ? 'شهري:' : 'Monthly:'} {s.price_monthly} EGP</span>}
                  {s.price_daily != null && <span>{isAr ? 'يومي:' : 'Daily:'} {s.price_daily} EGP</span>}
                  {s.price_hourly != null && <span>{isAr ? 'ساعة:' : 'Hourly:'} {s.price_hourly} EGP</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(s)}>{isAr ? 'تعديل' : 'Edit'}</Button>
                {s.is_custom ? (
                  <Button variant="danger" size="sm" onClick={() => setToDelete(s)}>{isAr ? 'حذف' : 'Delete'}</Button>
                ) : (
                  <span className="text-xs text-slate-400 self-center">{isAr ? 'افتراضية — لا يمكن حذفها' : 'Built-in'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل الخدمة' : 'Edit Service') : (isAr ? 'إضافة خدمة' : 'Add Service')}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setIsFormOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>{isAr ? 'حفظ' : 'Save'}</Button></div>}
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}
          <Input label={isAr ? 'الاسم' : 'Name'} value={name} onChange={(e) => setName(e.target.value)} required disabled={!!(editing && !editing.is_custom)} />
          <Input label={isAr ? 'السعر الشهري (جنيه)' : 'Monthly Price (EGP)'} type="number" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} min={0} />
          <Input label={isAr ? 'السعر اليومي (جنيه)' : 'Daily Price (EGP)'} type="number" value={priceDaily} onChange={(e) => setPriceDaily(e.target.value)} min={0} />
          <Input label={isAr ? 'السعر بالساعة (جنيه)' : 'Hourly Price (EGP)'} type="number" value={priceHourly} onChange={(e) => setPriceHourly(e.target.value)} min={0} />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">{isAr ? 'المعلمون المؤهلون لهذه الخدمة' : 'Teachers qualified for this service'}</label>
            <div className="flex flex-wrap gap-1.5">
              {allTeachers.length === 0 ? (
                <span className="text-xs text-slate-400">{isAr ? 'لا يوجد موظفون' : 'No employees found'}</span>
              ) : allTeachers.map((tch) => {
                const active = selectedTeacherIds.includes(tch.id)
                return (
                  <button
                    type="button"
                    key={tch.id}
                    onClick={() => toggleTeacher(tch.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                      active ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {tch.name}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400">{isAr ? 'اتركها فارغة للسماح بأي موظف نشط.' : 'Leave empty to allow any active employee.'}</p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title={isAr ? 'حذف الخدمة' : 'Delete Service'}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setToDelete(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="danger" onClick={handleDelete}>{isAr ? 'حذف' : 'Delete'}</Button></div>}
      >
        <p className="text-sm text-slate-600">{isAr ? `حذف "${toDelete?.name}"؟ يجب إعادة تسجيل الأطفال المشتركين فيها أولاً.` : `Delete "${toDelete?.name}"? Children enrolled in it must be re-enrolled first.`}</p>
      </Modal>
    </div>
  )
}
