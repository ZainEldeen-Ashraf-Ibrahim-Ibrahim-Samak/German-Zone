import { describe, it, expect } from 'vitest'

// Pro-rate calculation: price × (days_remaining / days_in_month)
function proRate(regDateStr: string, pricePerMonth: number): {
  days_remaining: number
  days_in_month: number
  prorated_amount: number
} {
  const regDate = new Date(regDateStr)
  const year = regDate.getFullYear()
  const month = regDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysRemaining = daysInMonth - regDate.getDate() + 1
  return {
    days_remaining: daysRemaining,
    days_in_month: daysInMonth,
    prorated_amount: Math.round((pricePerMonth * daysRemaining) / daysInMonth),
  }
}

describe('pro-rate calculation', () => {
  it('enrolled on day 1: pays full month', () => {
    const result = proRate('2026-06-01', 1200)
    expect(result.prorated_amount).toBe(1200)
    expect(result.days_remaining).toBe(30)
  })

  it('enrolled on last day: pays 1/30 of price', () => {
    const result = proRate('2026-06-30', 1200)
    expect(result.days_remaining).toBe(1)
    expect(result.prorated_amount).toBe(Math.round(1200 / 30))
  })

  it('enrolled on day 20 of 30-day month: pays 11/30', () => {
    const result = proRate('2026-06-20', 3000)
    expect(result.days_remaining).toBe(11)
    expect(result.prorated_amount).toBe(Math.round(3000 * 11 / 30))
  })

  it('enrolled on day 15 of 31-day month: pays 17/31', () => {
    const result = proRate('2026-07-15', 3100)
    expect(result.days_remaining).toBe(17)
    expect(result.days_in_month).toBe(31)
    expect(result.prorated_amount).toBe(Math.round(3100 * 17 / 31))
  })

  it('February 28-day month: enrolled on day 14 pays 15/28', () => {
    const result = proRate('2026-02-14', 2800)
    expect(result.days_in_month).toBe(28)
    expect(result.days_remaining).toBe(15)
    expect(result.prorated_amount).toBe(1500)
  })

  it('zero price always returns 0', () => {
    const result = proRate('2026-06-15', 0)
    expect(result.prorated_amount).toBe(0)
  })
})
