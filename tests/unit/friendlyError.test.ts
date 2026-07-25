import { describe, it, expect } from 'vitest'
import { friendlyError } from '../../src/utils/errors.js'

describe('friendlyError', () => {
  it('strips the IPC wrapper and error-code prefix from a forbidden error', () => {
    const err = new Error("Error invoking remote method 'sessions:delete': Error: FORBIDDEN: غير مسموح بالوصول لغير المسؤولين / Forbidden")
    expect(friendlyError(err)).toBe('غير مسموح بالوصول لغير المسؤولين / Forbidden')
  })

  it('strips the IPC wrapper and UNAUTHORIZED code', () => {
    const err = new Error("Error invoking remote method 'attendance:getSheet': Error: UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized")
    expect(friendlyError(err)).toBe('يجب تسجيل الدخول أولاً / Unauthorized')
  })

  it('leaves a plain message without a code prefix untouched', () => {
    const err = new Error("Error invoking remote method 'children:update': Error: الطفل غير موجود / Child not found")
    expect(friendlyError(err)).toBe('الطفل غير موجود / Child not found')
  })

  it('handles a message with no IPC wrapper at all', () => {
    expect(friendlyError(new Error('Month and year are required'))).toBe('Month and year are required')
  })

  it('falls back to a generic message for an empty error', () => {
    expect(friendlyError(new Error(''))).toBe('حدث خطأ غير متوقع / An unexpected error occurred')
  })
})
