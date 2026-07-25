import { describe, it, expect } from 'vitest'

/**
 * Unit tests for MongoDB sync conflict resolution logic (T084)
 *
 * Conflict strategy: most-recent updated_at wins.
 * Tie-break: higher record id wins (deterministic).
 */

interface SyncRecord {
  id: number
  updated_at: string
  synced: number
  [key: string]: any
}

/**
 * Conflict resolver: given a local record and a cloud record,
 * returns the record that should be used as the winner.
 * - Most recent updated_at wins
 * - On tie: higher id wins (deterministic tie-break)
 */
function resolveConflict(local: SyncRecord, cloud: SyncRecord): SyncRecord {
  const localTs = new Date(local.updated_at).getTime()
  const cloudTs = new Date(cloud.updated_at).getTime()

  if (cloudTs > localTs) return cloud
  if (localTs > cloudTs) return local

  // Tie: use higher id
  return local.id >= cloud.id ? local : cloud
}

/**
 * Filter records that need to be pushed to cloud (synced=0).
 */
function getPendingPush(records: SyncRecord[]): SyncRecord[] {
  return records.filter((r) => r.synced === 0)
}

/**
 * Filter cloud records that are newer than local equivalents.
 * Returns cloud records that should be used to update local.
 */
function getPendingPull(
  localRecords: SyncRecord[],
  cloudRecords: SyncRecord[]
): SyncRecord[] {
  const localMap = new Map(localRecords.map((r) => [r.id, r]))

  return cloudRecords.filter((cloud) => {
    const local = localMap.get(cloud.id)
    if (!local) return true // New cloud record, pull it

    const winner = resolveConflict(local, cloud)
    return winner === cloud // Pull only if cloud wins
  })
}

describe('Sync Conflict Resolution', () => {
  describe('resolveConflict', () => {
    it('should prefer cloud record when cloud is newer', () => {
      const local: SyncRecord = { id: 1, updated_at: '2025-01-01T10:00:00Z', synced: 1, name: 'Old' }
      const cloud: SyncRecord = { id: 1, updated_at: '2025-01-02T10:00:00Z', synced: 1, name: 'New' }

      const winner = resolveConflict(local, cloud)
      expect(winner).toBe(cloud)
      expect(winner.name).toBe('New')
    })

    it('should prefer local record when local is newer', () => {
      const local: SyncRecord = { id: 1, updated_at: '2025-01-03T10:00:00Z', synced: 0, name: 'LocalNew' }
      const cloud: SyncRecord = { id: 1, updated_at: '2025-01-01T10:00:00Z', synced: 1, name: 'CloudOld' }

      const winner = resolveConflict(local, cloud)
      expect(winner).toBe(local)
      expect(winner.name).toBe('LocalNew')
    })

    it('should use higher id as tie-break when timestamps are equal', () => {
      const ts = '2025-06-01T12:00:00Z'
      const low: SyncRecord = { id: 10, updated_at: ts, synced: 0, name: 'Low' }
      const high: SyncRecord = { id: 20, updated_at: ts, synced: 1, name: 'High' }

      expect(resolveConflict(low, high)).toBe(high)
      expect(resolveConflict(high, low)).toBe(high)
    })

    it('same id and same timestamp — local wins (id >= comparison)', () => {
      const ts = '2025-06-01T12:00:00Z'
      const local: SyncRecord = { id: 5, updated_at: ts, synced: 0 }
      const cloud: SyncRecord = { id: 5, updated_at: ts, synced: 1 }

      expect(resolveConflict(local, cloud)).toBe(local)
    })
  })

  describe('getPendingPush', () => {
    it('returns only unsynced records (synced=0)', () => {
      const records: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-01T00:00:00Z', synced: 0 },
        { id: 2, updated_at: '2025-01-01T00:00:00Z', synced: 1 },
        { id: 3, updated_at: '2025-01-01T00:00:00Z', synced: 0 }
      ]

      const pending = getPendingPush(records)
      expect(pending).toHaveLength(2)
      expect(pending.map((r) => r.id)).toEqual([1, 3])
    })

    it('returns empty array when all records are synced', () => {
      const records: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-01T00:00:00Z', synced: 1 }
      ]
      expect(getPendingPush(records)).toHaveLength(0)
    })
  })

  describe('getPendingPull', () => {
    it('should include cloud records that are newer than local', () => {
      const local: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-01T00:00:00Z', synced: 1 }
      ]
      const cloud: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-02T00:00:00Z', synced: 1 } // newer
      ]

      const pending = getPendingPull(local, cloud)
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(1)
    })

    it('should NOT include cloud records when local is newer', () => {
      const local: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-05T00:00:00Z', synced: 0 }
      ]
      const cloud: SyncRecord[] = [
        { id: 1, updated_at: '2025-01-02T00:00:00Z', synced: 1 } // older
      ]

      const pending = getPendingPull(local, cloud)
      expect(pending).toHaveLength(0)
    })

    it('should include cloud records that exist only in cloud', () => {
      const local: SyncRecord[] = []
      const cloud: SyncRecord[] = [
        { id: 42, updated_at: '2025-01-01T00:00:00Z', synced: 1 }
      ]

      const pending = getPendingPull(local, cloud)
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(42)
    })

    it('handles tie correctly — local wins, no pull needed', () => {
      const ts = '2025-06-01T00:00:00Z'
      const local: SyncRecord[] = [
        { id: 10, updated_at: ts, synced: 1 }
      ]
      const cloud: SyncRecord[] = [
        { id: 10, updated_at: ts, synced: 1 }  // same timestamp, same id → local wins
      ]

      const pending = getPendingPull(local, cloud)
      expect(pending).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('resolveConflict handles ISO 8601 with milliseconds', () => {
      const local: SyncRecord = { id: 1, updated_at: '2025-01-01T10:00:00.500Z', synced: 0 }
      const cloud: SyncRecord = { id: 1, updated_at: '2025-01-01T10:00:00.999Z', synced: 1 }

      expect(resolveConflict(local, cloud)).toBe(cloud)
    })

    it('getPendingPush handles empty records array', () => {
      expect(getPendingPush([])).toHaveLength(0)
    })

    it('getPendingPull handles empty cloud array', () => {
      const local: SyncRecord[] = [{ id: 1, updated_at: '2025-01-01T00:00:00Z', synced: 1 }]
      expect(getPendingPull(local, [])).toHaveLength(0)
    })
  })
})
