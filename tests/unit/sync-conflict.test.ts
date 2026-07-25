import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  app: {
    getPath: vi.fn()
  }
}))

import { resolveConflict, computeMergeColumns } from '../../electron/ipc/syncIPC.js'

describe('resolveConflict', () => {
  it('should prefer cloud when cloud.updated_at is newer', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T11:00:00Z' }
    expect(resolveConflict(local, cloud)).toBe('cloud')
  })

  it('should prefer local when local.updated_at is newer', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T11:00:00Z' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    expect(resolveConflict(local, cloud)).toBe('local')
  })

  it('should prefer local when timestamps are tied and local id is greater or equal', () => {
    const local = { id: 2, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    expect(resolveConflict(local, cloud)).toBe('local')

    const localEqual = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    expect(resolveConflict(localEqual, cloud)).toBe('local')
  })

  it('should prefer cloud when timestamps are tied and cloud id is strictly greater', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    const cloud = { id: 2, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    expect(resolveConflict(local, cloud)).toBe('cloud')
  })
})

describe('computeMergeColumns — reconciling a local-wins conflict instead of skipping it', () => {
  it('fills in a column that is NULL locally from the cloud value', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', notes: null, name: 'Sami' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', notes: 'Allergic to peanuts', name: 'Sami' }
    const { columns, values } = computeMergeColumns(local, cloud)
    expect(columns).toEqual(['notes'])
    expect(values).toEqual(['Allergic to peanuts'])
  })

  it('never overwrites a non-empty local value, even if cloud differs', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', name: 'Local Name' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', name: 'Cloud Name' }
    const { columns } = computeMergeColumns(local, cloud)
    expect(columns).toEqual([])
  })

  it('treats empty string the same as null/undefined on both sides', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', notes: '' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', notes: undefined }
    const { columns } = computeMergeColumns(local, cloud)
    expect(columns).toEqual([])
  })

  it('never merges id, _id, or __v', () => {
    const local = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z' }
    const cloud = { id: 1, synced: 1, updated_at: '2026-06-01T10:00:00Z', _id: 'abc', __v: 3 }
    const { columns } = computeMergeColumns(local, cloud)
    expect(columns).toEqual([])
  })
})
