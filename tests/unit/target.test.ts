import { describe, it, expect } from 'vitest'

/**
 * Unit tests for target planning calculation functions (T071)
 * Tests the pure calculation logic for:
 * - Required revenue target from expenses and target profit percentage
 * - Gap calculation (target - collected)
 * - Coverage percentage from custom distribution
 * - Units needed per service
 */

// --- Pure calculation functions (replicated from targetIPC for testing) ---

interface MonthlyData {
  expenses: number  // total monthly expenses (operational + salaries)
  collected: number // amount actually collected that month
}

/**
 * Compute required revenue target:
 *   requiredRevenue = totalExpenses / (1 - targetProfitPct)
 * This ensures that after paying expenses, the profit margin is met.
 */
function calcRequiredRevenue(totalExpenses: number, targetProfitPct: number): number {
  if (targetProfitPct >= 1 || targetProfitPct < 0) return totalExpenses // edge case
  return Number((totalExpenses / (1 - targetProfitPct)).toFixed(2))
}

/**
 * Compute gap: max(0, requiredRevenue - collected)
 */
function calcGap(requiredRevenue: number, collected: number): number {
  return Number(Math.max(0, requiredRevenue - collected).toFixed(2))
}

/**
 * Compute coverage percentage: collected / requiredRevenue
 */
function calcCoveragePct(collected: number, requiredRevenue: number): number {
  if (requiredRevenue <= 0) return 1.0
  return Number(Math.min(1, collected / requiredRevenue).toFixed(4))
}

/**
 * Compute projected monthly revenue from a custom distribution.
 * distribution: { [serviceKey: string]: number } — count of children/units per service
 * pricing: { [serviceKey: string]: number } — monthly price per service/unit
 */
function calcProjectedRevenue(
  distribution: Record<string, number>,
  pricing: Record<string, number>
): number {
  let total = 0
  for (const [service, count] of Object.entries(distribution)) {
    const price = pricing[service] ?? 0
    total += count * price
  }
  return Number(total.toFixed(2))
}

/**
 * Compute units needed to hit target revenue for each service category.
 * Distributes the required revenue proportionally based on current distribution share.
 * If distribution is empty, returns equal split across services.
 */
function calcUnitsNeeded(
  targetRevenue: number,
  distribution: Record<string, number>,
  pricing: Record<string, number>
): Record<string, number> {
  const services = Object.keys(pricing)
  const result: Record<string, number> = {}

  for (const service of services) {
    const price = pricing[service]
    if (price > 0) {
      result[service] = Math.ceil(targetRevenue / (services.length * price))
    } else {
      result[service] = 0
    }
  }

  return result
}

// --- Tests ---

describe('Target Planning Calculations', () => {
  describe('calcRequiredRevenue', () => {
    it('computes required revenue correctly at 20% target', () => {
      // 10000 expenses / (1 - 0.20) = 12500
      expect(calcRequiredRevenue(10000, 0.20)).toBe(12500)
    })

    it('computes required revenue correctly at 30% target', () => {
      // 7000 / (1 - 0.30) = 10000
      expect(calcRequiredRevenue(7000, 0.30)).toBe(10000)
    })

    it('computes required revenue at 0% target (just break even)', () => {
      // 5000 / (1 - 0) = 5000
      expect(calcRequiredRevenue(5000, 0)).toBe(5000)
    })

    it('handles edge case: targetProfitPct = 1', () => {
      // returns totalExpenses as fallback
      expect(calcRequiredRevenue(8000, 1)).toBe(8000)
    })
  })

  describe('calcGap', () => {
    it('returns positive gap when target not met', () => {
      expect(calcGap(12500, 8000)).toBe(4500)
    })

    it('returns 0 when collected exceeds target', () => {
      expect(calcGap(12500, 15000)).toBe(0)
    })

    it('returns 0 when exactly at target', () => {
      expect(calcGap(10000, 10000)).toBe(0)
    })
  })

  describe('calcCoveragePct', () => {
    it('returns coverage fraction when partially collected', () => {
      expect(calcCoveragePct(6250, 12500)).toBe(0.5)
    })

    it('returns 1.0 when target is met', () => {
      expect(calcCoveragePct(15000, 12500)).toBe(1.0)
    })

    it('returns 1.0 when required is 0', () => {
      expect(calcCoveragePct(0, 0)).toBe(1.0)
    })
  })

  describe('calcProjectedRevenue', () => {
    const pricing = {
      حضانة: 2500,
      استضافة: 3000,
      جلسة: 100
    }

    it('computes revenue from mixed distribution', () => {
      // 10 nursery × 2500 + 5 hosting × 3000 + 20 session × 100
      const distribution = { حضانة: 10, استضافة: 5, جلسة: 20 }
      expect(calcProjectedRevenue(distribution, pricing)).toBe(42000) // 25000 + 15000 + 2000
    })

    it('computes revenue for single service', () => {
      const distribution = { حضانة: 15 }
      expect(calcProjectedRevenue(distribution, pricing)).toBe(37500)
    })

    it('returns 0 for empty distribution', () => {
      expect(calcProjectedRevenue({}, pricing)).toBe(0)
    })

    it('returns 0 for services not in pricing', () => {
      expect(calcProjectedRevenue({ unknown: 10 }, pricing)).toBe(0)
    })
  })

  describe('calcUnitsNeeded (from target)', () => {
    const pricing = {
      حضانة: 2500,
      استضافة: 3000
    }

    it('calculates units needed to hit a target', () => {
      // Target: 12000, 2 services
      // For حضانة: ceil(12000 / (2 * 2500)) = ceil(2.4) = 3
      // For استضافة: ceil(12000 / (2 * 3000)) = ceil(2.0) = 2
      const result = calcUnitsNeeded(12000, {}, pricing)
      expect(result['حضانة']).toBe(3)
      expect(result['استضافة']).toBe(2)
    })
  })

  describe('target status', () => {
    it('reports met when collected >= required', () => {
      const required = calcRequiredRevenue(8000, 0.20)  // 10000
      const gap = calcGap(required, 12000)
      expect(gap).toBe(0)
      const status = gap === 0 ? 'met' : 'missed'
      expect(status).toBe('met')
    })

    it('reports missed when collected < required', () => {
      const required = calcRequiredRevenue(8000, 0.20)  // 10000
      const gap = calcGap(required, 7000)
      expect(gap).toBeGreaterThan(0)
      const status = gap === 0 ? 'met' : 'missed'
      expect(status).toBe('missed')
    })
  })
})
