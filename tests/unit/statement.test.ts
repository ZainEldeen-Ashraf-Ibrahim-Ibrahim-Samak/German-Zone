import { describe, it, expect } from 'vitest'

import { getChildStatement } from '../../electron/services/statementService.js'

describe('Child Statement Builder Unit Tests', () => {
  const mockChild = {
    id: 1,
    name: 'أحمد علي',
    guardian: 'علي أحمد',
    guardian_phone: '01111111111',
    service: 'حضانة',
    unit: 'شهر',
    price: 2500,
    reg_date: '2026-02-10',
    is_active: 1
  }

  it('should generate a span of months from reg_date to current date', () => {
    // From Feb 2026 to Jun 2026
    const currentDate = new Date('2026-06-15')
    const existingPayments: any[] = []

    const statement = getChildStatement(mockChild, existingPayments, currentDate)

    expect(statement.summary.activeMonths).toBe(5) // Feb, Mar, Apr, May, Jun
    expect(statement.rows.length).toBe(5)

    // Check sorting (newest first)
    expect(statement.rows[0].month).toBe('يونيو')
    expect(statement.rows[0].year).toBe(2026)
    expect(statement.rows[4].month).toBe('فبراير')
    expect(statement.rows[4].year).toBe(2026)

    // Fallbacks
    expect(statement.rows[0].total).toBe(0)
    expect(statement.rows[0].paid).toBe(0)
    expect(statement.rows[0].balance).toBe(0)
    expect(statement.rows[0].status).toBe('unpaid')
    expect(statement.rows[0].price).toBe(2500)
    expect(statement.rows[0].service).toBe('حضانة')
  })

  it('should map existing payments to their respective months', () => {
    const currentDate = new Date('2026-04-01')
    const existingPayments = [
      {
        month: 'مارس',
        year: 2026,
        service: 'جلسة',
        unit: 'جلسة',
        quantity: 5,
        price: 100,
        total: 500,
        paid: 500,
        balance: 0,
        status: 'paid',
        notes: 'دفعت بالكامل'
      },
      {
        month: 'فبراير',
        year: 2026,
        service: 'جلسة',
        unit: 'جلسة',
        quantity: 4,
        price: 100,
        total: 400,
        paid: 200,
        balance: 200,
        status: 'partial',
        notes: ''
      }
    ]

    const statement = getChildStatement(mockChild, existingPayments, currentDate)

    expect(statement.summary.activeMonths).toBe(3) // Feb, Mar, Apr
    expect(statement.rows.length).toBe(3)

    // April has no existing payment, should fallback
    const aprRow = statement.rows.find(r => r.month === 'أبريل')!
    expect(aprRow.total).toBe(0)
    expect(aprRow.paid).toBe(0)
    expect(aprRow.status).toBe('unpaid')

    // March has existing payment
    const marRow = statement.rows.find(r => r.month === 'مارس')!
    expect(marRow.total).toBe(500)
    expect(marRow.paid).toBe(500)
    expect(marRow.status).toBe('paid')
    expect(marRow.notes).toBe('دفعت بالكامل')

    // February has existing payment
    const febRow = statement.rows.find(r => r.month === 'فبراير')!
    expect(febRow.total).toBe(400)
    expect(febRow.paid).toBe(200)
    expect(febRow.status).toBe('partial')

    // Check summary calculations
    expect(statement.summary.totalInvoiced).toBe(900) // 500 + 400
    expect(statement.summary.totalCollected).toBe(700) // 500 + 200
    expect(statement.summary.totalBalance).toBe(200) // 200
  })

  it('should handle registration date in the future gracefully', () => {
    const currentDate = new Date('2026-02-01')
    const futureChild = {
      ...mockChild,
      reg_date: '2026-05-15'
    }

    const statement = getChildStatement(futureChild, [], currentDate)
    // If registered in future compared to currentDate, we fallback to just the registration month
    expect(statement.summary.activeMonths).toBe(1)
    expect(statement.rows[0].month).toBe('مايو')
  })

  it('should fallback to current date if reg_date is invalid', () => {
    const currentDate = new Date('2026-06-15')
    const invalidChild = {
      ...mockChild,
      reg_date: 'invalid-date'
    }

    const statement = getChildStatement(invalidChild, [], currentDate)
    expect(statement.summary.activeMonths).toBe(1)
    expect(statement.rows[0].month).toBe('يونيو')
    expect(statement.rows[0].year).toBe(2026)
  })
})
