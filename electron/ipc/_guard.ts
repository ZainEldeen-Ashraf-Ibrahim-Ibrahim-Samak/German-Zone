import { getCurrentUser as _getCurrentUser } from './authIPC.js'
import { getDb } from '../db/connection.js'

export { _getCurrentUser as getCurrentUser }

/**
 * Roles, widest first:
 *   admin          — everything, never branch-scoped.
 *   branch_manager — full management of the branches they cover; global configuration
 *                    (users, settings, sync, the branch list itself) stays admin-only.
 *   employee       — day-to-day work only.
 */
export type Role = 'admin' | 'branch_manager' | 'employee'

export function requireAdmin(): void {
  const user = _getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
  if (user.role !== 'admin') {
    throw new Error('FORBIDDEN: غير مسموح بالوصول لغير المسؤولين / Forbidden')
  }
}

/**
 * Admin OR branch manager. Use for management actions that are meaningful per branch — editing
 * students, planning instalments, managing halls — as opposed to global configuration.
 */
export function requireManager(): void {
  const user = _getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
  if (user.role !== 'admin' && user.role !== 'branch_manager') {
    throw new Error('FORBIDDEN: هذا الإجراء متاح للمسؤولين ومديري الفروع فقط / Forbidden: admins and branch managers only')
  }
}

export function checkAuth(): void {
  const user = _getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

// ── Branch scoping ────────────────────────────────────────────────────────────

/**
 * The branch ids the signed-in user may read, or `null` for "unrestricted".
 *
 * Unrestricted means admins (who are never scoped) AND any user with no `user_branches` rows at
 * all. That second case matters for upgrades: every account predates branch assignment, so
 * treating "no assignment" as "no access" would lock the whole team out the moment this ships.
 * An account becomes scoped only once someone actually assigns it branches.
 */
export function currentBranchScope(): number[] | null {
  const user = _getCurrentUser()
  if (!user) return null
  if (user.role === 'admin') return null

  const rows = getDb()
    .prepare('SELECT branch_id FROM user_branches WHERE user_id = ?')
    .all(user.id) as { branch_id: number }[]

  return rows.length === 0 ? null : rows.map((r) => r.branch_id)
}

/**
 * A `WHERE` fragment restricting `<column>` to the user's branches, plus its bound parameters.
 * Returns an empty clause when the user is unrestricted.
 *
 * Rows with a NULL branch are always included: a student nobody has assigned to a branch yet must
 * never become invisible — silently hiding records is worse than showing an unassigned one.
 */
export function branchScopeClause(column: string): { clause: string; params: number[] } {
  const scope = currentBranchScope()
  if (scope === null) return { clause: '', params: [] }
  if (scope.length === 0) return { clause: ` AND ${column} IS NULL`, params: [] }

  const placeholders = scope.map(() => '?').join(',')
  return { clause: ` AND (${column} IN (${placeholders}) OR ${column} IS NULL)`, params: scope }
}

/** True when the user may act on the given branch (unrestricted users may act on any). */
export function canAccessBranch(branchId: number | null | undefined): boolean {
  const scope = currentBranchScope()
  if (scope === null) return true
  if (branchId == null) return true
  return scope.includes(Number(branchId))
}

/** Throws unless the user covers the given branch. */
export function requireBranchAccess(branchId: number | null | undefined): void {
  if (!canAccessBranch(branchId)) {
    throw new Error('FORBIDDEN: لا تملك صلاحية على هذا الفرع / Forbidden: you do not have access to this branch')
  }
}
