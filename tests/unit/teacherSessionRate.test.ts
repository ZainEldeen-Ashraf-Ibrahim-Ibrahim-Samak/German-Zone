import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/salariesIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('Employees — per-teacher session rate (US3, FR-004/FR-005)', () => {
  let db: any

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })
  })

  const add = getHandler('employees:add')
  const update = getHandler('employees:update')

  it('persists teacher_session_rate on create', async () => {
    const emp = await add(null, { name: 'Ahmed', base_salary: 0, teacher_session_rate: 150 })
    expect(emp.teacher_session_rate).toBe(150)
  })

  it('defaults to null when omitted', async () => {
    const emp = await add(null, { name: 'Sara', base_salary: 0 })
    expect(emp.teacher_session_rate).toBeNull()
  })

  it('updates teacher_session_rate independently for each employee', async () => {
    const ahmed = await add(null, { name: 'Mohamed', base_salary: 0, teacher_session_rate: 100 })
    const updated = await update(null, { id: ahmed.id, patch: { teacher_session_rate: 250 } })
    expect(updated.teacher_session_rate).toBe(250)
  })

  it('allows clearing the rate back to null', async () => {
    const emp = await add(null, { name: 'Laila', base_salary: 0, teacher_session_rate: 100 })
    const updated = await update(null, { id: emp.id, patch: { teacher_session_rate: null } })
    expect(updated.teacher_session_rate).toBeNull()
  })
})
