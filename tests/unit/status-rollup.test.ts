import { describe, it, expect } from 'vitest'

// We need to write a function that takes an array of child's payment lines
// and returns a combined status: 'paid', 'partial', or 'unpaid'.
// We will put this function in `electron/ipc/paymentsIPC.ts` eventually.

// Let's assume it's called `calculateChildStatusRollup`
// For now we'll write the test against the expected behavior, and we can define a dummy function to fail, then implement it.

export function calculateChildStatusRollup(payments: { status: 'paid' | 'partial' | 'unpaid' }[]): 'paid' | 'partial' | 'unpaid' {
  if (payments.length === 0) return 'unpaid'
  const allPaid = payments.every(p => p.status === 'paid')
  const allUnpaid = payments.every(p => p.status === 'unpaid')
  if (allPaid) return 'paid'
  if (allUnpaid) return 'unpaid'
  return 'partial'
}

describe('Per-Child Status Roll-up', () => {
  it('returns unpaid if no payments exist (or all are unpaid)', () => {
    expect(calculateChildStatusRollup([])).toBe('unpaid')
    expect(calculateChildStatusRollup([{ status: 'unpaid' }])).toBe('unpaid')
    expect(calculateChildStatusRollup([{ status: 'unpaid' }, { status: 'unpaid' }])).toBe('unpaid')
  })

  it('returns paid if all payments are paid', () => {
    expect(calculateChildStatusRollup([{ status: 'paid' }])).toBe('paid')
    expect(calculateChildStatusRollup([{ status: 'paid' }, { status: 'paid' }])).toBe('paid')
  })

  it('returns partial if some are paid and some unpaid', () => {
    expect(calculateChildStatusRollup([{ status: 'paid' }, { status: 'unpaid' }])).toBe('partial')
  })

  it('returns partial if any is partial', () => {
    expect(calculateChildStatusRollup([{ status: 'partial' }, { status: 'paid' }])).toBe('partial')
    expect(calculateChildStatusRollup([{ status: 'partial' }, { status: 'unpaid' }])).toBe('partial')
    expect(calculateChildStatusRollup([{ status: 'partial' }])).toBe('partial')
  })
})
