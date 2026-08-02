import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBranchStore } from '../../store/useBranchStore.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Alert } from '../../components/ui/Alert.js'
import { Badge } from '../../components/ui/Badge.js'
import type { Branch, Hall, HallTimeSlot } from '../../types/index.js'

/** Weekday keys in JS getDay() order (0 = Sunday … 6 = Saturday) — same order as lesson days. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Turns '13:00' into '1:00 PM' / '1:00 م' for display; the stored value stays 24-hour. */
function formatTime(time: string, isAr: boolean): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 && h < 24 ? (isAr ? 'م' : 'PM') : (isAr ? 'ص' : 'AM')
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

interface SlotDraft extends HallTimeSlot {
  /** Stable key for React while the row has no database id yet. */
  key: string
}

const emptyForm = () => ({
  name: '',
  branch_id: '' as number | '',
  capacity: '' as number | '',
  notes: '',
  slots: [] as SlotDraft[],
})

/**
 * Halls and their weekly opening hours.
 *
 * A hall can open more than once on the same weekday — Hall 11 runs 13:00-18:00 and again
 * 20:00-24:00 — so the editor lets each day hold several intervals rather than one start/end
 * pair. Overlaps and backwards intervals are rejected by the IPC layer before anything is saved.
 */
export default function HallsList() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)

  const [halls, setHalls] = useState<Hall[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Hall | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Hall | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await window.api.halls.list({
        activeOnly: false,
        branch_id: selectedBranchId ?? undefined,
      })
      setHalls(list || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load halls')
    } finally {
      setIsLoading(false)
    }
  }, [selectedBranchId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.api.branches.list().then((list: Branch[]) => setBranches(list || [])).catch(() => setBranches([]))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm(), branch_id: selectedBranchId ?? '' })
    setFormError('')
    setIsFormOpen(true)
  }

  const openEdit = (hall: Hall) => {
    setEditing(hall)
    setForm({
      name: hall.name,
      branch_id: hall.branch_id ?? '',
      capacity: hall.capacity ?? '',
      notes: hall.notes ?? '',
      slots: (hall.slots ?? []).map((s, idx) => ({ ...s, key: `${s.id ?? 'new'}-${idx}` })),
    })
    setFormError('')
    setIsFormOpen(true)
  }

  const addSlot = (day: number) => {
    setForm((prev) => ({
      ...prev,
      slots: [
        ...prev.slots,
        { key: `new-${Date.now()}-${Math.random()}`, day_of_week: day, start_time: '13:00', end_time: '18:00', notes: null },
      ],
    }))
  }

  const updateSlot = (key: string, patch: Partial<HallTimeSlot>) => {
    setForm((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }))
  }

  const removeSlot = (key: string) => {
    setForm((prev) => ({ ...prev, slots: prev.slots.filter((s) => s.key !== key) }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsSaving(true)
    try {
      if (!form.name.trim()) {
        throw new Error(isAr ? 'اسم القاعة مطلوب' : 'Hall name is required')
      }

      const payload = {
        name: form.name.trim(),
        branch_id: form.branch_id === '' ? null : Number(form.branch_id),
        capacity: form.capacity === '' ? null : Number(form.capacity),
        notes: form.notes.trim() || null,
        slots: form.slots.map(({ day_of_week, start_time, end_time, notes }) => ({
          day_of_week, start_time, end_time, notes,
        })),
      }

      if (editing) {
        await window.api.halls.update({ id: editing.id, patch: payload })
        setSuccessMsg(isAr ? 'تم تحديث القاعة' : 'Hall updated')
      } else {
        await window.api.halls.add(payload)
        setSuccessMsg(isAr ? 'تمت إضافة القاعة' : 'Hall created')
      }
      setIsFormOpen(false)
      await load()
    } catch (err: any) {
      setFormError(err.message || 'Failed to save hall')
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.halls.delete({ id: deleteTarget.id })
      setSuccessMsg(isAr ? 'تم حذف القاعة' : 'Hall deleted')
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      setError(err.message || 'Failed to delete hall')
      setDeleteTarget(null)
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1 text-start">
          <h2 className="text-2xl font-bold text-slate-800 m-0">{isAr ? 'القاعات' : 'Halls'}</h2>
          <span className="text-slate-400 text-sm font-semibold">
            {isAr ? 'مواعيد العمل الأسبوعية لكل قاعة' : 'Weekly opening hours for each hall'}
          </span>
        </div>
        <Button variant="primary" size="md" onClick={openCreate}>
          + {isAr ? 'إضافة قاعة' : 'Add hall'}
        </Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}
      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

      {isLoading && <p className="text-sm text-slate-400">{t('loading')}</p>}

      {!isLoading && halls.length === 0 && (
        <Card className="p-8 text-center text-slate-400">
          {isAr ? 'لا توجد قاعات بعد' : 'No halls yet'}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {halls.map((hall) => (
          <Card key={hall.id} className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col text-start gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-800">{hall.name}</span>
                  {hall.is_active === 0 && <Badge variant="danger">{t('inactive')}</Badge>}
                </div>
                <span className="text-xs text-slate-400 font-semibold">
                  {hall.branch_name ? `${hall.branch_kind === 'online' ? '🌐' : '🏢'} ${hall.branch_name}` : (isAr ? 'بدون فرع' : 'No branch')}
                  {hall.capacity ? ` · ${isAr ? `سعة ${hall.capacity}` : `capacity ${hall.capacity}`}` : ''}
                  {hall.total_hours ? ` · ${isAr ? `${hall.total_hours} ساعة/أسبوع` : `${hall.total_hours} h/week`}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(hall)}>{t('edit')}</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(hall)}>{t('delete')}</Button>
              </div>
            </div>

            {/* Weekly timetable — several intervals per day are shown side by side */}
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_KEYS.map((key, day) => {
                const daySlots = (hall.slots ?? []).filter((s) => s.day_of_week === day)
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className={`text-[11px] font-bold text-center py-1 rounded ${
                      daySlots.length > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-300'
                    }`}>
                      {t(`days.${key}`)}
                    </div>
                    {daySlots.length === 0 ? (
                      <div className="text-[10px] text-slate-300 text-center py-1">—</div>
                    ) : (
                      daySlots.map((s, idx) => (
                        <div
                          key={s.id ?? idx}
                          className="text-[10px] leading-tight text-center bg-white border border-slate-200 rounded px-1 py-1 text-slate-600"
                        >
                          <div className="font-semibold">{formatTime(s.start_time, isAr)}</div>
                          <div className="text-slate-400">{formatTime(s.end_time, isAr)}</div>
                        </div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>

            {hall.notes && <p className="text-xs text-slate-500 text-start">{hall.notes}</p>}
          </Card>
        ))}
      </div>

      {/* Create / edit */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل قاعة' : 'Edit hall') : (isAr ? 'إضافة قاعة' : 'Add hall')}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>{t('cancel')}</Button>
            <Button variant="primary" onClick={submit} isLoading={isSaving}>{t('save')}</Button>
          </div>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label={isAr ? 'اسم القاعة' : 'Hall name'}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={isAr ? 'مثال: قاعة 11' : 'e.g. Hall 11'}
              required
            />
            <Select
              label={isAr ? 'الفرع' : 'Branch'}
              value={form.branch_id}
              onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value === '' ? '' : Number(e.target.value) }))}
              options={[
                { value: '', label: isAr ? 'بدون فرع' : 'No branch' },
                ...branches.map((b) => ({ value: b.id, label: `${b.kind === 'online' ? '🌐' : '🏢'} ${b.name}` })),
              ]}
            />
            <Input
              label={isAr ? 'السعة' : 'Capacity'}
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value === '' ? '' : Number(e.target.value) }))}
            />
          </div>

          {/* Timetable editor: a day can hold as many intervals as needed */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">
              {isAr ? 'مواعيد العمل الأسبوعية' : 'Weekly opening hours'}
            </label>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'يمكن للقاعة أن تعمل أكثر من فترة في اليوم الواحد (مثال: 1 ظهراً - 6 مساءً، ثم 8 - 12 مساءً)'
                : 'A hall can open more than once a day (e.g. 1 PM - 6 PM, then 8 PM - 12 AM)'}
            </p>

            <div className="flex flex-col gap-2">
              {DAY_KEYS.map((key, day) => {
                const daySlots = form.slots.filter((s) => s.day_of_week === day)
                return (
                  <div key={key} className="border border-slate-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-600">{t(`days.${key}`)}</span>
                      <button
                        type="button"
                        onClick={() => addSlot(day)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        + {isAr ? 'إضافة فترة' : 'Add interval'}
                      </button>
                    </div>

                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-300">{isAr ? 'مغلقة' : 'Closed'}</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {daySlots.map((slot) => (
                          <div key={slot.key} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={slot.start_time}
                              onChange={(e) => updateSlot(slot.key, { start_time: e.target.value })}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                            />
                            <span className="text-slate-400 text-xs">→</span>
                            <input
                              type="time"
                              value={slot.end_time}
                              onChange={(e) => updateSlot(slot.key, { end_time: e.target.value })}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => removeSlot(slot.key)}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold px-2"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">{t('notes')}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-start text-sm shadow-sm transition-all"
            />
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={isAr ? 'حذف قاعة' : 'Delete hall'}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete}>{t('delete')}</Button>
          </div>
        }
      >
        <p className="text-slate-600 leading-relaxed text-start">
          {isAr
            ? `سيتم حذف "${deleteTarget?.name}" ومواعيدها نهائياً.`
            : `"${deleteTarget?.name}" and its timetable will be permanently deleted.`}
        </p>
      </Modal>
    </div>
  )
}
