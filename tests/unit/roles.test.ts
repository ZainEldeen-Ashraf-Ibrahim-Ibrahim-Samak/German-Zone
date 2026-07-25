import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock Electron modules to prevent crashes when importing authIPC
vi.mock('electron', () => {
  return {
    ipcMain: {
      handle: vi.fn()
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

import { requireAdmin } from '../../electron/ipc/_guard.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'

describe('Role enforcement unit tests', () => {
  beforeEach(() => {
    // Reset session before each test
    setCurrentUser(null)
  })

  it('should block anonymous users with UNAUTHORIZED', () => {
    expect(() => requireAdmin()).toThrow('UNAUTHORIZED')
  })

  it('should block employee users with FORBIDDEN', () => {
    setCurrentUser({
      id: 2,
      username: 'employee1',
      role: 'employee',
      is_active: 1
    })
    expect(() => requireAdmin()).toThrow('FORBIDDEN')
  })

  it('should allow admin users to pass without throwing', () => {
    setCurrentUser({
      id: 1,
      username: 'admin',
      role: 'admin',
      is_active: 1
    })
    expect(() => requireAdmin()).not.toThrow()
  })
})
