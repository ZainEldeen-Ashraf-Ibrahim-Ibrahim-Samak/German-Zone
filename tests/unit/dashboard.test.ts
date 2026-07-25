import { vi, describe, it, expect } from 'vitest'

// Mock Electron modules
vi.mock('electron', () => {
  return {
    ipcMain: {
      handle: vi.fn()
    },
    app: {
      getPath: () => 'mock-user-data'
    }
  }
})

import { calculateDashboard } from '../../electron/ipc/dashboardIPC.js'

describe('Dashboard calculations unit tests', () => {
  const mockPayments = [
    { total: 2000, paid: 2000, balance: 0, service: 'حضانة' },
    { total: 1500, paid: 500, balance: 1000, service: 'استضافة' },
    { total: 500, paid: 0, balance: 500, service: 'جلسة' },
    { total: 1000, paid: 1200, balance: -200, service: 'جلسة' }, // overpayment
  ]

  const mockExpenses = [
    { amount: 300 },
    { amount: 700 },
  ]

  const mockSalaries = [
    { actual_paid: 1500 },
    { actual_paid: 2500 },
  ]

  const targetProfitPct = 0.20 // 20%

  it('should compute core KPIs correctly', () => {
    const result = calculateDashboard(mockPayments as any, mockExpenses as any, mockSalaries as any, targetProfitPct)

    expect(result.invoiced).toBe(5000) // 2000 + 1500 + 500 + 1000
    expect(result.collected).toBe(3700) // 2000 + 500 + 0 + 1200
    expect(result.arrears).toBe(1500) // 1000 + 500 (negatives balance ignored)
    expect(result.collectionRate).toBe(0.74) // 3700 / 5000 = 74%
    
    expect(result.expensesTotal).toBe(1000) // 300 + 700
    expect(result.salariesTotal).toBe(4000) // 1500 + 2500
    expect(result.netProfit).toBe(-1300) // collected - (expensesTotal + salariesTotal) = 3700 - 5000 = -1300
  })

  it('should compute target planning metrics correctly', () => {
    const result = calculateDashboard(mockPayments as any, mockExpenses as any, mockSalaries as any, targetProfitPct)
    
    // totalExpenses = expensesTotal + salariesTotal = 1000 + 4000 = 5000
    // targetRequired = 5000 / (1 - 0.20) = 6250
    // gap = 6250 - 3700 = 2550
    expect(result.targetRequired).toBe(6250)
    expect(result.gap).toBe(2550)
  })

  it('should handle zero totals and divide-by-zero cases gracefully', () => {
    const result = calculateDashboard([], [], [], 0.20)
    
    expect(result.invoiced).toBe(0)
    expect(result.collected).toBe(0)
    expect(result.arrears).toBe(0)
    expect(result.collectionRate).toBe(0) // Safe fallback
    expect(result.expensesTotal).toBe(0)
    expect(result.salariesTotal).toBe(0)
    expect(result.netProfit).toBe(0)
    expect(result.targetRequired).toBe(0)
    expect(result.gap).toBe(0)
  })
})
