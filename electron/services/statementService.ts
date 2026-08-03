/**
 * @param installments Instalment-plan rows for the student. They belong in the statement as
 *   first-class charges: a planned fee is deliberately absent from `payments`, so a statement
 *   built from payments alone shows a student on a plan owing and paying nothing.
 */
export function getStudentStatement(
  student: any,
  existingPayments: any[],
  currentDate: Date,
  installments: any[] = []
) {
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ]

  const regDate = new Date(student.reg_date)
  let startYear = regDate.getFullYear()
  let startMonth = regDate.getMonth()

  if (isNaN(startYear) || isNaN(startMonth)) {
    const fallbackDate = currentDate || new Date()
    startYear = fallbackDate.getFullYear()
    startMonth = fallbackDate.getMonth()
  }

  const endYear = currentDate.getFullYear()
  const endMonth = currentDate.getMonth()

  const statementMonths: { month: string; year: number }[] = []

  let currY = startYear
  let currM = startMonth

  // If reg date is in the future compared to currentDate, handle gracefully
  if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
    statementMonths.push({
      month: arabicMonths[startMonth],
      year: startYear
    })
  } else {
    while (currY < endYear || (currY === endYear && currM <= endMonth)) {
      statementMonths.push({
        month: arabicMonths[currM],
        year: currY
      })
      currM++
      if (currM > 11) {
        currM = 0
        currY++
      }
    }
  }

  // Instalments are folded in as charges bucketed by the month they fall due, so they land in
  // the same month rows as ordinary payments and roll up into the same totals.
  const installmentRows = installments.map((i) => ({
    month: i.month,
    year: i.year,
    service: i.service || student.service,
    unit: 'إجمالي',
    quantity: 1,
    price: i.amount,
    total: i.amount,
    paid: i.paid,
    balance: i.balance,
    status: i.status,
    notes: `دفعة ${i.seq} — تستحق ${i.due_date} / Instalment ${i.seq} — due ${i.due_date}`,
  }))

  const paymentMap = new Map<string, any[]>()
  for (const p of [...existingPayments, ...installmentRows]) {
    const key = `${p.year}-${p.month}`
    if (!paymentMap.has(key)) {
      paymentMap.set(key, [])
    }
    paymentMap.get(key)!.push(p)
  }

  // A plan can run past the current month, so the statement must extend to the last due date —
  // otherwise future instalments would be silently dropped from the account.
  for (const row of installmentRows) {
    const exists = statementMonths.some((m) => m.month === row.month && m.year === row.year)
    if (!exists) statementMonths.push({ month: row.month, year: row.year })
  }

  const rows: any[] = []
  
  for (const { month, year } of statementMonths) {
    const key = `${year}-${month}`
    const existingList = paymentMap.get(key)
    
    if (existingList && existingList.length > 0) {
      for (const existing of existingList) {
        rows.push({
          month,
          year,
          service: existing.service,
          unit: existing.unit,
          quantity: existing.quantity,
          price: existing.price,
          total: existing.total,
          paid: existing.paid,
          balance: existing.balance,
          status: existing.status,
          notes: existing.notes || ''
        })
      }
    } else {
      // Create empty placeholder rows for each active enrollment of the student
      // However, we don't have student_services here directly. We just have student.service.
      // But actually, we only need placeholders if we want to show unpaid expected amounts.
      // Since we don't have the student_services array passed in getStudentStatement, 
      // maybe we should just create a placeholder using the student's default service?
      // Or we can fetch student_services in the calling code.
      // For now, if there's no payment, we just insert the default student service as a placeholder.
      rows.push({
        month,
        year,
        service: student.service,
        unit: student.unit,
        quantity: 0,
        price: student.price,
        total: 0,
        paid: 0,
        balance: 0,
        status: 'unpaid',
        notes: ''
      })
    }
  }

  // Sort reverse chronological
  rows.sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year
    }
    const idxA = arabicMonths.indexOf(a.month)
    const idxB = arabicMonths.indexOf(b.month)
    return idxB - idxA
  })

  let totalInvoiced = 0
  let totalCollected = 0
  let totalBalance = 0

  for (const row of rows) {
    totalInvoiced += row.total
    totalCollected += row.paid
    totalBalance += row.balance
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      guardian: student.guardian,
      guardian_phone: student.guardian_phone,
      service: student.service,
      unit: student.unit,
      price: student.price,
      reg_date: student.reg_date,
      is_active: student.is_active,
      // Feature 004 — surface photo, teacher, and computed fee on the record
      photo_url: student.photo_url ?? null,
      teacher_name: student.teacher_name ?? null,
      monthly_fee: student.monthly_fee ?? null
    },
    rows,
    summary: {
      activeMonths: statementMonths.length,
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalCollected: Number(totalCollected.toFixed(2)),
      totalBalance: Number(totalBalance.toFixed(2)),
      // FR-010: explicit alias for "Remaining Due" alongside "Total Paid" (totalCollected).
      // Equal to totalBalance (total invoiced - total collected) — kept as its own field so
      // UI code doesn't need to know totalBalance IS the remaining-due figure.
      remainingDue: Number(totalBalance.toFixed(2))
    }
  }
}
