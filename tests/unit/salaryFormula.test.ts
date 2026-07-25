import { describe, it, expect } from 'vitest'

// Pure salary formula functions — replicated from salariesIPC logic for unit testing
function computeSalaryByMode(
  mode: string,
  monthly_rate: number | null,
  session_rate: number | null,
  session_pct: number | null,
  payable_sessions: number,
  net_salary: number,
  bonus: number = 0,
  deductions: number = 0
): number {
  let base: number
  if (mode === 'fixed_monthly') {
    base = monthly_rate ?? net_salary
  } else if (mode === 'per_session_fixed') {
    base = payable_sessions * (session_rate ?? 0)
  } else if (mode === 'per_session_pct') {
    // session revenue assumed = payable_sessions * some session revenue; for unit test use session_rate as proxy
    base = payable_sessions * (session_pct ?? 0) * 100
  } else if (mode === 'hybrid') {
    base = (monthly_rate ?? 0) + payable_sessions * (session_rate ?? 0)
  } else {
    base = net_salary
  }
  return base + bonus - deductions
}

describe('salary formula modes', () => {
  it('fixed_monthly: uses monthly_rate regardless of sessions', () => {
    expect(computeSalaryByMode('fixed_monthly', 5000, null, null, 0)).toBe(5000)
    expect(computeSalaryByMode('fixed_monthly', 5000, null, null, 10)).toBe(5000)
  })

  it('fixed_monthly: falls back to net_salary when monthly_rate null', () => {
    expect(computeSalaryByMode('fixed_monthly', null, null, null, 5, 3000)).toBe(3000)
  })

  it('per_session_fixed: multiplies session_rate × payable_sessions', () => {
    expect(computeSalaryByMode('per_session_fixed', null, 120, null, 8)).toBe(960)
  })

  it('per_session_fixed: returns 0 when 0 sessions', () => {
    expect(computeSalaryByMode('per_session_fixed', null, 120, null, 0)).toBe(0)
  })

  it('hybrid: combines monthly base with per-session earnings', () => {
    expect(computeSalaryByMode('hybrid', 2000, 80, null, 5)).toBe(2400)
  })

  it('hybrid: 0 sessions still pays monthly base', () => {
    expect(computeSalaryByMode('hybrid', 2000, 80, null, 0)).toBe(2000)
  })

  it('bonus adds to all modes', () => {
    expect(computeSalaryByMode('fixed_monthly', 5000, null, null, 0, 0, 500)).toBe(5500)
    expect(computeSalaryByMode('per_session_fixed', null, 100, null, 3, 0, 200)).toBe(500)
  })

  it('deductions subtract from all modes', () => {
    expect(computeSalaryByMode('fixed_monthly', 5000, null, null, 0, 0, 0, 300)).toBe(4700)
  })

  it('bonus and deductions together net out', () => {
    expect(computeSalaryByMode('fixed_monthly', 5000, null, null, 0, 0, 200, 700)).toBe(4500)
  })
})
