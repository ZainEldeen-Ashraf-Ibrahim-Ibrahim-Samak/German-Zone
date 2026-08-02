import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Branch, BranchMode } from '../types/index.js'

/** Remembers the branch the user last worked in, so the app reopens where they left off. */
const STORAGE_KEY = 'gz.selectedBranchId'

function readStoredBranchId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

interface BranchState {
  /** Branches the signed-in user may work in (all of them, for admins). */
  branches: Branch[]
  /** How this user is attached to branches — drives the label in the header. */
  mode: BranchMode
  /** `null` = "all branches"; only offered to users covering more than one. */
  selectedBranchId: number | null
  isLoading: boolean
  error: string | null

  fetchMine: () => Promise<void>
  selectBranch: (id: number | null) => void
  clearError: () => void
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  mode: 'branch',
  selectedBranchId: readStoredBranchId(),
  isLoading: false,
  error: null,

  fetchMine: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.branches.mine()
      const branches: Branch[] = result?.branches ?? []

      // Keep the remembered branch only if the user still covers it; otherwise fall back to
      // their primary branch, then to "all" when they cover several, then to their only branch.
      const current = get().selectedBranchId
      let selected: number | null = null
      if (current != null && branches.some((b) => b.id === current)) {
        selected = current
      } else if (result?.primary_branch_id && branches.some((b) => b.id === result.primary_branch_id)) {
        selected = result.primary_branch_id
      } else if (branches.length === 1) {
        selected = branches[0].id
      }

      if (selected == null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(selected))

      set({ branches, mode: result?.mode ?? 'branch', selectedBranchId: selected, isLoading: false })
    } catch (err: any) {
      set({ error: friendlyError(err, 'Failed to load branches'), isLoading: false })
    }
  },

  selectBranch: (id) => {
    if (id == null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
    set({ selectedBranchId: id })
  },

  clearError: () => set({ error: null }),
}))
