import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' }
}))

import { isPaymentEligible } from '../../electron/ipc/attendanceIPC.js'

describe('isPaymentEligible — the five attendance-based payment cases (spec.md FR-008…FR-011)', () => {
  it('Case 1: teacher present + child attended → payable', () => {
    expect(isPaymentEligible('present', 'attended')).toBe(true)
  })

  it('Case 2: teacher present + child absent unexcused → payable', () => {
    expect(isPaymentEligible('present', 'absent_unexcused')).toBe(true)
  })

  it('Case 3: teacher present + child absent excused → not payable', () => {
    expect(isPaymentEligible('present', 'absent_excused')).toBe(false)
  })

  it('Case 4: teacher absent + child attended → not payable', () => {
    expect(isPaymentEligible('absent', 'attended')).toBe(false)
  })

  it('Case 5: teacher absent + child absent → not payable', () => {
    expect(isPaymentEligible('absent', 'absent_unexcused')).toBe(false)
    expect(isPaymentEligible('absent', 'absent_excused')).toBe(false)
  })

  it('treats a missing/null teacher status as not payable', () => {
    expect(isPaymentEligible(null, 'attended')).toBe(false)
    expect(isPaymentEligible(undefined, 'attended')).toBe(false)
  })
})
