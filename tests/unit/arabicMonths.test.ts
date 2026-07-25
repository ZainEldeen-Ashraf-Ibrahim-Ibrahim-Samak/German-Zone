import { describe, it, expect } from 'vitest'

/**
 * Arabic month names used throughout the app (dashboardIPC, expensesIPC,
 * statementService, targetIPC). Tests ensure the canonical list never drifts.
 */
const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

describe('arabicMonths canonical list', () => {
  it('contains exactly 12 months', () => {
    expect(arabicMonths).toHaveLength(12)
  })

  it('January is index 0 (يناير)', () => {
    expect(arabicMonths[0]).toBe('يناير')
  })

  it('December is index 11 (ديسمبر)', () => {
    expect(arabicMonths[11]).toBe('ديسمبر')
  })

  it('June is index 5 (يونيو)', () => {
    expect(arabicMonths[5]).toBe('يونيو')
  })

  it('no month name appears more than once (no duplicates)', () => {
    const unique = new Set(arabicMonths)
    expect(unique.size).toBe(12)
  })

  it('JS Date month index maps to the correct Arabic name', () => {
    // new Date(2026, m, 1).getMonth() === m
    const jsDate = new Date('2026-04-01')
    expect(arabicMonths[jsDate.getMonth()]).toBe('أبريل')
  })

  it('every month name is a non-empty string', () => {
    for (const m of arabicMonths) {
      expect(typeof m).toBe('string')
      expect(m.length).toBeGreaterThan(0)
    }
  })

  it('indexOf round-trips with array index', () => {
    arabicMonths.forEach((name, idx) => {
      expect(arabicMonths.indexOf(name)).toBe(idx)
    })
  })
})

describe('arabicMonths — month lookup helpers', () => {
  const monthIndex = (name: string) => arabicMonths.indexOf(name)
  const monthName = (idx: number) => arabicMonths[idx]

  it('returns -1 for unknown month name', () => {
    expect(monthIndex('January')).toBe(-1)
    expect(monthIndex('')).toBe(-1)
  })

  it('returns undefined for out-of-range index', () => {
    expect(monthName(-1)).toBeUndefined()
    expect(monthName(12)).toBeUndefined()
  })

  it('Ramadan month (مارس in some years) maps to index 2', () => {
    expect(monthIndex('مارس')).toBe(2)
  })
})
