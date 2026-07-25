import { describe, it, expect, beforeAll, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { ipcMain } from 'electron'
import { initDb } from '../../electron/db/connection.js'
import { runMigrations } from '../../electron/db/migrations/index.js'
import { setCurrentUser } from '../../electron/ipc/authIPC.js'
import '../../electron/ipc/serviceTeachersIPC.js'

function getHandler(channel: string) {
  const calls = (ipcMain.handle as any).mock.calls as [string, Function][]
  const found = calls.find(([name]) => name === channel)
  if (!found) throw new Error(`Handler not registered: ${channel}`)
  return found[1]
}

describe('serviceTeachers — multi-teacher services (US4, FR-006)', () => {
  let db: any
  let serviceId: number
  let ahmedId: number
  let saraId: number
  let mohamedId: number

  beforeAll(() => {
    db = initDb()
    runMigrations(db)
    setCurrentUser({ id: 1, username: 'admin', role: 'admin', is_active: 1 })

    const now = new Date().toISOString()
    serviceId = Number(db.prepare(`
      INSERT INTO service_definitions (name, is_custom, created_at, updated_at) VALUES ('Speech Therapy', 1, ?, ?)
    `).run(now, now).lastInsertRowid)

    const addEmp = (name: string) => Number(db.prepare(`
      INSERT INTO employees (name, role, base_salary, net_salary, is_active, created_at) VALUES (?, 'Teacher', 0, 0, 1, ?)
    `).run(name, now).lastInsertRowid)
    ahmedId = addEmp('Ahmed')
    saraId = addEmp('Sara')
    mohamedId = addEmp('Mohamed')
  })

  const list = getHandler('serviceTeachers:list')
  const set = getHandler('serviceTeachers:set')

  it('lists no teachers initially', async () => {
    const result = await list(null, { service_id: serviceId })
    expect(result.length).toBe(0)
  })

  it('sets multiple teachers for a service', async () => {
    await set(null, { service_id: serviceId, employee_ids: [ahmedId, saraId, mohamedId] })
    const result = await list(null, { service_id: serviceId })
    expect(result.map((r: any) => r.id).sort()).toEqual([ahmedId, saraId, mohamedId].sort())
  })

  it('replaces the full list on a subsequent set call (not additive)', async () => {
    await set(null, { service_id: serviceId, employee_ids: [ahmedId] })
    const result = await list(null, { service_id: serviceId })
    expect(result.map((r: any) => r.id)).toEqual([ahmedId])
  })
})
