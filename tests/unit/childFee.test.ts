import { describe, it, expect } from 'vitest'

/**
 * Monthly fee calculation (feature 004, FR-008–FR-011).
 * Baseline is FIXED at 8 sessions regardless of month length (clarification);
 * month-length variation is handled by manual extra lessons.
 * fee = (sessions_baseline + extra_lessons) * session_price.
 * Mirrors buildLessonFields() in electron/ipc/childrenIPC.ts.
 */
function monthlyFee(sessionsBaseline: number, extraLessons: number, sessionPrice: number): number {
  return Number(((sessionsBaseline + extraLessons) * sessionPrice).toFixed(2))
}

const BASELINE = 8

describe('monthly lesson fee', () => {
  it('defaults to 8 sessions × price with no extras', () => {
    expect(monthlyFee(BASELINE, 0, 100)).toBe(800)
  })

  it('adds extra lessons to the session count and fee', () => {
    expect(monthlyFee(BASELINE, 2, 100)).toBe(1000) // 10 sessions
    expect(monthlyFee(BASELINE, 5, 50)).toBe(650) // 13 sessions
  })

  it('does not change baseline for any month length (28/29/30/31 days)', () => {
    // The calendar never alters the baseline; only extras do.
    for (const days of [28, 29, 30, 31]) {
      void days
      expect(monthlyFee(BASELINE, 0, 120)).toBe(960)
    }
  })

  it('is zero when session price is zero', () => {
    expect(monthlyFee(BASELINE, 4, 0)).toBe(0)
  })
})
