import { vi, describe, it, expect } from 'vitest'

// Mock Electron modules to prevent crashes when importing paymentsIPC
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

import { calculatePayment } from '../../electron/ipc/paymentsIPC.js'

describe('Payment calculations unit tests', () => {
  it('should compute unpaid status when paid is 0', () => {
    const result = calculatePayment(1, 2500, 0)
    expect(result.total).toBe(2500)
    expect(result.balance).toBe(2500)
    expect(result.status).toBe('unpaid')
  })

  it('should compute partial status when paid is between 0 and total', () => {
    const result = calculatePayment(1, 2500, 1000)
    expect(result.total).toBe(2500)
    expect(result.balance).toBe(1500)
    expect(result.status).toBe('partial')
  })

  it('should compute paid status when paid equals total', () => {
    const result = calculatePayment(1, 2500, 2500)
    expect(result.total).toBe(2500)
    expect(result.balance).toBe(0)
    expect(result.status).toBe('paid')
  })

  it('should compute paid status and negative balance (credit) when paid exceeds total', () => {
    const result = calculatePayment(1, 2500, 3000)
    expect(result.total).toBe(2500)
    expect(result.balance).toBe(-500) // credit
    expect(result.status).toBe('paid')
  })

  it('should handle fractional quantities correctly', () => {
    const result = calculatePayment(1.5, 200, 150)
    expect(result.total).toBe(300)
    expect(result.balance).toBe(150)
    expect(result.status).toBe('partial')
  })
})
