import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBranchStore } from '../../store/useBranchStore.js'
import { Card } from '../../components/ui/Card.js'
import { Table } from '../../components/ui/Table.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Badge } from '../../components/ui/Badge.js'
import { Alert } from '../../components/ui/Alert.js'
import type { Branch, User } from '../../types/index.js'

const emptyForm = () => ({
  name: '',
  code: '',
  city: '',
  address: '',
  phone: '',
  kind: 'physical' as 'physical' | 'online',
  manager_user_id: '' as number | '',
})

/**
 * Branch directory. A branch is either a physical location (Port Said, …) or the "online"
 * branch that online-only students and staff belong to — keeping online as a branch row rather
 * than a special case means every scoping query is just a branch_id comparison.
 */
export default function BranchesList() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const refreshMine = useBranchStore((s) => s.fetchMine)

  const [branches, setBranches] = useState<Branch[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const list = await window.api.branches.list({ activeOnly: false })
      setBranches(list || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load branches')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    window.api.users.list().then((list: User[]) => setUsers(list || [])).catch(() => setUsers([]))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormError('')
    setIsFormOpen(true)
  }

  const openEdit = (branch: Branch) => {
    setEditing(branch)
    setForm({
      name: branch.name,
      code: branch.code ?? '',
      city: branch.city ?? '',
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      kind: branch.kind,
      manager_user_id: branch.manager_user_id ?? '',
    })
    setFormError('')
    setIsFormOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsSaving(true)
    try {
      if (!form.name.trim()) throw new Error(isAr ? 'اسم الفرع مطلوب' : 'Branch name is required')

      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        kind: form.kind,
        manager_user_id: form.manager_user_id === '' ? null : Number(form.manager_user_id),
      }

      if (editing) {
        await window.api.branches.update({ id: editing.id, patch: payload })
        // Setting a manager also grants them coverage of the branch they manage.
        if (payload.manager_user_id !== (editing.manager_user_id ?? null)) {
          await window.api.branches.setManager({ branch_id: editing.id, user_id: payload.manager_user_id })
        }
        setSuccessMsg(isAr ? 'تم تحديث الفرع' : 'Branch updated')
      } else {
        const created = await window.api.branches.add(payload)
        if (payload.manager_user_id) {
          await window.api.branches.setManager({ branch_id: created.id, user_id: payload.manager_user_id })
        }
        setSuccessMsg(isAr ? 'تمت إضافة الفرع' : 'Branch created')
      }

      setIsFormOpen(false)
      await load()
      await refreshMine()
    } catch (err: any) {
      setFormError(err.message || 'Failed to save branch')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (branch: Branch) => {
    setError('')
    try {
      await window.api.branches.update({ id: branch.id, patch: { is_active: branch.is_active === 1 ? 0 : 1 } })
      await load()
      await refreshMine()
    } catch (err: any) {
      setError(err.message || 'Failed to update branch')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await window.api.branches.delete({ id: deleteTarget.id })
      setSuccessMsg(isAr ? 'تم حذف الفرع' : 'Branch deleted')
      setDeleteTarget(null)
      await load()
      await refreshMine()
    } catch (err: any) {
      setError(err.message || 'Failed to delete branch')
      setDeleteTarget(null)
    }
  }

  const columns = [
    {
      key: 'name',
      header: isAr ? 'الفرع' : 'Branch',
      render: (b: Branch) => (
        <div className="flex flex-col text-start">
          <span className="font-semibold text-slate-800">
            {b.kind === 'online' ? '🌐 ' : '🏢 '}{b.name}
          </span>
          <span className="text-xs text-slate-400">
            {[b.code, b.city].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'kind',
      header: isAr ? 'النوع' : 'Type',
      render: (b: Branch) => (
        <Badge variant={b.kind === 'online' ? 'info' : 'neutral'}>
          {b.kind === 'online' ? (isAr ? 'أونلاين' : 'Online') : (isAr ? 'مقر' : 'Physical')}
        </Badge>
      ),
    },
    {
      key: 'manager',
      header: isAr ? 'مدير الفرع' : 'Branch manager',
      render: (b: Branch) => (
        <span className="text-slate-600">{b.manager_name || b.manager_username || '—'}</span>
      ),
    },
    {
      key: 'counts',
      header: isAr ? 'الأعداد' : 'Counts',
      render: (b: Branch) => (
        <span className="text-xs text-slate-500">
          {isAr
            ? `${b.student_count ?? 0} طالب · ${b.employee_count ?? 0} موظف · ${b.hall_count ?? 0} قاعة`
            : `${b.student_count ?? 0} students · ${b.employee_count ?? 0} staff · ${b.hall_count ?? 0} halls`}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (b: Branch) => (
        <Badge variant={b.is_active === 1 ? 'success' : 'danger'}>
          {b.is_active === 1 ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (b: Branch) => (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(b)}>{t('edit')}</Button>
          <Button variant="outline" size="sm" onClick={() => toggleActive(b)}>
            {b.is_active === 1 ? t('deactivate') : t('activate')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(b)}>{t('delete')}</Button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1 text-start">
          <h2 className="text-2xl font-bold text-slate-800 m-0">{isAr ? 'الفروع' : 'Branches'}</h2>
          <span className="text-slate-400 text-sm font-semibold">
            {isAr
              ? 'الفروع الفعلية وفرع الأونلاين — يُسند كل مستخدم وطالب وقاعة إلى فرع'
              : 'Physical branches and the online branch — every user, student and hall belongs to one'}
          </span>
        </div>
        <Button variant="primary" size="md" onClick={openCreate}>
          + {isAr ? 'إضافة فرع' : 'Add branch'}
        </Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}
      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

      <Card>
        <Table
          columns={columns}
          data={branches}
          keyExtractor={(b) => b.id}
          isLoading={isLoading}
          emptyMessage={isAr ? 'لا توجد فروع بعد' : 'No branches yet'}
        />
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل فرع' : 'Edit branch') : (isAr ? 'إضافة فرع' : 'Add branch')}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>{t('cancel')}</Button>
            <Button variant="primary" onClick={submit} isLoading={isSaving}>{t('save')}</Button>
          </div>
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}

          <Input
            label={isAr ? 'اسم الفرع' : 'Branch name'}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder={isAr ? 'مثال: فرع بورسعيد' : 'e.g. Port Said branch'}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
              label={isAr ? 'النوع' : 'Type'}
              value={form.kind}
              onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as 'physical' | 'online' }))}
              options={[
                { value: 'physical', label: isAr ? 'مقر فعلي' : 'Physical location' },
                { value: 'online', label: isAr ? 'أونلاين' : 'Online' },
              ]}
            />
            <Input
              label={isAr ? 'الكود' : 'Code'}
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="PS"
            />
            <Input
              label={isAr ? 'المدينة' : 'City'}
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              placeholder={isAr ? 'بورسعيد' : 'Port Said'}
            />
            <Input
              label={isAr ? 'الهاتف' : 'Phone'}
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>

          <Input
            label={isAr ? 'العنوان' : 'Address'}
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          />

          <Select
            label={isAr ? 'مدير الفرع' : 'Branch manager'}
            value={form.manager_user_id}
            onChange={(e) => setForm((p) => ({ ...p, manager_user_id: e.target.value === '' ? '' : Number(e.target.value) }))}
            options={[
              { value: '', label: isAr ? 'بدون مدير' : 'No manager' },
              ...users.filter((u) => u.is_active === 1).map((u) => ({ value: u.id, label: u.name || u.username })),
            ]}
          />
          <p className="text-xs text-slate-400 -mt-2">
            {isAr
              ? 'تعيين مدير يمنحه صلاحية العمل على هذا الفرع تلقائياً.'
              : 'Assigning a manager automatically gives them coverage of this branch.'}
          </p>
        </form>
      </Modal>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={isAr ? 'حذف فرع' : 'Delete branch'}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete}>{t('delete')}</Button>
          </div>
        }
      >
        <p className="text-slate-600 leading-relaxed text-start">
          {isAr
            ? `سيتم حذف "${deleteTarget?.name}" نهائياً. لن ينجح الحذف إذا كان الفرع مرتبطاً بطلاب أو موظفين أو قاعات.`
            : `"${deleteTarget?.name}" will be permanently deleted. The delete is refused while students, staff or halls still belong to it.`}
        </p>
      </Modal>
    </div>
  )
}
