export function getChildStatement(child: any, existingPayments: any[], currentDate: Date) {
  const arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ]

  const regDate = new Date(child.reg_date)
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

  const paymentMap = new Map<string, any[]>()
  for (const p of existingPayments) {
    const key = `${p.year}-${p.month}`
    if (!paymentMap.has(key)) {
      paymentMap.set(key, [])
    }
    paymentMap.get(key)!.push(p)
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
      // Create empty placeholder rows for each active enrollment of the child
      // However, we don't have child_services here directly. We just have child.service.
      // But actually, we only need placeholders if we want to show unpaid expected amounts.
      // Since we don't have the child_services array passed in getChildStatement, 
      // maybe we should just create a placeholder using the child's default service?
      // Or we can fetch child_services in the calling code.
      // For now, if there's no payment, we just insert the default child service as a placeholder.
      rows.push({
        month,
        year,
        service: child.service,
        unit: child.unit,
        quantity: 0,
        price: child.price,
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
    child: {
      id: child.id,
      name: child.name,
      guardian: child.guardian,
      guardian_phone: child.guardian_phone,
      service: child.service,
      unit: child.unit,
      price: child.price,
      reg_date: child.reg_date,
      is_active: child.is_active,
      // Feature 004 — surface photo, teacher, and computed fee on the record
      photo_url: child.photo_url ?? null,
      teacher_name: child.teacher_name ?? null,
      monthly_fee: child.monthly_fee ?? null
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
