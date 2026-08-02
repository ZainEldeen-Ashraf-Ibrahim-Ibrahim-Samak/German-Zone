import { vi, describe, it, expect } from 'vitest'

// Mock Electron so importing the IPC module (which registers handlers at import time) is safe.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' },
}))

import { buildInstallmentSchedule, addMonthsClamped } from '../../electron/ipc/installmentsIPC.js'

describe('Instalment schedule', () => {
  it('splits the total evenly across the requested number of instalments', () => {
    const rows = buildInstallmentSchedule(4000, 4, '2026-01-10')
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.amount)).toEqual([1000, 1000, 1000, 1000])
  })

  it('spreads instalments one per month instead of piling them onto a single month', () => {
    const rows = buildInstallmentSchedule(3000, 3, '2026-01-10')
    expect(rows.map((r) => r.due_date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    expect(rows.map((r) => r.month)).toEqual(['يناير', 'فبراير', 'مارس'])
    // Every month carries only its own instalment — none of them holds the whole fee.
    for (const row of rows) expect(row.amount).toBeLessThan(3000)
  })

  it('folds the rounding remainder into the last instalment so the parts sum to the total', () => {
    const rows = buildInstallmentSchedule(1000, 3, '2026-01-01')
    expect(rows.map((r) => r.amount)).toEqual([333.33, 333.33, 333.34])
    const sum = rows.reduce((acc, r) => acc + r.amount, 0)
    expect(Number(sum.toFixed(2))).toBe(1000)
  })

  it('rolls into the next year when the plan runs past December', () => {
    const rows = buildInstallmentSchedule(1400, 14, '2026-06-15')
    expect(rows[0]).toMatchObject({ month: 'يونيو', year: 2026 })
    expect(rows[6]).toMatchObject({ month: 'ديسمبر', year: 2026 })
    expect(rows[7]).toMatchObject({ month: 'يناير', year: 2027 })
    expect(rows[13]).toMatchObject({ month: 'يوليو', year: 2027 })
  })

  it('handles a single-instalment plan as one payment for the whole total', () => {
    const rows = buildInstallmentSchedule(2500, 1, '2026-03-05')
    expect(rows).toEqual([
      { seq: 1, due_date: '2026-03-05', month: 'مارس', year: 2026, amount: 2500 },
    ])
  })
})

describe('addMonthsClamped', () => {
  it('clamps the day to the length of the target month rather than rolling over', () => {
    // January 31st + 1 month must land on Feb 28th, never March 3rd.
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('keeps the day when the target month is long enough', () => {
    expect(addMonthsClamped('2026-01-15', 2)).toBe('2026-03-15')
  })

  it('handles a leap February', () => {
    expect(addMonthsClamped('2024-01-30', 1)).toBe('2024-02-29')
  })
})
