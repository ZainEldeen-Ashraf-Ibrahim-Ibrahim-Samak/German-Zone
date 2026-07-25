import { describe, it, expect } from 'vitest'

/**
 * Guardian phone validation (feature 004, FR-001).
 * Egyptian mobile: exactly 11 digits, digits only, starts with "01".
 * Mirrors GUARDIAN_PHONE_RE in electron/ipc/childrenIPC.ts and ChildForm.tsx.
 */
const GUARDIAN_PHONE_RE = /^(?:\+?2)?01[0-9]{9}$/

describe('guardian phone validation', () => {
  it('accepts a valid number starting with 01, +201, or 201', () => {
    expect(GUARDIAN_PHONE_RE.test('01012345678')).toBe(true)
    expect(GUARDIAN_PHONE_RE.test('01234567890')).toBe(true)
    expect(GUARDIAN_PHONE_RE.test('+201012345678')).toBe(true)
    expect(GUARDIAN_PHONE_RE.test('201012345678')).toBe(true)
  })

  it('rejects numbers that are too short', () => {
    expect(GUARDIAN_PHONE_RE.test('0123')).toBe(false)
    expect(GUARDIAN_PHONE_RE.test('0101234567')).toBe(false) // 10 digits
    expect(GUARDIAN_PHONE_RE.test('+20101234567')).toBe(false)
  })

  it('rejects numbers that are too long', () => {
    expect(GUARDIAN_PHONE_RE.test('010123456789')).toBe(false) // 12 digits (non-prefix)
    expect(GUARDIAN_PHONE_RE.test('+2010123456789')).toBe(false)
  })

  it('rejects numbers not starting with 01, +201, or 201', () => {
    expect(GUARDIAN_PHONE_RE.test('02012345678')).toBe(false)
    expect(GUARDIAN_PHONE_RE.test('11012345678')).toBe(false)
    expect(GUARDIAN_PHONE_RE.test('+301012345678')).toBe(false)
  })

  it('rejects non-digit characters (other than leading +)', () => {
    expect(GUARDIAN_PHONE_RE.test('0101234567a')).toBe(false)
    expect(GUARDIAN_PHONE_RE.test('010 123 4567')).toBe(false)
    expect(GUARDIAN_PHONE_RE.test('+20101234567a')).toBe(false)
  })
})
