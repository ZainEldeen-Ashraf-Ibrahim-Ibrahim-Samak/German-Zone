import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

// Nursery's operating week is Saturday–Friday (see spec 009 Assumptions), not ISO Monday–Sunday.
function weekBounds(dateStr: string): { from: string; to: string } {
  const date = new Date(dateStr)
  const day = date.getDay() // 0=Sun..6=Sat
  const daysSinceSaturday = (day + 1) % 7
  const from = new Date(date)
  from.setDate(date.getDate() - daysSinceSaturday)
  const to = new Date(from)
  to.setDate(from.getDate() + 6)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function monthBounds(dateStr: string): { from: string; to: string } {
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  // Build the ISO strings from local components directly — new Date(year, month, day).toISOString()
  // converts local midnight to UTC first, which shifts the date back a day in any timezone ahead
  // of UTC (e.g. Cairo), the same bug fixed in calendarIPC.ts's buildMonthEntries.
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`
  }
}

// Financial "transactions" are derived read-time from the existing payments/payment_transactions
// tables (research.md #1) — each recorded installment is a payment event; each payments row with
// no recorded installments yet still represents an outstanding charge for that month.
ipcMain.handle('transactions:list', async (_event, args: {
  range: 'day' | 'week' | 'month' | 'custom'
  date?: string
  from?: string
  to?: string
  childId?: number
}) => {
  try {
    checkAuth()
    const { range, date, childId } = args || ({} as any)
    let { from, to } = args || ({} as any)

    if (range === 'day') {
      if (!date) throw new Error('date is required for range=day')
      from = date
      to = date
    } else if (range === 'week') {
      if (!date) throw new Error('date is required for range=week')
      ;({ from, to } = weekBounds(date))
    } else if (range === 'month') {
      if (!date) throw new Error('date is required for range=month')
      ;({ from, to } = monthBounds(date))
    } else if (range === 'custom') {
      if (!from || !to) throw new Error('from and to are required for range=custom')
    } else {
      throw new Error('Invalid range: must be one of day, week, month, custom')
    }

    const db = getDb()
    const conditions = ['pt.paid_date BETWEEN ? AND ?']
    const params: any[] = [from, to]

    if (childId) {
      conditions.push('p.child_id = ?')
      params.push(childId)
    }

    const rows = db.prepare(`
      SELECT
        pt.id,
        p.child_id,
        c.name as child_name,
        p.service as service_name,
        pt.amount,
        'payment' as type,
        pt.paid_date as date
      FROM payment_transactions pt
      JOIN payments p ON p.id = pt.payment_id
      JOIN children c ON c.id = p.child_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY date DESC, pt.id DESC
    `).all(...params)

    return rows
  } catch (error: any) {
    console.error('Failed to list transactions:', error)
    throw new Error(error.message || 'Failed to list transactions')
  }
})
