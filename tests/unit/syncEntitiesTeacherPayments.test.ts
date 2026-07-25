import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))
vi.mock('mongoose', async () => {
  const actual = await vi.importActual<any>('mongoose')
  return actual
})

import { SYNC_ENTITIES } from '../../electron/services/mongoSync.js'

describe('SYNC_ENTITIES — feature 006 entities are registered for push/pull sync', () => {
  it('registers service_teachers with a model and matching table name', () => {
    const entry = SYNC_ENTITIES.find((e) => e.name === 'service_teachers')
    expect(entry).toBeDefined()
    expect(entry!.table).toBe('service_teachers')
    expect(entry!.model).toBeTruthy()
  })

  it('registers teacher_payments with a model and matching table name', () => {
    const entry = SYNC_ENTITIES.find((e) => e.name === 'teacher_payments')
    expect(entry).toBeDefined()
    expect(entry!.table).toBe('teacher_payments')
    expect(entry!.model).toBeTruthy()
  })
})
