import * as React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/useAuthStore.js'
import { Table } from '../../components/ui/Table.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Badge } from '../../components/ui/Badge.js'
import { Alert } from '../../components/ui/Alert.js'
import { Card } from '../../components/ui/Card.js'
import type { Branch, BranchMode, User, UserBranchAssignment, UserRole } from '../../types/index.js'

export default function UsersList() {
  const { t } = useTranslation()
  const { user: currentUser } = useAuthStore()

  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  
  // Form fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('employee')
  const [name, setName] = useState('')
  const [isSubmitLoading, setIsSubmitLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Branch coverage: 'branch' (one location), 'online' (online students only) or 'mixed'
  // (a location AND online / several branches at once).
  const [branches, setBranches] = useState<Branch[]>([])
  const [assignments, setAssignments] = useState<UserBranchAssignment[]>([])
  const [branchMode, setBranchMode] = useState<BranchMode>('branch')
  const [branchIds, setBranchIds] = useState<number[]>([])
  const [primaryBranchId, setPrimaryBranchId] = useState<number | ''>('')

  // Deactivate states
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null)

  // Delete states
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)

  const fetchUsers = async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await window.api.users.list()
      setUsers(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBranchData = async () => {
    try {
      const [list, assigned] = await Promise.all([
        window.api.branches.list(),
        window.api.branches.userAssignments(),
      ])
      setBranches(list || [])
      setAssignments(assigned || [])
    } catch (err) {
      console.error('Failed to load branch assignments:', err)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchBranchData()
  }, [])

  /** The branch defaults a fresh account starts from: single branch, first physical one. */
  const resetBranchFields = () => {
    const firstPhysical = branches.find((b) => b.kind === 'physical') ?? branches[0]
    setBranchMode('branch')
    setBranchIds(firstPhysical ? [firstPhysical.id] : [])
    setPrimaryBranchId(firstPhysical ? firstPhysical.id : '')
  }

  const handleOpenCreate = () => {
    setEditingUser(null)
    setUsername('')
    setPassword('')
    setRole('employee')
    setName('')
    resetBranchFields()
    setFormError('')
    setIsFormOpen(true)
  }

  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setUsername(user.username)
    setPassword('')
    setRole(user.role)
    setName(user.name || '')

    const assignment = assignments.find((a) => a.user_id === user.id)
    if (assignment && assignment.branches.length > 0) {
      setBranchMode(assignment.mode)
      setBranchIds(assignment.branches.map((b) => b.id))
      setPrimaryBranchId(assignment.primary_branch_id ?? assignment.branches[0].id)
    } else {
      resetBranchFields()
    }

    setFormError('')
    setIsFormOpen(true)
  }

  /**
   * Switching mode re-seeds the branch selection so the choice stays coherent:
   * 'online' selects the online branches, 'branch' narrows back down to a single one.
   */
  const handleModeChange = (mode: BranchMode) => {
    setBranchMode(mode)
    if (mode === 'online') {
      const online = branches.filter((b) => b.kind === 'online').map((b) => b.id)
      setBranchIds(online)
      setPrimaryBranchId(online[0] ?? '')
    } else if (mode === 'branch') {
      const first = branchIds[0] ?? branches.find((b) => b.kind === 'physical')?.id ?? branches[0]?.id
      setBranchIds(first ? [first] : [])
      setPrimaryBranchId(first ?? '')
    }
  }

  const toggleBranch = (id: number) => {
    if (branchMode === 'branch') {
      setBranchIds([id])
      setPrimaryBranchId(id)
      return
    }
    setBranchIds((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
      // The primary branch must stay one the user actually covers.
      if (!next.includes(Number(primaryBranchId))) setPrimaryBranchId(next[0] ?? '')
      return next
    })
  }

  const handleOpenDeactivate = (user: User) => {
    setUserToDeactivate(user)
    setIsDeactivateOpen(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setIsSubmitLoading(true)

    try {
      if (!username.trim() || !role) {
        throw new Error(t('username_role_required'))
      }

      if (branchIds.length === 0) {
        throw new Error(t('branch_required'))
      }

      if (!editingUser) {
        // Create Mode
        if (!password) {
          throw new Error(t('password_required_new'))
        }
        const created = await window.api.users.create({
          username: username.trim(),
          password,
          role,
          name: name.trim() || undefined,
        })
        await window.api.branches.assignUser({
          user_id: created.id,
          mode: branchMode,
          branch_ids: branchIds,
          primary_branch_id: primaryBranchId === '' ? null : Number(primaryBranchId),
        })
        setSuccessMsg(t('user_created_success'))
      } else {
        // Edit Mode
        const patch: any = {
          username: username.trim(),
          role,
          name: name.trim() || null,
        }
        if (password) {
          patch.password = password
        }
        await window.api.users.update({
          id: editingUser.id,
          patch,
        })
        await window.api.branches.assignUser({
          user_id: editingUser.id,
          mode: branchMode,
          branch_ids: branchIds,
          primary_branch_id: primaryBranchId === '' ? null : Number(primaryBranchId),
        })
        setSuccessMsg(t('user_updated_success'))
      }

      setIsFormOpen(false)
      fetchUsers()
      fetchBranchData()
    } catch (err: any) {
      console.error(err)
      setFormError(err.message || 'Operation failed')
    } finally {
      setIsSubmitLoading(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!userToDeactivate) return
    setError('')
    try {
      await window.api.users.deactivate({ id: userToDeactivate.id })
      setSuccessMsg(t('user_deactivated_success'))
      setIsDeactivateOpen(false)
      fetchUsers()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to deactivate account')
      setIsDeactivateOpen(false)
    }
  }

  const handleActivate = async (user: User) => {
    setError('')
    try {
      await window.api.users.update({ id: user.id, patch: { is_active: 1 } })
      setSuccessMsg(t('user_activated_success'))
      fetchUsers()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to activate account')
    }
  }

  const handleOpenDelete = (user: User) => {
    setUserToDelete(user)
    setIsDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!userToDelete) return
    setError('')
    try {
      await window.api.users.delete({ id: userToDelete.id })
      setSuccessMsg(t('user_deleted_success'))
      setIsDeleteOpen(false)
      fetchUsers()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to delete account')
      setIsDeleteOpen(false)
    }
  }

  // Define table columns
  const columns = [
    {
      key: 'name',
      header: t('display_name'),
      render: (u: User) => <span className="font-semibold text-slate-800">{u.name || '-'}</span>,
    },
    {
      key: 'username',
      header: t('username'),
      render: (u: User) => <code className="text-slate-600 bg-slate-100/60 px-2 py-0.5 rounded text-xs">{u.username}</code>,
    },
    {
      key: 'role',
      header: t('role'),
      render: (u: User) => (
        <Badge variant={u.role === 'admin' ? 'info' : u.role === 'branch_manager' ? 'warning' : 'neutral'}>
          {t(u.role === 'admin' ? 'admin' : u.role === 'branch_manager' ? 'branch_manager' : 'employee')}
        </Badge>
      ),
    },
    {
      key: 'branches',
      header: t('branch_coverage'),
      render: (u: User) => {
        const assignment = assignments.find((a) => a.user_id === u.id)
        if (!assignment || assignment.branches.length === 0) {
          return <span className="text-xs text-slate-400">—</span>
        }
        return (
          <div className="flex flex-col gap-1 text-start">
            <Badge variant={assignment.mode === 'mixed' ? 'warning' : assignment.mode === 'online' ? 'info' : 'neutral'}>
              {t(`branch_mode_${assignment.mode}`)}
            </Badge>
            <span className="text-xs text-slate-500">
              {assignment.branches.map((b) => b.name).join('، ')}
            </span>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: t('status'),
      render: (u: User) => (
        <Badge variant={u.is_active === 1 ? 'success' : 'danger'}>
          {u.is_active === 1 ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (u: User) => {
        const isSelf = currentUser?.id === u.id
        return (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenEdit(u)}>
              {t('edit')}
            </Button>
            {!isSelf && (
              <>
                {u.is_active === 1 ? (
                  <Button variant="outline" size="sm" onClick={() => handleOpenDeactivate(u)} className="text-amber-600 border-amber-100 hover:bg-amber-50 hover:border-amber-200">
                    {t('deactivate')}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleActivate(u)} className="text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200">
                    {t('activate')}
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => handleOpenDelete(u)}>
                  {t('delete')}
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 text-start">
          <h2 className="text-2xl font-bold text-slate-800 m-0">
            {t('user_mgmt')}
          </h2>
          <span className="text-slate-400 text-sm font-semibold">
            {t('admin_only')}
          </span>
        </div>
        <Button variant="primary" size="md" onClick={handleOpenCreate}>
          + {t('add_user')}
        </Button>
      </div>

      {/* Messages */}
      {successMsg && (
        <Alert variant="success" onClose={() => setSuccessMsg('')}>
          {successMsg}
        </Alert>
      )}

      {error && (
        <Alert variant="danger" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Users List Card */}
      <Card>
        <Table
          columns={columns}
          data={users}
          keyExtractor={(u) => u.id}
          isLoading={isLoading}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={
          editingUser 
            ? 'تعديل حساب مستخدم / Edit User Account' 
            : 'إنشاء حساب مستخدم جديد / Create User Account'
        }
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitLoading}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={handleFormSubmit} isLoading={isSubmitLoading}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {formError && (
            <Alert variant="danger" onClose={() => setFormError('')}>
              {formError}
            </Alert>
          )}

          <Input
            label={t('username')}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isSubmitLoading || editingUser !== null} // Lock username on edit
            required
          />

          <Input
            label={editingUser ? t('new_password_optional') : t('password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editingUser ? t('password_placeholder') : "••••••••"}
            disabled={isSubmitLoading}
            required={editingUser === null}
          />

          <Input
            label={t('display_name')}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد علي"
            disabled={isSubmitLoading}
          />

          <Select
            label={t('access_role')}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSubmitLoading || (editingUser !== null && currentUser?.id === editingUser.id)} // Prevent altering own role
            options={[
              { value: 'admin', label: t('admin') },
              { value: 'branch_manager', label: t('branch_manager') },
              { value: 'employee', label: t('employee') },
            ]}
          />
          <p className="text-xs text-slate-400 -mt-2 text-start">
            {t('branch_manager_hint')}
          </p>

          {/* Branch coverage — where this account works */}
          <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
            <Select
              label={t('branch_coverage')}
              value={branchMode}
              onChange={(e) => handleModeChange(e.target.value as BranchMode)}
              disabled={isSubmitLoading}
              options={[
                { value: 'branch', label: t('branch_mode_branch') },
                { value: 'online', label: t('branch_mode_online') },
                { value: 'mixed', label: t('branch_mode_mixed') },
              ]}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 text-start">
                {branchMode === 'branch' ? t('select_branch') : t('select_branches')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => {
                  const active = branchIds.includes(b.id)
                  return (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => toggleBranch(b.id)}
                      disabled={isSubmitLoading}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                        active
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {b.kind === 'online' ? '🌐 ' : '🏢 '}{b.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {branchIds.length > 1 && (
              <Select
                label={t('primary_branch')}
                value={primaryBranchId}
                onChange={(e) => setPrimaryBranchId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={isSubmitLoading}
                options={branches
                  .filter((b) => branchIds.includes(b.id))
                  .map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        isOpen={isDeactivateOpen}
        onClose={() => setIsDeactivateOpen(false)}
        title={t('deactivate_account')}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsDeactivateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDeactivate}>
              {t('deactivate')}
            </Button>
          </div>
        }
      >
        <p className="text-slate-600 leading-relaxed text-start">
          {t('deactivate_confirm_desc', { name: userToDeactivate?.name || userToDeactivate?.username })}
        </p>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title={t('delete_account')}
        footer={
          <div className="flex gap-2.5">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t('delete')}
            </Button>
          </div>
        }
      >
        <p className="text-slate-600 leading-relaxed text-start">
          {t('delete_confirm_desc', { name: userToDelete?.name || userToDelete?.username })}
        </p>
      </Modal>
    </div>
  )
}