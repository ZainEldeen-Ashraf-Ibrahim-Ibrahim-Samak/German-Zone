import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth, getCurrentUser } from './_guard.js'
import { recordLocalTombstone } from '../services/tombstones.js'

/**
 * How a user is attached to branches:
 *   'branch' — works out of one physical branch
 *   'online' — works with online students only
 *   'mixed'  — covers a physical branch AND online (or several branches)
 * The authoritative coverage list is `user_branches`; `branch_mode` records the intent so the
 * UI can label an account without inspecting the list.
 */
export type BranchMode = 'branch' | 'online' | 'mixed'

const BRANCH_MODES: BranchMode[] = ['branch', 'online', 'mixed']

/** Branch ids the given user may see. `null` means "everything" (admins are not scoped). */
export function branchScopeFor(userId: number, role: string): number[] | null {
  if (role === 'admin') return null
  const db = getDb()
  const rows = db.prepare('SELECT branch_id FROM user_branches WHERE user_id = ?').all(userId) as { branch_id: number }[]
  return rows.map((r) => r.branch_id)
}

ipcMain.handle('branches:list', async (_event, args = {}) => {
  try {
    checkAuth()
    const db = getDb()

    let query = `
      SELECT b.*, u.name AS manager_name, u.username AS manager_username,
             (SELECT COUNT(*) FROM students s WHERE s.branch_id = b.id AND s.is_active = 1) AS student_count,
             (SELECT COUNT(*) FROM employees e WHERE e.branch_id = b.id AND e.is_active = 1) AS employee_count,
             (SELECT COUNT(*) FROM halls h WHERE h.branch_id = b.id AND h.is_active = 1) AS hall_count
      FROM branches b
      LEFT JOIN users u ON u.id = b.manager_user_id
      WHERE 1=1
    `
    const params: any[] = []
    if (args?.activeOnly !== false) query += ' AND b.is_active = 1'
    if (args?.kind) {
      query += ' AND b.kind = ?'
      params.push(args.kind)
    }
    query += ' ORDER BY b.kind ASC, b.name ASC'

    return db.prepare(query).all(...params)
  } catch (error: any) {
    console.error('Failed to list branches:', error)
    throw new Error(error.message || 'Failed to list branches')
  }
})

/** The branches the signed-in user may switch between, for the header's branch selector. */
ipcMain.handle('branches:mine', async () => {
  try {
    checkAuth()
    const db = getDb()
    const user = getCurrentUser()!

    const row = db.prepare('SELECT branch_mode, primary_branch_id FROM users WHERE id = ?').get(user.id) as any
    const mode: BranchMode = (row?.branch_mode as BranchMode) || 'branch'

    // Admins are never branch-scoped — they see and can switch to every branch.
    if (user.role === 'admin') {
      return {
        mode: 'mixed' as BranchMode,
        primary_branch_id: row?.primary_branch_id ?? null,
        branches: db.prepare('SELECT * FROM branches WHERE is_active = 1 ORDER BY kind ASC, name ASC').all(),
      }
    }

    const branches = db.prepare(`
      SELECT b.* FROM branches b
      JOIN user_branches ub ON ub.branch_id = b.id
      WHERE ub.user_id = ? AND b.is_active = 1
      ORDER BY b.kind ASC, b.name ASC
    `).all(user.id)

    return { mode, primary_branch_id: row?.primary_branch_id ?? null, branches }
  } catch (error: any) {
    console.error('Failed to resolve user branches:', error)
    throw new Error(error.message || 'Failed to resolve user branches')
  }
})

ipcMain.handle('branches:add', async (_event, args) => {
  try {
    requireAdmin()
    const db = getDb()

    const name = String(args?.name ?? '').trim()
    if (!name) throw new Error('اسم الفرع مطلوب / Branch name is required')

    const kind = args?.kind === 'online' ? 'online' : 'physical'
    const existing = db.prepare('SELECT id FROM branches WHERE name = ?').get(name)
    if (existing) throw new Error('اسم الفرع موجود بالفعل / Branch name already exists')

    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO branches (name, code, city, address, phone, kind, manager_user_id, is_active, created_at, updated_at, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
    `).run(
      name,
      args?.code?.trim() || null,
      args?.city?.trim() || null,
      args?.address?.trim() || null,
      args?.phone?.trim() || null,
      kind,
      args?.manager_user_id ? Number(args.manager_user_id) : null,
      now, now
    )

    return db.prepare('SELECT * FROM branches WHERE id = ?').get(Number(result.lastInsertRowid))
  } catch (error: any) {
    console.error('Failed to add branch:', error)
    throw new Error(error.message || 'Failed to add branch')
  }
})

ipcMain.handle('branches:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id || !patch) throw new Error('Branch ID and patch data are required')

    const branch = db.prepare('SELECT * FROM branches WHERE id = ?').get(id)
    if (!branch) throw new Error('الفرع غير موجود / Branch not found')

    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) throw new Error('اسم الفرع مطلوب / Branch name is required')
      const clash = db.prepare('SELECT id FROM branches WHERE name = ? AND id != ?').get(name, id)
      if (clash) throw new Error('اسم الفرع موجود بالفعل / Branch name already exists')
    }

    const allowed = ['name', 'code', 'city', 'address', 'phone', 'kind', 'manager_user_id', 'is_active']
    const sets: string[] = []
    const params: any[] = []
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        sets.push(`${key} = ?`)
        params.push(patch[key])
      }
    }
    if (sets.length === 0) return branch

    params.push(new Date().toISOString(), id)
    db.prepare(`UPDATE branches SET ${sets.join(', ')}, updated_at = ?, synced = 0 WHERE id = ?`).run(...params)

    return db.prepare('SELECT * FROM branches WHERE id = ?').get(id)
  } catch (error: any) {
    console.error('Failed to update branch:', error)
    throw new Error(error.message || 'Failed to update branch')
  }
})

/**
 * Deletes a branch. Refused while students, employees or halls still point at it — reassigning
 * them is a decision for the admin, not something to silently orphan.
 */
ipcMain.handle('branches:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id) throw new Error('Branch ID is required')

    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students  WHERE branch_id = ?) AS students,
        (SELECT COUNT(*) FROM employees WHERE branch_id = ?) AS employees,
        (SELECT COUNT(*) FROM halls     WHERE branch_id = ?) AS halls
    `).get(id, id, id) as any

    if (counts.students > 0 || counts.employees > 0 || counts.halls > 0) {
      throw new Error(
        'لا يمكن حذف فرع مرتبط بطلاب أو موظفين أو قاعات — انقلهم أولاً / ' +
        'Cannot delete a branch that still has students, employees or halls — reassign them first'
      )
    }

    db.transaction(() => {
      // Every removed row is tombstoned so the delete propagates instead of the next pull
      // restoring the branch and its coverage rows from the cloud.
      for (const row of db.prepare('SELECT id FROM user_branches WHERE branch_id = ?').all(id) as { id: number }[]) {
        recordLocalTombstone(db, 'user_branches', row.id)
      }
      db.prepare('DELETE FROM user_branches WHERE branch_id = ?').run(id)
      db.prepare('UPDATE users SET primary_branch_id = NULL, synced = 0 WHERE primary_branch_id = ?').run(id)
      db.prepare('DELETE FROM branches WHERE id = ?').run(id)
      recordLocalTombstone(db, 'branches', Number(id))
    })()

    return { ok: true }
  } catch (error: any) {
    console.error('Failed to delete branch:', error)
    throw new Error(error.message || 'Failed to delete branch')
  }
})

/** Makes a user the manager of a branch (and ensures they cover it). */
ipcMain.handle('branches:setManager', async (_event, { branch_id, user_id }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!branch_id) throw new Error('Branch ID is required')

    const branch = db.prepare('SELECT id FROM branches WHERE id = ?').get(branch_id)
    if (!branch) throw new Error('الفرع غير موجود / Branch not found')

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('UPDATE branches SET manager_user_id = ?, updated_at = ?, synced = 0 WHERE id = ?')
        .run(user_id ? Number(user_id) : null, now, branch_id)
      if (user_id) {
        db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id, created_at, updated_at, synced) VALUES (?, ?, ?, ?, 0)')
          .run(Number(user_id), branch_id, now, now)
      }
    })()

    return db.prepare('SELECT * FROM branches WHERE id = ?').get(branch_id)
  } catch (error: any) {
    console.error('Failed to set branch manager:', error)
    throw new Error(error.message || 'Failed to set branch manager')
  }
})

/**
 * Sets a user's branch coverage in one call: the mode plus the exact list of branches.
 * 'online' resolves to the online branches when no explicit list is given, so an "online user"
 * can be configured with a single choice.
 */
ipcMain.handle('branches:assignUser', async (_event, { user_id, mode, branch_ids, primary_branch_id = null }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!user_id) throw new Error('User ID is required')

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id)
    if (!user) throw new Error('المستخدم غير موجود / User not found')

    const resolvedMode: BranchMode = BRANCH_MODES.includes(mode) ? mode : 'branch'

    let ids: number[] = Array.isArray(branch_ids) ? branch_ids.map(Number).filter(Number.isFinite) : []
    if (ids.length === 0 && resolvedMode === 'online') {
      ids = (db.prepare("SELECT id FROM branches WHERE kind = 'online' AND is_active = 1").all() as { id: number }[])
        .map((r) => r.id)
    }
    if (ids.length === 0) {
      throw new Error('يجب اختيار فرع واحد على الأقل / At least one branch must be selected')
    }
    if (resolvedMode === 'branch' && ids.length > 1) {
      throw new Error('وضع "فرع واحد" يسمح بفرع واحد فقط — استخدم "مشترك" / Single-branch mode allows one branch only — use "mixed"')
    }

    const now = new Date().toISOString()
    db.transaction(() => {
      // Coverage is rewritten wholesale and the new rows get new ids, so the old ones are
      // tombstoned — otherwise a pull would re-add branches the admin just took away.
      for (const row of db.prepare('SELECT id FROM user_branches WHERE user_id = ?').all(user_id) as { id: number }[]) {
        recordLocalTombstone(db, 'user_branches', row.id)
      }
      db.prepare('DELETE FROM user_branches WHERE user_id = ?').run(user_id)
      const insert = db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id, created_at, updated_at, synced) VALUES (?, ?, ?, ?, 0)')
      for (const bid of ids) insert.run(user_id, bid, now, now)

      // The primary branch must be one the user actually covers, otherwise the header would
      // open on a branch whose data they cannot see.
      const primary = primary_branch_id && ids.includes(Number(primary_branch_id))
        ? Number(primary_branch_id)
        : ids[0]

      db.prepare(`
        UPDATE users SET branch_mode = ?, primary_branch_id = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), synced = 0
        WHERE id = ?
      `).run(resolvedMode, primary, user_id)
    })()

    return {
      ok: true,
      mode: resolvedMode,
      branches: db.prepare(`
        SELECT b.* FROM branches b JOIN user_branches ub ON ub.branch_id = b.id
        WHERE ub.user_id = ? ORDER BY b.kind ASC, b.name ASC
      `).all(user_id),
    }
  } catch (error: any) {
    console.error('Failed to assign user branches:', error)
    throw new Error(error.message || 'Failed to assign user branches')
  }
})

/** Branch coverage for every user — powers the branch column in the Users list. */
ipcMain.handle('branches:userAssignments', async () => {
  try {
    requireAdmin()
    const db = getDb()

    const users = db.prepare('SELECT id, branch_mode, primary_branch_id FROM users').all() as any[]
    const links = db.prepare(`
      SELECT ub.user_id, b.id, b.name, b.kind
      FROM user_branches ub JOIN branches b ON b.id = ub.branch_id
    `).all() as any[]

    return users.map((u) => ({
      user_id: u.id,
      mode: (u.branch_mode as BranchMode) || 'branch',
      primary_branch_id: u.primary_branch_id ?? null,
      branches: links.filter((l) => l.user_id === u.id).map(({ id, name, kind }) => ({ id, name, kind })),
    }))
  } catch (error: any) {
    console.error('Failed to list user branch assignments:', error)
    throw new Error(error.message || 'Failed to list user branch assignments')
  }
})
