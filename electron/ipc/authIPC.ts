import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/connection.js'
import type { User } from '../../src/types/index.js'
import { requireAdmin } from './_guard.js'
import { getJwtSecret } from '../env.js'

// Session persistence in Electron main process memory
let currentUserSession: User | null = null

export function getCurrentUser(): User | null {
  return currentUserSession
}

export function setCurrentUser(user: User | null): void {
  currentUserSession = user
}

ipcMain.handle('auth:login', async (_event, { username, password }) => {
  try {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
    
    if (!user) {
      throw new Error('USER_NOT_FOUND')
    }
    
    if (user.is_active === 0) {
      throw new Error('USER_DEACTIVATED')
    }
    
    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      throw new Error('INVALID_PASSWORD')
    }
    
    const userData: User = {
      id: user.id,
      username: user.username,
      role: user.role as 'admin' | 'employee',
      name: user.name,
      is_active: user.is_active,
      created_at: user.created_at
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      getJwtSecret(),
      { expiresIn: '30d' }
    )
    
    currentUserSession = userData
    return { user: userData, token }
  } catch (error: any) {
    console.error('Login error:', error)
    if (error.message === 'USER_NOT_FOUND' || error.message === 'INVALID_PASSWORD') {
      throw new Error('INVALID_PASSWORD')
    } else if (error.message === 'USER_DEACTIVATED') {
      throw new Error('USER_DEACTIVATED')
    }
    throw new Error(error.message || 'AUTH_FAILED')
  }
})

ipcMain.handle('auth:logout', () => {
  currentUserSession = null
  return { ok: true }
})

ipcMain.handle('auth:current', () => {
  return currentUserSession ? { user: currentUserSession } : null
})

/**
 * auth:restore — Restore a session from a previously issued JWT (persisted in the
 * renderer). Verifies the token, reloads the user from the DB, and re-establishes
 * the main-process session so it survives app restarts.
 */
ipcMain.handle('auth:restore', async (_event, { token }) => {
  try {
    if (!token) return null

    const payload = jwt.verify(token, getJwtSecret()) as { id: number }
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as any

    if (!user || user.is_active === 0) {
      currentUserSession = null
      return null
    }

    const userData: User = {
      id: user.id,
      username: user.username,
      role: user.role as 'admin' | 'employee',
      name: user.name,
      is_active: user.is_active,
      created_at: user.created_at
    }

    currentUserSession = userData
    return { user: userData }
  } catch {
    // Invalid/expired token — treat as no session
    currentUserSession = null
    return null
  }
})

ipcMain.handle('users:list', async () => {
  try {
    requireAdmin()
    const db = getDb()
    const rows = db.prepare('SELECT id, username, role, name, is_active, created_at FROM users').all() as User[]
    return rows
  } catch (error: any) {
    console.error('Failed to list users:', error)
    throw new Error(error.message || 'Failed to list users')
  }
})

ipcMain.handle('users:create', async (_event, { username, password, role, name }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    if (!username || !password || !role) {
      throw new Error('اسم المستخدم وكلمة المرور والصلاحية مطلوبة / Username, password, and role are required')
    }
    
    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      throw new Error('اسم المستخدم موجود بالفعل / Username already exists')
    }
    
    const hashedPassword = await bcrypt.hash(password, 10)

    const result = db.prepare(`
      INSERT INTO users (username, password, role, name, is_active, updated_at, synced)
      VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `).run(username, hashedPassword, role, name || null)
    
    return {
      id: Number(result.lastInsertRowid),
      username,
      role,
      name,
      is_active: 1
    }
  } catch (error: any) {
    console.error('Failed to create user:', error)
    throw new Error(error.message || 'Failed to create user')
  }
})

ipcMain.handle('users:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    if (!id || !patch) {
      throw new Error('User ID and patch data are required')
    }
    
    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
    if (!user) {
      throw new Error('المستخدم غير موجود / User not found')
    }
    
    let query = "UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), synced = 0, "
    const params: any[] = []

    if (patch.username !== undefined) {
      // Check if username is taken
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(patch.username, id)
      if (existing) {
        throw new Error('اسم المستخدم موجود بالفعل / Username already exists')
      }
      query += 'username = ?, '
      params.push(patch.username)
    }
    
    if (patch.password !== undefined && patch.password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(patch.password, 10)
      query += 'password = ?, '
      params.push(hashedPassword)
    }
    
    if (patch.role !== undefined) {
      query += 'role = ?, '
      params.push(patch.role)
    }
    
    if (patch.name !== undefined) {
      query += 'name = ?, '
      params.push(patch.name)
    }
    
    if (patch.is_active !== undefined) {
      // Prevent self deactivation
      const currentUser = getCurrentUser()
      if (currentUser && currentUser.id === id && patch.is_active === 0) {
        throw new Error('لا يمكن إلغاء تنشيط حسابك الحالي / Cannot deactivate your own active session')
      }
      query += 'is_active = ?, '
      params.push(patch.is_active)
    }
    
    // Check if nothing to update
    if (params.length === 0) {
      return db.prepare('SELECT id, username, role, name, is_active, created_at FROM users WHERE id = ?').get(id) as User
    }
    
    // Remove trailing comma and space
    query = query.slice(0, -2)
    query += ' WHERE id = ?'
    params.push(id)
    
    db.prepare(query).run(...params)
    
    const updatedUser = db.prepare('SELECT id, username, role, name, is_active, created_at FROM users WHERE id = ?').get(id) as User
    return updatedUser
  } catch (error: any) {
    console.error('Failed to update user:', error)
    throw new Error(error.message || 'Failed to update user')
  }
})

ipcMain.handle('users:deactivate', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    const currentUser = getCurrentUser()
    if (currentUser && currentUser.id === id) {
      throw new Error('لا يمكن إلغاء تنشيط حسابك الحالي / Cannot deactivate your own active session')
    }
    
    db.prepare("UPDATE users SET is_active = 0, synced = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(id)
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to deactivate user:', error)
    throw new Error(error.message || 'Failed to deactivate user')
  }
})

ipcMain.handle('users:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    
    const currentUser = getCurrentUser()
    if (currentUser && currentUser.id === id) {
      throw new Error('لا يمكن حذف حسابك الحالي / Cannot delete your own active session')
    }
    
    db.prepare(`
      INSERT OR IGNORE INTO tombstones (entity, record_id, created_at, synced)
      VALUES ('users', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 0)
    `).run(id)
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    return { ok: true }
  } catch (error: any) {
    console.error('Failed to delete user:', error)
    throw new Error(error.message || 'Failed to delete user')
  }
})