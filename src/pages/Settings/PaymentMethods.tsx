import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaymentMethodsStore } from '../../store/usePaymentMethodsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'

export default function PaymentMethods() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { methods, isLoading, error, fetchMethods, addMethod, updateMethod, deleteMethod, clearError } = usePaymentMethodsStore()

  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => { fetchMethods() }, [])

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await addMethod(newName.trim())
      setNewName('')
    } catch (e: any) {
      // error surfaced via store
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await updateMethod(id, { name: editName.trim() })
      setEditId(null)
    } catch { } finally { setSaving(false) }
  }

  const handleToggleActive = async (id: number, current: number) => {
    await updateMethod(id, { is_active: current === 1 ? 0 : 1 })
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteMethod(id)
    } catch { } finally { setDeleteConfirm(null) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-800">
          {isAr ? 'طرق الدفع' : 'Payment Methods'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {isAr ? 'أضف طرق الدفع المتاحة (كاش، تحويل، فودافون كاش، إلخ)' : 'Define available payment methods (cash, transfer, Vodafone Cash, etc.)'}
        </p>
      </div>

      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      {/* Add new method */}
      <div className="flex gap-2 items-center">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={isAr ? 'اسم طريقة الدفع...' : 'New method name...'}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          disabled={saving}
          className="max-w-xs"
        />
        <Button variant="primary" size="sm" onClick={handleAdd} isLoading={saving} disabled={!newName.trim()}>
          {isAr ? '+ إضافة' : '+ Add'}
        </Button>
      </div>

      {/* Methods list */}
      {isLoading ? (
        <p className="text-sm text-slate-400">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {methods.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">
              {isAr ? 'لا توجد طرق دفع بعد' : 'No payment methods yet'}
            </p>
          )}
          {methods.map((m) => (
            <div key={m.id} className={`flex items-center gap-3 px-4 py-3 bg-white ${m.is_active === 0 ? 'opacity-50' : ''}`}>
              {editId === m.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate(m.id)}
                    className="flex-1 max-w-xs"
                    autoFocus
                  />
                  <Button variant="primary" size="sm" onClick={() => handleUpdate(m.id)} isLoading={saving}>{isAr ? 'حفظ' : 'Save'}</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditId(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-800">{m.name}</span>
                  {m.is_active === 0 && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{isAr ? 'معطل' : 'Inactive'}</span>
                  )}
                  <Button variant="outline" size="sm" onClick={() => { setEditId(m.id); setEditName(m.name) }}>
                    {isAr ? 'تعديل' : 'Edit'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(m.id, m.is_active)}
                  >
                    {m.is_active === 1 ? (isAr ? 'تعطيل' : 'Disable') : (isAr ? 'تفعيل' : 'Enable')}
                  </Button>
                  {deleteConfirm === m.id ? (
                    <>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(m.id)}>{isAr ? 'تأكيد الحذف' : 'Confirm'}</Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                    </>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(m.id)}>{isAr ? 'حذف' : 'Delete'}</Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
