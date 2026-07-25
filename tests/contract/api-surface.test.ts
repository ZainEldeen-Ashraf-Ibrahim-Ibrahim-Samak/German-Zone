import { vi, describe, it, expect } from 'vitest'

// Mock Electron modules
vi.mock('electron', () => {
  const globalApis: Record<string, any> = {};
  (globalThis as any).__exposedApis = globalApis;

  return {
    contextBridge: {
      exposeInMainWorld: (key: string, api: any) => {
        ;(globalThis as any).__exposedApis[key] = api
      }
    },
    ipcRenderer: {
      invoke: vi.fn()
    }
  }
})

// Import preload to trigger the contextBridge calls
import '../../electron/preload.js'

describe('IPC Contract tests: window.api surface validation', () => {
  const getApis = () => (globalThis as any).__exposedApis

  it('should expose window.api on startup', () => {
    expect(getApis().api).toBeDefined()
  })

  it('should match the Auth & Users contract', () => {
    const api = getApis().api
    expect(api.auth).toBeDefined()
    expect(api.auth.login).toBeTypeOf('function')
    expect(api.auth.logout).toBeTypeOf('function')
    expect(api.auth.current).toBeTypeOf('function')
    expect(api.users).toBeDefined()
    expect(api.users.list).toBeTypeOf('function')
    expect(api.users.create).toBeTypeOf('function')
    expect(api.users.update).toBeTypeOf('function')
    expect(api.users.deactivate).toBeTypeOf('function')
  })

  it('should match the Children contract', () => {
    const api = getApis().api
    expect(api.children).toBeDefined()
    expect(api.children.get).toBeTypeOf('function')
    expect(api.children.add).toBeTypeOf('function')
    expect(api.children.update).toBeTypeOf('function')
    expect(api.children.deactivate).toBeTypeOf('function')
  })

  it('should match the Payments contract', () => {
    const api = getApis().api
    expect(api.payments).toBeDefined()
    expect(api.payments.get).toBeTypeOf('function')
    expect(api.payments.generate).toBeTypeOf('function')
    expect(api.payments.update).toBeTypeOf('function')
    expect(api.payments.bulkPay).toBeTypeOf('function')
  })

  it('should match the Salaries contract', () => {
    const api = getApis().api
    expect(api.employees).toBeDefined()
    expect(api.employees.get).toBeTypeOf('function')
    expect(api.employees.add).toBeTypeOf('function')
    expect(api.employees.update).toBeTypeOf('function')
    expect(api.employees.deactivate).toBeTypeOf('function')
    expect(api.salary).toBeDefined()
    expect(api.salary.get).toBeTypeOf('function')
    expect(api.salary.update).toBeTypeOf('function')
  })

  it('should match the Expenses contract', () => {
    const api = getApis().api
    expect(api.expenses).toBeDefined()
    expect(api.expenses.get).toBeTypeOf('function')
    expect(api.expenses.update).toBeTypeOf('function')
    expect(api.expenses.addItem).toBeTypeOf('function')
    expect(api.expenses.removeItem).toBeTypeOf('function')
  })

  it('should match the Dashboard & Target contracts', () => {
    const api = getApis().api
    expect(api.dashboard).toBeDefined()
    expect(api.dashboard.get).toBeTypeOf('function')
    expect(api.target).toBeDefined()
    expect(api.target.get).toBeTypeOf('function')
    expect(api.target.calc).toBeTypeOf('function')
  })

  it('should match the Settings & Branding contracts', () => {
    const api = getApis().api
    expect(api.settings).toBeDefined()
    expect(api.settings.get).toBeTypeOf('function')
    expect(api.settings.update).toBeTypeOf('function')
    expect(api.branding).toBeDefined()
    expect(api.branding.get).toBeTypeOf('function')
    expect(api.branding.save).toBeTypeOf('function')
    expect(api.branding.uploadLogo).toBeTypeOf('function')
    expect(api.branding.uploadIcon).toBeTypeOf('function')
    expect(api.branding.reset).toBeTypeOf('function')
  })

  it('should match the Export contract', () => {
    const api = getApis().api
    expect(api.export).toBeDefined()
    expect(api.export.full).toBeTypeOf('function')
    expect(api.export.month).toBeTypeOf('function')
    expect(api.export.child).toBeTypeOf('function')
    expect(api.export.salaries).toBeTypeOf('function')
    expect(api.export.expenses).toBeTypeOf('function')
  })

  it('should match the Storage contract', () => {
    const api = getApis().api
    expect(api.storage).toBeDefined()
    expect(api.storage.stats).toBeTypeOf('function')
    expect(api.storage.backup).toBeTypeOf('function')
    expect(api.storage.restore).toBeTypeOf('function')
    expect(api.storage.import).toBeTypeOf('function')
    expect(api.storage.clear).toBeTypeOf('function')
    expect(api.storage.audit).toBeTypeOf('function')
  })

  it('should match the Sync contract', () => {
    const api = getApis().api
    expect(api.sync).toBeDefined()
    expect(api.sync.push).toBeTypeOf('function')
    expect(api.sync.pull).toBeTypeOf('function')
    expect(api.sync.status).toBeTypeOf('function')
  })
})
