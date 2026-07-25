import { describe, it, expect } from 'vitest'

/**
 * Unit tests for buildLessonFields normalization (feature 004, FR-008–FR-011).
 * Replicates the private buildLessonFields() in electron/ipc/childrenIPC.ts.
 * Test this file whenever that function changes to keep parity.
 */

function buildLessonFields(src: any) {
  const sessions_baseline =
    src.sessions_baseline === undefined || src.sessions_baseline === null
      ? 8
      : Math.max(0, Math.trunc(Number(src.sessions_baseline)))

  const extra_lessons =
    src.extra_lessons === undefined || src.extra_lessons === null
      ? 0
      : Math.max(0, Math.trunc(Number(src.extra_lessons)))

  const session_price =
    src.session_price === undefined || src.session_price === null || src.session_price === ''
      ? null
      : Number(src.session_price)

  if (session_price !== null && session_price < 0) {
    throw new Error('سعر الجلسة لا يمكن أن يكون سالباً / Session price cannot be negative')
  }

  const lesson_days =
    src.lesson_days === undefined || src.lesson_days === null
      ? null
      : Array.isArray(src.lesson_days)
        ? JSON.stringify(src.lesson_days)
        : String(src.lesson_days)

  const monthly_fee =
    session_price === null
      ? null
      : Number(((sessions_baseline + extra_lessons) * session_price).toFixed(2))

  const teacher_id =
    src.teacher_id === undefined || src.teacher_id === null || src.teacher_id === ''
      ? null
      : Number(src.teacher_id)

  return { teacher_id, lesson_days, sessions_baseline, extra_lessons, session_price, monthly_fee }
}

describe('buildLessonFields — defaults', () => {
  it('defaults sessions_baseline to 8 when omitted', () => {
    const r = buildLessonFields({})
    expect(r.sessions_baseline).toBe(8)
  })

  it('defaults extra_lessons to 0 when omitted', () => {
    const r = buildLessonFields({})
    expect(r.extra_lessons).toBe(0)
  })

  it('defaults session_price to null when omitted', () => {
    const r = buildLessonFields({})
    expect(r.session_price).toBeNull()
  })

  it('defaults monthly_fee to null when session_price is absent', () => {
    const r = buildLessonFields({})
    expect(r.monthly_fee).toBeNull()
  })

  it('defaults teacher_id to null when omitted or empty string', () => {
    expect(buildLessonFields({}).teacher_id).toBeNull()
    expect(buildLessonFields({ teacher_id: '' }).teacher_id).toBeNull()
    expect(buildLessonFields({ teacher_id: null }).teacher_id).toBeNull()
  })

  it('defaults lesson_days to null when omitted', () => {
    expect(buildLessonFields({}).lesson_days).toBeNull()
  })
})

describe('buildLessonFields — sessions_baseline', () => {
  it('accepts explicit baseline', () => {
    expect(buildLessonFields({ sessions_baseline: 10 }).sessions_baseline).toBe(10)
  })

  it('truncates fractional baseline (floor toward zero)', () => {
    expect(buildLessonFields({ sessions_baseline: 7.9 }).sessions_baseline).toBe(7)
  })

  it('clamps negative baseline to 0', () => {
    expect(buildLessonFields({ sessions_baseline: -3 }).sessions_baseline).toBe(0)
  })

  it('treats null baseline as 8 (default)', () => {
    expect(buildLessonFields({ sessions_baseline: null }).sessions_baseline).toBe(8)
  })
})

describe('buildLessonFields — extra_lessons', () => {
  it('accepts positive extras', () => {
    expect(buildLessonFields({ extra_lessons: 3 }).extra_lessons).toBe(3)
  })

  it('truncates fractional extras', () => {
    expect(buildLessonFields({ extra_lessons: 2.8 }).extra_lessons).toBe(2)
  })

  it('clamps negative extras to 0', () => {
    expect(buildLessonFields({ extra_lessons: -1 }).extra_lessons).toBe(0)
  })
})

describe('buildLessonFields — monthly_fee computation', () => {
  it('computes fee = (8 + 0) * price by default', () => {
    expect(buildLessonFields({ session_price: 100 }).monthly_fee).toBe(800)
  })

  it('adds extra_lessons to session count before multiplying', () => {
    expect(buildLessonFields({ extra_lessons: 2, session_price: 100 }).monthly_fee).toBe(1000)
  })

  it('uses custom baseline when provided', () => {
    expect(buildLessonFields({ sessions_baseline: 12, session_price: 50 }).monthly_fee).toBe(600)
  })

  it('returns null fee when price is null', () => {
    expect(buildLessonFields({ sessions_baseline: 8, extra_lessons: 2 }).monthly_fee).toBeNull()
  })

  it('returns null fee when price is empty string', () => {
    expect(buildLessonFields({ session_price: '' }).monthly_fee).toBeNull()
  })

  it('rounds fee to 2 decimal places', () => {
    const r = buildLessonFields({ session_price: 33.333 })
    expect(r.monthly_fee).toBe(Number((8 * 33.333).toFixed(2)))
  })
})

describe('buildLessonFields — session_price validation', () => {
  it('throws when session_price is negative', () => {
    expect(() => buildLessonFields({ session_price: -10 })).toThrow()
  })

  it('accepts zero price (free session)', () => {
    const r = buildLessonFields({ session_price: 0 })
    expect(r.session_price).toBe(0)
    expect(r.monthly_fee).toBe(0)
  })
})

describe('buildLessonFields — lesson_days serialization', () => {
  it('JSON-serializes an array of day strings', () => {
    const r = buildLessonFields({ lesson_days: ['الأحد', 'الثلاثاء'] })
    expect(r.lesson_days).toBe('["الأحد","الثلاثاء"]')
  })

  it('passes through a plain string unchanged', () => {
    const r = buildLessonFields({ lesson_days: 'الأحد,الثلاثاء' })
    expect(r.lesson_days).toBe('الأحد,الثلاثاء')
  })

  it('returns null for null lesson_days', () => {
    expect(buildLessonFields({ lesson_days: null }).lesson_days).toBeNull()
  })

  it('coerces a number to string', () => {
    expect(buildLessonFields({ lesson_days: 3 as any }).lesson_days).toBe('3')
  })
})

describe('buildLessonFields — teacher_id coercion', () => {
  it('converts numeric string to number', () => {
    expect(buildLessonFields({ teacher_id: '5' }).teacher_id).toBe(5)
  })

  it('stores numeric teacher_id directly', () => {
    expect(buildLessonFields({ teacher_id: 7 }).teacher_id).toBe(7)
  })
})
