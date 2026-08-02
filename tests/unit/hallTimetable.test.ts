import { vi, describe, it, expect } from 'vitest'

// Mock Electron so importing the IPC module (which registers handlers at import time) is safe.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'mock-user-data' },
}))

import { timeToMinutes, validateDaySlots, validateTimetable } from '../../electron/ipc/hallsIPC.js'

describe('Hall timetable validation', () => {
  it('accepts two separate intervals on the same day', () => {
    // The motivating case: a hall running 1 PM - 6 PM and again 8 PM - midnight.
    expect(() =>
      validateDaySlots([
        { day_of_week: 1, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 1, start_time: '20:00', end_time: '24:00' },
      ])
    ).not.toThrow()
  })

  it('rejects overlapping intervals on the same day', () => {
    expect(() =>
      validateDaySlots([
        { day_of_week: 1, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 1, start_time: '17:00', end_time: '20:00' },
      ])
    ).toThrow(/متداخلة|Overlapping/)
  })

  it('rejects an interval that ends before it starts', () => {
    expect(() =>
      validateDaySlots([{ day_of_week: 2, start_time: '18:00', end_time: '13:00' }])
    ).toThrow(/بعد وقت البداية|after start time/)
  })

  it('rejects a zero-length interval', () => {
    expect(() =>
      validateDaySlots([{ day_of_week: 2, start_time: '13:00', end_time: '13:00' }])
    ).toThrow(/بعد وقت البداية|after start time/)
  })

  it('allows the same clock times on different days', () => {
    expect(() =>
      validateTimetable([
        { day_of_week: 1, start_time: '13:00', end_time: '18:00' },
        { day_of_week: 2, start_time: '13:00', end_time: '18:00' },
      ])
    ).not.toThrow()
  })

  it('rejects a day outside 0-6', () => {
    expect(() =>
      validateTimetable([{ day_of_week: 7, start_time: '13:00', end_time: '18:00' }])
    ).toThrow(/يوم الأسبوع|day of week/)
  })

  it('rejects a malformed time', () => {
    expect(() => timeToMinutes('25:00')).toThrow()
    expect(() => timeToMinutes('1:00')).toThrow()
    expect(() => timeToMinutes('')).toThrow()
  })

  it('accepts 24:00 as end-of-day', () => {
    expect(timeToMinutes('24:00')).toBe(1440)
    expect(timeToMinutes('13:00')).toBe(780)
  })
})
