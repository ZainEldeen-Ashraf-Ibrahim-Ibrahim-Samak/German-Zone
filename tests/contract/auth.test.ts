import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, closeDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { seedDatabase } from '../../electron/db/seed.js'

// Mock Electron's ipcMain using globalThis to avoid hoisting issues
vi.mock('electron', () => {
  const handlers: Record<string, Function> = {};
  (globalThis as any).__authHandlers = handlers

  return {
    ipcMain: {
      handle: (channel: string, callback: Function) => {
        ;(globalThis as any).__authHandlers[channel] = callback
      }
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

// Import the IPC file to register handlers and access helper functions
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Auth & Users IPC Contract tests', () => {
  let db: any
  const getHandlers = () => (globalThis as any).__authHandlers

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    db = initDb()
    runMigrations(db)
    await seedDatabase(db)
  })

  beforeEach(() => {
    // Reset session before each test
    setCurrentUser(null)
  })

  it('should successfully login default admin', async () => {
    const loginHandler = getHandlers()['auth:login']
    expect(loginHandler).toBeDefined()

    const result = await loginHandler(null, { username: 'admin', password: 'admin123' })
    expect(result.user).toBeDefined()
    expect(result.user.username).toBe('admin')
    expect(result.user.role).toBe('admin')
    expect(result.token).toBeDefined()
  })

  it('should reject login with wrong password', async () => {
    const loginHandler = getHandlers()['auth:login']
    await expect(
      loginHandler(null, { username: 'admin', password: 'wrongpassword' })
    ).rejects.toThrow()
  })

  it('should reject login for non-existent user', async () => {
    const loginHandler = getHandlers()['auth:login']
    await expect(
      loginHandler(null, { username: 'nonexistent', password: 'password' })
    ).rejects.toThrow()
  })

  it('should logout and clear session', async () => {
    const loginHandler = getHandlers()['auth:login']
    const logoutHandler = getHandlers()['auth:logout']
    const currentHandler = getHandlers()['auth:current']

    // Login
    await loginHandler(null, { username: 'admin', password: 'admin123' })
    let current = await currentHandler()
    expect(current).not.toBeNull()

    // Logout
    const logoutResult = await logoutHandler()
    expect(logoutResult.ok).toBe(true)

    // Current session should be null
    current = await currentHandler()
    expect(current).toBeNull()
  })

  describe('User Management Contract', () => {
    beforeEach(async () => {
      // Clear users except admin
      db.prepare('DELETE FROM users WHERE username != ?').run('admin')
    })

    it('should block users:list for anonymous or employee', async () => {
      const listHandler = getHandlers()['users:list']
      
      // Anonymous
      await expect(listHandler(null)).rejects.toThrow('UNAUTHORIZED')
      
      // Employee
      const loginHandler = getHandlers()['auth:login']
      // Let's create an employee first (via direct SQL for testing block)
      const hashedPassword = await require('bcryptjs').hash('emp123', 10)
      db.prepare("INSERT INTO users (username, password, role, is_active) VALUES ('emp1', ?, 'employee', 1)").run(hashedPassword)
      
      await loginHandler(null, { username: 'emp1', password: 'emp123' })
      await expect(listHandler(null)).rejects.toThrow('FORBIDDEN')
    })

    it('should allow users:list for admin and return other users', async () => {
      const listHandler = getHandlers()['users:list']
      const loginHandler = getHandlers()['auth:login']
      
      // Create another user
      const hashedPassword = await require('bcryptjs').hash('emp123', 10)
      db.prepare("INSERT INTO users (username, password, role, is_active) VALUES ('emp1', ?, 'employee', 1)").run(hashedPassword)
      
      await loginHandler(null, { username: 'admin', password: 'admin123' })
      const list = await listHandler(null)
      expect(list.length).toBe(2)
      expect(list.find((u: any) => u.username === 'emp1')).toBeDefined()
      expect(list.find((u: any) => u.password)).toBeUndefined() // Password excluded!
    })

    it('should allow users:create for admin but block employees', async () => {
      const createHandler = getHandlers()['users:create']
      const loginHandler = getHandlers()['auth:login']
      
      // Create employee to test block
      const hashedPassword = await require('bcryptjs').hash('emp123', 10)
      db.prepare("INSERT INTO users (username, password, role, is_active) VALUES ('emp1', ?, 'employee', 1)").run(hashedPassword)
      
      // Employee session block
      await loginHandler(null, { username: 'emp1', password: 'emp123' })
      await expect(createHandler(null, { username: 'emp2', password: 'password', role: 'employee', name: 'Emp 2' }))
        .rejects.toThrow('FORBIDDEN')
        
      // Admin session allowed
      await loginHandler(null, { username: 'admin', password: 'admin123' })
      const created = await createHandler(null, { username: 'emp2', password: 'password', role: 'employee', name: 'Emp 2' })
      expect(created.id).toBeDefined()
      expect(created.username).toBe('emp2')
      expect(created.role).toBe('employee')
    })

    it('should allow users:update for admin but block self-deactivation', async () => {
      const updateHandler = getHandlers()['users:update']
      const loginHandler = getHandlers()['auth:login']
      
      await loginHandler(null, { username: 'admin', password: 'admin123' })
      
      // Create another user
      const createHandler = getHandlers()['users:create']
      const emp = await createHandler(null, { username: 'emp2', password: 'password', role: 'employee', name: 'Emp 2' })
      
      // Update employee name
      const updated = await updateHandler(null, { id: emp.id, patch: { name: 'Emp 2 Updated' } })
      expect(updated.name).toBe('Emp 2 Updated')
      
      // Block self deactivation
      await expect(updateHandler(null, { id: 1, patch: { is_active: 0 } })) // id 1 is admin logged in
        .rejects.toThrow('Cannot deactivate your own active session')
    })

    it('should block self-deactivation in users:deactivate', async () => {
      const deactivateHandler = getHandlers()['users:deactivate']
      const loginHandler = getHandlers()['auth:login']
      
      await loginHandler(null, { username: 'admin', password: 'admin123' })
      await expect(deactivateHandler(null, { id: 1 }))
        .rejects.toThrow('Cannot deactivate your own active session')
    })
  })
})
