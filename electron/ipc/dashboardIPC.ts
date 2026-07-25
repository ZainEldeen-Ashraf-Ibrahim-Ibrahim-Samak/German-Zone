import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { getCurrentUser } from './authIPC.js'

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

// Pure calculation helper
export function calculateDashboard(
  payments: { total: number; paid: number; balance: number; service: string }[],
  expenses: { amount: number }[],
  salaries: { actual_paid: number }[],
  targetProfitPct: number
) {
  let invoiced = 0
  let collected = 0
  let arrears = 0

  for (const p of payments) {
    invoiced += p.total
    collected += p.paid
    if (p.balance > 0) {
      arrears += p.balance
    }
  }

  const collectionRate = invoiced > 0 ? Number((collected / invoiced).toFixed(2)) : 0
  
  let expensesTotal = 0
  for (const e of expenses) {
    expensesTotal += e.amount
  }

  let salariesTotal = 0
  for (const s of salaries) {
    salariesTotal += s.actual_paid
  }

  const netProfit = Number((collected - (expensesTotal + salariesTotal)).toFixed(2))
  
  // Target calculations
  const totalExpenses = expensesTotal + salariesTotal
  const targetRequired = targetProfitPct < 1 
    ? Number((totalExpenses / (1 - targetProfitPct)).toFixed(2))
    : 0
  
  const gap = Number(Math.max(0, targetRequired - collected).toFixed(2))

  return {
    invoiced: Number(invoiced.toFixed(2)),
    collected: Number(collected.toFixed(2)),
    arrears: Number(arrears.toFixed(2)),
    collectionRate,
    expensesTotal: Number(expensesTotal.toFixed(2)),
    salariesTotal: Number(salariesTotal.toFixed(2)),
    netProfit,
    targetRequired,
    gap,
  }
}

function checkAuth() {
  const user = getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}

ipcMain.handle('dashboard:get', async (_event, { month, year }) => {
  try {
    checkAuth()
    const db = getDb()

    if (!month || !year) {
      throw new Error('Month and year are required')
    }

    // 1. Fetch Target Profit Pct from settings
    const targetProfitRow = db.prepare("SELECT value FROM settings WHERE key = 'target_profit_pct'").get() as any
    const targetProfitPct = targetProfitRow ? Number(targetProfitRow.value) : 0.20

    // 2. Fetch payments, expenses, salaries for selected month/year
    const payments = db.prepare('SELECT total, paid, balance, service FROM payments WHERE month = ? AND year = ?').all(month, year) as any[]
    const expenses = db.prepare('SELECT amount FROM expenses WHERE month = ? AND year = ?').all(month, year) as any[]
    const salaries = db.prepare('SELECT actual_paid FROM salary_payments WHERE month = ? AND year = ?').all(month, year) as any[]

    const kpi = calculateDashboard(payments, expenses, salaries, targetProfitPct)

    // 3. Revenue broken down by service
    const services = ['حضانة', 'استضافة', 'جلسة']
    const revenueByService = services.map((srv) => {
      const srvPayments = payments.filter((p) => p.service === srv)
      const collectedSrv = srvPayments.reduce((sum, p) => sum + p.paid, 0)
      return {
        service: srv,
        collected: Number(collectedSrv.toFixed(2)),
      }
    })

    // 3b. Collected broken down by payment method (for the Collected card drill-down).
    // Prefer per-installment transactions; fall back to the payment's own method for
    // legacy payments that have a paid amount but no transactions recorded.
    const collectedByMethod = (db.prepare(`
      SELECT method, SUM(amount) as total FROM (
        SELECT COALESCE(NULLIF(pt.payment_method_name, ''), 'غير محدد') as method, pt.amount as amount
        FROM payment_transactions pt
        JOIN payments p ON pt.payment_id = p.id
        WHERE p.month = ? AND p.year = ?
        UNION ALL
        SELECT COALESCE(NULLIF(p.payment_method_name, ''), 'غير محدد') as method, p.paid as amount
        FROM payments p
        WHERE p.month = ? AND p.year = ? AND p.paid > 0
          AND NOT EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.payment_id = p.id)
      )
      GROUP BY method
      ORDER BY total DESC
    `).all(month, year, month, year) as { method: string; total: number }[]).map((r) => ({
      method: r.method,
      total: Number((r.total ?? 0).toFixed(2)),
    }))

    // 4. 12-Month Summary for the selected year
    const summary12Month = []
    for (const m of arabicMonths) {
      const mPayments = db.prepare('SELECT total, paid, balance FROM payments WHERE month = ? AND year = ?').all(m, year) as any[]
      const mExpenses = db.prepare('SELECT amount FROM expenses WHERE month = ? AND year = ?').all(m, year) as any[]
      const mSalaries = db.prepare('SELECT actual_paid FROM salary_payments WHERE month = ? AND year = ?').all(m, year) as any[]

      const mKpi = calculateDashboard(mPayments, mExpenses, mSalaries, targetProfitPct)
      const totalExp = mKpi.expensesTotal + mKpi.salariesTotal

      summary12Month.push({
        month: m,
        collected: mKpi.collected,
        expenses: totalExp,
        netProfit: mKpi.netProfit,
        status: mKpi.collected >= mKpi.targetRequired ? 'target_met' : 'target_missed',
      })
    }

    // 5. Smart Alerts
    const alerts = []
    
    if (kpi.gap > 0 && kpi.collected > 0) {
      alerts.push({
        type: 'warning',
        messageAr: `عجز في تحقيق الأهداف الماليّة بمقدار ${kpi.gap} ج.م لهذا الشهر`,
        messageEn: `Financial target shortfall of ${kpi.gap} EGP this month`,
      })
    }
    
    if (kpi.arrears > 0) {
      alerts.push({
        type: 'danger',
        messageAr: `هناك متأخرات مستحقة بقيمة ${kpi.arrears} ج.م على الأطفال هذا الشهر`,
        messageEn: `There are outstanding arrears of ${kpi.arrears} EGP this month`,
      })
    }
    
    if (kpi.collectionRate < 0.80 && kpi.invoiced > 0) {
      const pct = Math.round(kpi.collectionRate * 100)
      alerts.push({
        type: 'info',
        messageAr: `نسبة تحصيل الاشتراكات منخفضة (${pct}%)`,
        messageEn: `Low collection rate of (${pct}%)`,
      })
    }

    return {
      kpis: {
        invoiced: kpi.invoiced,
        collected: kpi.collected,
        arrears: kpi.arrears,
        collectionRate: kpi.collectionRate,
        expensesTotal: kpi.expensesTotal,
        salariesTotal: kpi.salariesTotal,
        netProfit: kpi.netProfit,
      },
      target: {
        required: kpi.targetRequired,
        collected: kpi.collected,
        gap: kpi.gap,
        status: kpi.gap === 0 && kpi.targetRequired > 0 ? 'met' : 'missed',
      },
      summary12Month,
      revenueByService,
      collectedByMethod,
      alerts,
    }
  } catch (error: any) {
    console.error('Failed to get dashboard data:', error)
    throw new Error(error.message || 'Failed to retrieve dashboard data')
  }
})
