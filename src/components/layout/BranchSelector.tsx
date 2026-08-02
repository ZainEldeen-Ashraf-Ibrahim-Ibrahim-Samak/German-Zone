import * as React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useBranchStore } from '../../store/useBranchStore.js'
import { useStudentsStore } from '../../store/useStudentsStore.js'

/**
 * Branch switcher in the header. Users attached to a single branch see it as a static label
 * (there is nothing to switch to); users covering several — mixed accounts, branch managers,
 * admins — get a dropdown that also offers "all branches".
 */
export const BranchSelector: React.FC = () => {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { branches, mode, selectedBranchId, fetchMine, selectBranch } = useBranchStore()
  const fetchStudents = useStudentsStore((s) => s.fetchStudents)

  useEffect(() => {
    fetchMine()
  }, [fetchMine])

  if (branches.length === 0) return null

  const modeLabel = isAr
    ? { branch: 'فرع', online: 'أونلاين', mixed: 'مشترك' }[mode]
    : { branch: 'Branch', online: 'Online', mixed: 'Mixed' }[mode]

  const handleChange = (raw: string) => {
    selectBranch(raw === '' ? null : Number(raw))
    // The students list is branch-scoped, so refresh it against the newly focused branch.
    fetchStudents()
  }

  if (branches.length === 1) {
    return (
      <div className="flex flex-col text-start leading-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{modeLabel}</span>
        <span className="text-sm font-semibold text-slate-700 truncate max-w-48">{branches[0].name}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{modeLabel}</span>
      <select
        value={selectedBranchId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 max-w-56"
      >
        <option value="">{isAr ? 'كل الفروع' : 'All branches'}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.kind === 'online' ? '🌐 ' : '🏢 '}{b.name}
          </option>
        ))}
      </select>
    </div>
  )
}
