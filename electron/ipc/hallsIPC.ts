import { ipcMain } from 'electron'
import { getDb } from '../db/connection.js'
import { requireAdmin, checkAuth } from './_guard.js'
import { recordLocalTombstone } from '../services/tombstones.js'

/**
 * A hall's opening hours are a list of intervals per weekday, not one interval — a hall can run
 * an afternoon block and an evening block on the same day (e.g. 13:00-18:00 and 20:00-24:00).
 * Times are 'HH:MM' in 24-hour form; '24:00' is accepted as end-of-day.
 */
export interface HallSlotInput {
  day_of_week: number
  start_time: string
  end_time: string
  notes?: string | null
}

const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)$/

/** Minutes since midnight, so intervals can be compared and overlap-checked numerically. */
export function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time)
  if (!m) throw new Error(`صيغة الوقت غير صالحة (${time}) — استخدم HH:MM / Invalid time format (${time}) — use HH:MM`)
  const minutes = Number(m[1]) * 60 + Number(m[2])
  if (minutes > 24 * 60) throw new Error(`الوقت خارج النطاق (${time}) / Time out of range (${time})`)
  return minutes
}

/**
 * Validates one day's worth of intervals: each must be non-empty and they must not overlap
 * each other. Pure/exported so the rule is unit-testable without a database.
 */
export function validateDaySlots(slots: HallSlotInput[]): void {
  const sorted = [...slots].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
  let previousEnd = -1
  for (const slot of sorted) {
    const start = timeToMinutes(slot.start_time)
    const end = timeToMinutes(slot.end_time)
    if (end <= start) {
      throw new Error(
        `وقت النهاية يجب أن يكون بعد وقت البداية (${slot.start_time} - ${slot.end_time}) / ` +
        `End time must be after start time (${slot.start_time} - ${slot.end_time})`
      )
    }
    if (start < previousEnd) {
      throw new Error(
        `فترات متداخلة في نفس اليوم (${slot.start_time} - ${slot.end_time}) / ` +
        `Overlapping intervals on the same day (${slot.start_time} - ${slot.end_time})`
      )
    }
    previousEnd = end
  }
}

/** Validates a whole week's timetable, day by day. */
export function validateTimetable(slots: HallSlotInput[]): void {
  for (let day = 0; day <= 6; day++) {
    const forDay = slots.filter((s) => Number(s.day_of_week) === day)
    if (forDay.length > 0) validateDaySlots(forDay)
  }
  for (const s of slots) {
    const day = Number(s.day_of_week)
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error('يوم الأسبوع غير صالح / Invalid day of week')
    }
  }
}

/** Replaces a hall's whole timetable in one shot — simpler and race-free vs. per-slot edits. */
function writeTimetable(db: any, hallId: number, slots: HallSlotInput[]): void {
  const now = new Date().toISOString()
  // The replaced slots get new ids, so their removal must be tombstoned — otherwise the next
  // pull restores the old opening hours on top of the new ones.
  for (const row of db.prepare('SELECT id FROM hall_time_slots WHERE hall_id = ?').all(hallId) as { id: number }[]) {
    recordLocalTombstone(db, 'hall_time_slots', row.id)
  }
  db.prepare('DELETE FROM hall_time_slots WHERE hall_id = ?').run(hallId)
  const insert = db.prepare(`
    INSERT INTO hall_time_slots (hall_id, day_of_week, start_time, end_time, notes, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `)
  for (const slot of slots) {
    insert.run(hallId, Number(slot.day_of_week), slot.start_time, slot.end_time, slot.notes || null, now, now)
  }
}

ipcMain.handle('halls:list', async (_event, args = {}) => {
  try {
    checkAuth()
    const db = getDb()

    let query = `
      SELECT h.*, b.name AS branch_name, b.kind AS branch_kind
      FROM halls h
      LEFT JOIN branches b ON b.id = h.branch_id
      WHERE 1=1
    `
    const params: any[] = []
    if (args?.activeOnly !== false) query += ' AND h.is_active = 1'
    if (args?.branch_id) {
      query += ' AND h.branch_id = ?'
      params.push(Number(args.branch_id))
    }
    query += ' ORDER BY h.name ASC'

    const halls = db.prepare(query).all(...params) as any[]
    const slots = db.prepare(`
      SELECT * FROM hall_time_slots ORDER BY day_of_week ASC, start_time ASC
    `).all() as any[]

    for (const hall of halls) {
      hall.slots = slots.filter((s) => s.hall_id === hall.id)
      hall.total_hours = Number(
        (hall.slots.reduce(
          (sum: number, s: any) => sum + (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)), 0
        ) / 60).toFixed(2)
      )
    }
    return halls
  } catch (error: any) {
    console.error('Failed to list halls:', error)
    throw new Error(error.message || 'Failed to list halls')
  }
})

ipcMain.handle('halls:get', async (_event, { id }) => {
  try {
    checkAuth()
    const db = getDb()
    if (!id) throw new Error('Hall ID is required')

    const hall = db.prepare(`
      SELECT h.*, b.name AS branch_name, b.kind AS branch_kind
      FROM halls h LEFT JOIN branches b ON b.id = h.branch_id
      WHERE h.id = ?
    `).get(id) as any
    if (!hall) throw new Error('القاعة غير موجودة / Hall not found')

    hall.slots = db.prepare(
      'SELECT * FROM hall_time_slots WHERE hall_id = ? ORDER BY day_of_week ASC, start_time ASC'
    ).all(id)
    return hall
  } catch (error: any) {
    console.error('Failed to get hall:', error)
    throw new Error(error.message || 'Failed to get hall')
  }
})

ipcMain.handle('halls:add', async (_event, args) => {
  try {
    requireAdmin()
    const db = getDb()

    const name = String(args?.name ?? '').trim()
    if (!name) throw new Error('اسم القاعة مطلوب / Hall name is required')

    const branchId = args?.branch_id ? Number(args.branch_id) : null
    const clash = branchId
      ? db.prepare('SELECT id FROM halls WHERE name = ? AND branch_id = ?').get(name, branchId)
      : db.prepare('SELECT id FROM halls WHERE name = ? AND branch_id IS NULL').get(name)
    if (clash) throw new Error('اسم القاعة موجود بالفعل في هذا الفرع / A hall with this name already exists in this branch')

    const slots: HallSlotInput[] = Array.isArray(args?.slots) ? args.slots : []
    validateTimetable(slots)

    const now = new Date().toISOString()
    let hallId = 0
    db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO halls (name, branch_id, capacity, notes, is_active, created_at, updated_at, synced)
        VALUES (?, ?, ?, ?, 1, ?, ?, 0)
      `).run(name, branchId, args?.capacity != null && args.capacity !== '' ? Number(args.capacity) : null,
        args?.notes?.trim() || null, now, now)
      hallId = Number(result.lastInsertRowid)
      writeTimetable(db, hallId, slots)
    })()

    const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(hallId) as any
    hall.slots = db.prepare('SELECT * FROM hall_time_slots WHERE hall_id = ? ORDER BY day_of_week ASC, start_time ASC').all(hallId)
    return hall
  } catch (error: any) {
    console.error('Failed to add hall:', error)
    throw new Error(error.message || 'Failed to add hall')
  }
})

/** Updates a hall. Passing `slots` replaces the whole timetable; omitting it leaves it alone. */
ipcMain.handle('halls:update', async (_event, { id, patch }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id || !patch) throw new Error('Hall ID and patch data are required')

    const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(id) as any
    if (!hall) throw new Error('القاعة غير موجودة / Hall not found')

    const name = patch.name !== undefined ? String(patch.name).trim() : hall.name
    if (!name) throw new Error('اسم القاعة مطلوب / Hall name is required')

    const branchId = patch.branch_id !== undefined
      ? (patch.branch_id ? Number(patch.branch_id) : null)
      : hall.branch_id

    const clash = branchId
      ? db.prepare('SELECT id FROM halls WHERE name = ? AND branch_id = ? AND id != ?').get(name, branchId, id)
      : db.prepare('SELECT id FROM halls WHERE name = ? AND branch_id IS NULL AND id != ?').get(name, id)
    if (clash) throw new Error('اسم القاعة موجود بالفعل في هذا الفرع / A hall with this name already exists in this branch')

    if (patch.slots !== undefined) validateTimetable(patch.slots ?? [])

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`
        UPDATE halls SET name = ?, branch_id = ?, capacity = ?, notes = ?, is_active = ?,
          updated_at = ?, synced = 0
        WHERE id = ?
      `).run(
        name,
        branchId,
        patch.capacity !== undefined ? (patch.capacity === '' || patch.capacity === null ? null : Number(patch.capacity)) : hall.capacity,
        patch.notes !== undefined ? (patch.notes?.trim() || null) : hall.notes,
        patch.is_active !== undefined ? Number(patch.is_active) : hall.is_active,
        now, id
      )
      if (patch.slots !== undefined) writeTimetable(db, Number(id), patch.slots ?? [])
    })()

    const updated = db.prepare('SELECT * FROM halls WHERE id = ?').get(id) as any
    updated.slots = db.prepare('SELECT * FROM hall_time_slots WHERE hall_id = ? ORDER BY day_of_week ASC, start_time ASC').all(id)
    return updated
  } catch (error: any) {
    console.error('Failed to update hall:', error)
    throw new Error(error.message || 'Failed to update hall')
  }
})

ipcMain.handle('halls:delete', async (_event, { id }) => {
  try {
    requireAdmin()
    const db = getDb()
    if (!id) throw new Error('Hall ID is required')

    const hall = db.prepare('SELECT id FROM halls WHERE id = ?').get(id)
    if (!hall) throw new Error('القاعة غير موجودة / Hall not found')

    db.transaction(() => {
      // hall_time_slots cascades on the FK, so the timetable goes with the hall — but each
      // cascaded row still needs its own tombstone for the delete to reach other machines.
      for (const row of db.prepare('SELECT id FROM hall_time_slots WHERE hall_id = ?').all(id) as { id: number }[]) {
        recordLocalTombstone(db, 'hall_time_slots', row.id)
      }
      db.prepare('DELETE FROM halls WHERE id = ?').run(id)
      recordLocalTombstone(db, 'halls', Number(id))
    })()

    return { ok: true }
  } catch (error: any) {
    console.error('Failed to delete hall:', error)
    throw new Error(error.message || 'Failed to delete hall')
  }
})

/**
 * The weekly grid: every hall's intervals bucketed by weekday (0 = Sunday … 6 = Saturday),
 * ready to render as a timetable without further reshaping in the renderer.
 */
ipcMain.handle('halls:timetable', async (_event, args = {}) => {
  try {
    checkAuth()
    const db = getDb()

    let query = `
      SELECT s.*, h.name AS hall_name, h.capacity, h.branch_id, b.name AS branch_name
      FROM hall_time_slots s
      JOIN halls h ON h.id = s.hall_id
      LEFT JOIN branches b ON b.id = h.branch_id
      WHERE h.is_active = 1
    `
    const params: any[] = []
    if (args?.branch_id) {
      query += ' AND h.branch_id = ?'
      params.push(Number(args.branch_id))
    }
    if (args?.hall_id) {
      query += ' AND h.id = ?'
      params.push(Number(args.hall_id))
    }
    query += ' ORDER BY s.day_of_week ASC, s.start_time ASC, h.name ASC'

    const slots = db.prepare(query).all(...params) as any[]

    return Array.from({ length: 7 }, (_, day) => ({
      day_of_week: day,
      slots: slots.filter((s) => s.day_of_week === day),
    }))
  } catch (error: any) {
    console.error('Failed to build hall timetable:', error)
    throw new Error(error.message || 'Failed to build hall timetable')
  }
})
