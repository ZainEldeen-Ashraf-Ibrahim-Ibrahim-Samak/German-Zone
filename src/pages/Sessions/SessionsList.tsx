import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSessionsStore } from '../../store/useSessionsStore.js'
import { useAttendanceStore } from '../../store/useAttendanceStore.js'
import { useAuthStore } from '../../store/useAuthStore.js'
import { useAttendanceEditRequestsStore } from '../../store/useAttendanceEditRequestsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import { Select } from '../../components/ui/Select.js'
import type { ScheduledSession, AttendanceRecord, AttendanceStatus } from '../../types/index.js'

export default function SessionsList() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { sessions, isLoading, error, fetchSessions, addSession, updateSession, deleteSession, clearError } = useSessionsStore()
  const { sheet, isLoading: sheetLoading, error: sheetError, fetchSheet, recordBulk, clearError: clearSheetError } = useAttendanceStore()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.role === 'admin'
  const { requestEdit: submitEditRequest, isLoading: isSubmittingEditRequest } = useAttendanceEditRequestsStore()

  // "Request Edit" modal (feature 007) — non-admins propose a change to a locked record instead
  // of editing it directly.
  const [editRequestTarget, setEditRequestTarget] = useState<AttendanceRecord | null>(null)
  const [editRequestStatus, setEditRequestStatus] = useState<AttendanceStatus>('attended')
  const [editRequestExcuseNotes, setEditRequestExcuseNotes] = useState('')
  const [editRequestReason, setEditRequestReason] = useState('')
  const [editRequestError, setEditRequestError] = useState('')

  // Filter state
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    return d.toISOString().slice(0, 10)
  })

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledSession | null>(null)
  const [sessionDate, setSessionDate] = useState('')
  const [groupName, setGroupName] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [toDelete, setToDelete] = useState<ScheduledSession | null>(null)

  // Search state
  const [sessionsSearch, setSessionsSearch] = useState('')
  const [attendanceSearch, setAttendanceSearch] = useState('')
  const [hasTeacherFilter, setHasTeacherFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [attendanceHasTeacherOnly, setAttendanceHasTeacherOnly] = useState(false)

  // Teacher filters
  const [teacherFilterId, setTeacherFilterId] = useState<number | ''>('')

  // Attendance sheet state
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)
  // Keyed by "childId:teacherId" (teacherId is "none" when the child has no teacher at all) —
  // a child can appear more than once in `sheet` when they have multiple teachers across
  // service enrollments, so child_id alone is no longer a unique key.
  const [attendanceEdits, setAttendanceEdits] = useState<Record<string, { status: AttendanceStatus | null; excuse_notes: string; teacher_status: 'present' | 'absent' }>>({})
  const [isSavingAttendance, setIsSavingAttendance] = useState(false)

  // Today's auto-session detection
  const [todayChildren, setTodayChildren] = useState<{ id: number; name: string }[]>([])
  const [isCreatingToday, setIsCreatingToday] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayDow = new Date().getDay()

  useEffect(() => { fetchSessions(fromDate, toDate) }, [fromDate, toDate])

  useEffect(() => {
    window.api.sessions.childrenForDay(todayDow).then(setTodayChildren).catch(() => {})
  }, [todayDow])

  const hasTodaySession = sessions.some(s => s.session_date === todayStr)

  const handleCreateTodaySession = async () => {
    if (hasTodaySession) { setSuccessMsg(isAr ? 'جلسة اليوم موجودة بالفعل.' : "Today's session already exists."); return }
    setIsCreatingToday(true)
    await addSession({ session_date: todayStr })
    setIsCreatingToday(false)
    fetchSessions(fromDate, toDate)
  }

  const openCreate = () => {
    setEditing(null); setSessionDate(new Date().toISOString().slice(0, 10)); setGroupName(''); setSessionNotes(''); setFormError('')
    setIsFormOpen(true)
  }
  const openEdit = (s: ScheduledSession) => {
    setEditing(s); setSessionDate(s.session_date); setGroupName(s.group_name || ''); setSessionNotes(s.notes || ''); setFormError('')
    setIsFormOpen(true)
  }

  const handleSubmit = async () => {
    setFormError('')
    if (!sessionDate) { setFormError(isAr ? 'التاريخ مطلوب' : 'Date is required'); return }
    setIsSubmitting(true)
    const payload = { session_date: sessionDate, group_name: groupName || null, notes: sessionNotes || null }
    const result = editing ? await updateSession(editing.id, payload) : await addSession(payload)
    setIsSubmitting(false)
    if (result) {
      setSuccessMsg(isAr ? 'تم الحفظ.' : 'Saved.')
      setIsFormOpen(false)
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    const ok = await deleteSession(toDelete.id)
    if (ok) setSuccessMsg(isAr ? 'تم الحذف.' : 'Deleted.')
    setToDelete(null)
  }

  const openAttendance = async (sessionId: number) => {
    setViewingSessionId(sessionId)
    await fetchSheet(sessionId)
    setAttendanceEdits({})
    setAttendanceSearch('')
    setAttendanceHasTeacherOnly(false)
    setTeacherFilterId('')
  }

  // Support deep-linking here from the Calendar page (?session=<id>) — clicking a scheduled
  // session there should open its attendance sheet directly instead of just landing on the list.
  useEffect(() => {
    const sessionParam = searchParams.get('session')
    if (!sessionParam) return
    const sessionId = Number(sessionParam)
    if (!Number.isNaN(sessionId)) {
      openAttendance(sessionId)
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('session')
      return next
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const editKey = (rec: AttendanceRecord) => `${rec.child_id}:${rec.teacher_id ?? 'none'}`

  const getEdit = (rec: AttendanceRecord) => attendanceEdits[editKey(rec)] || {
    status: rec.status as AttendanceStatus | null,
    excuse_notes: rec.excuse_notes || '',
    teacher_status: (rec.teacher_status as 'present' | 'absent') || 'present'
  }

  // Live preview of what will actually be paid. `rec.teacher_session_rate` already carries the
  // backend's full rate resolution (attendanceIPC.ts resolveTeacherSessionRate): this child's own
  // rate override (salary type per child) → the teacher's own per-session rate → their assigned
  // salary type's session rate. No org-wide default anymore — a teacher with none of the above
  // configured just generates no payment, so misconfiguration is visible here too.
  const teacherPaymentPreview = (() => {
    const totals = new Map<number, { name: string; amount: number }>()
    let anyTeacherAssigned = false
    for (const rec of sheet) {
      if (!rec.teacher_id) continue
      anyTeacherAssigned = true
      const edit = getEdit(rec)
      const payable = edit.teacher_status === 'present' && (edit.status === 'attended' || edit.status === 'absent_unexcused')
      if (!payable) continue
      const rate = rec.teacher_session_rate
      if (rate == null) continue
      const existing = totals.get(rec.teacher_id)
      totals.set(rec.teacher_id, { name: rec.teacher_name || '', amount: (existing?.amount ?? 0) + rate })
    }
    return { credits: [...totals.entries()].map(([employee_id, v]) => ({ employee_id, ...v })), hasTeachers: anyTeacherAssigned }
  })()

  const setEdit = (key: string, field: 'status' | 'excuse_notes', value: string) => {
    setAttendanceEdits((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { status: null, excuse_notes: '', teacher_status: 'present' }), [field]: value }
    }))
  }

  const setTeacherStatus = (key: string, teacherStatus: 'present' | 'absent') => {
    setAttendanceEdits((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { status: null, excuse_notes: '', teacher_status: 'present' }), teacher_status: teacherStatus }
    }))
  }

  // Clicking the already-selected status clears it (back to no status); otherwise selects it.
  const toggleStatus = (key: string, status: AttendanceStatus, current: AttendanceStatus | null) => {
    setAttendanceEdits((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || { status: null, excuse_notes: '', teacher_status: 'present' }), status: current === status ? null : status }
    }))
  }

  const handleSaveAttendance = async () => {
    if (!viewingSessionId) return
    setIsSavingAttendance(true)
    const records = sheet
      .map((rec) => {
        const edit = getEdit(rec)
        return { child_id: rec.child_id, teacher_id: rec.teacher_id ?? null, status: edit.status, excuse_notes: edit.excuse_notes || undefined, teacher_status: edit.teacher_status }
      })
      .filter((r): r is { child_id: number; teacher_id: number | null; status: AttendanceStatus; excuse_notes: string | undefined; teacher_status: 'present' | 'absent' } => r.status != null)
    // (child, teacher) rows whose previously-saved status was cleared in the sheet — remove
    // their records so they don't reappear as selected after saving.
    const clearedItems = sheet
      .filter((rec) => editKey(rec) in attendanceEdits && attendanceEdits[editKey(rec)].status == null && rec.status != null)
      .map((rec) => ({ child_id: rec.child_id, teacher_id: rec.teacher_id ?? null }))
    const ok = await recordBulk(viewingSessionId, records)
    if (ok) {
      // Non-admins don't delete directly — the backend turns each cleared row into a pending
      // delete request for an admin to approve, and reports it via `requested`.
      let deleteRequested = 0
      if (clearedItems.length > 0) {
        try {
          const delRes = await window.api.attendance.delete(viewingSessionId, clearedItems)
          deleteRequested = delRes?.requested ?? 0
        } catch { /* best-effort */ }
      }
      // Re-fetch the sheet so the teacher-payment badges reflect what was just generated
      // (attended_teacher_id/teacher_status/payment are computed server-side and were not
      // known at the time the sheet was first opened), and refresh the outer session list so
      // its attendance_count badge doesn't go stale until a full page reload.
      const freshSheet = await window.api.attendance.getSheet(viewingSessionId)
      await fetchSheet(viewingSessionId)
      fetchSessions(fromDate, toDate)

      // Summarize what was ACTUALLY generated (from teacher_payments, via the real rate
      // resolution), grouped by the teacher who was actually credited — not the legacy
      // salary_types-based estimate, which could disagree with the real per-teacher rate.
      let msg = isAr ? 'تم حفظ الحضور.' : 'Attendance saved.'
      const generated = new Map<string, number>()
      for (const rec of freshSheet as AttendanceRecord[]) {
        if (rec.payment?.generated && rec.teacher_name && rec.payment.amount != null) {
          generated.set(rec.teacher_name, (generated.get(rec.teacher_name) ?? 0) + rec.payment.amount)
        }
      }
      if (generated.size > 0) {
        const lines = [...generated.entries()].map(([name, amount]) => `${name} +${amount} ${isAr ? 'ج.م' : 'EGP'}`).join('، ')
        msg += isAr ? ` 💰 تم احتساب راتب المعلمين: ${lines}` : ` 💰 Teacher payments credited: ${lines}`
      }
      if (deleteRequested > 0) {
        msg += isAr
          ? ` ⏳ تم إرسال ${deleteRequested} طلب حذف حضور للمدير للموافقة.`
          : ` ⏳ ${deleteRequested} attendance delete request(s) sent for admin approval.`
      }
      setSuccessMsg(msg)
      setViewingSessionId(null)
    }
    setIsSavingAttendance(false)
  }

  const statusLabel = (s: AttendanceStatus) => {
    if (s === 'attended') return isAr ? 'حاضر' : 'Attended'
    if (s === 'absent_excused') return isAr ? 'غائب بعذر' : 'Excused'
    if (s === 'deleted') return isAr ? 'حذف السجل' : 'Delete Record'
    return isAr ? 'غائب' : 'Absent'
  }

  const today = new Date().toISOString().slice(0, 10)

  // Derives open/closed/upcoming from system date
  const sessionStatus = (sessionDate: string): 'open' | 'closed' | 'upcoming' => {
    if (sessionDate === today) return 'open'
    if (sessionDate < today) return 'closed'
    return 'upcoming'
  }

  const sessionStatusBadge = (sessionDate: string) => {
    const st = sessionStatus(sessionDate)
    if (st === 'open') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
        {isAr ? 'نشطة' : 'Open'}
      </span>
    )
    if (st === 'closed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        🔒 {isAr ? 'مغلقة' : 'Closed'}
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
        🗓 {isAr ? 'مجدولة' : 'Upcoming'}
      </span>
    )
  }

  const filteredSessions = sessions.filter(s => {
    if (hasTeacherFilter === 'yes' && (!s.teachers || s.teachers.length === 0)) return false
    if (hasTeacherFilter === 'no' && s.teachers && s.teachers.length > 0) return false

    if (!sessionsSearch) return true
    const searchLower = sessionsSearch.toLowerCase()
    return (
      s.session_date.includes(searchLower) ||
      (s.group_name && s.group_name.toLowerCase().includes(searchLower)) ||
      (s.service_name && s.service_name.toLowerCase().includes(searchLower)) ||
      (s.notes && s.notes.toLowerCase().includes(searchLower)) ||
      (s.teachers && s.teachers.some((t: any) => t.name.toLowerCase().includes(searchLower)))
    )
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'الجلسات' : 'Sessions'}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCreateTodaySession} isLoading={isCreatingToday}>
            {isAr ? '📅 تحقق من اليوم' : '📅 Check Today'}
          </Button>
          <Button variant="primary" onClick={openCreate}>{isAr ? '+ إضافة جلسة' : '+ Add Session'}</Button>
        </div>
      </div>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      {/* Today's session banner */}
      {!hasTodaySession && todayChildren.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {isAr
                ? `⚠️ لا توجد جلسة لليوم — ${todayChildren.length} طفل لديهم حصة اليوم`
                : `⚠️ No session for today — ${todayChildren.length} child${todayChildren.length !== 1 ? 'ren' : ''} scheduled`}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {todayChildren.map(c => c.name).join(' • ')}
            </p>
          </div>
          <Button variant="primary" size="sm" isLoading={isCreatingToday} onClick={handleCreateTodaySession}>
            {isAr ? 'إنشاء جلسة اليوم' : "Create Today's Session"}
          </Button>
        </div>
      )}

      {/* Date filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex gap-3 items-end flex-1">
          <Input label={isAr ? 'من' : 'From'} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input label={isAr ? 'إلى' : 'To'} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="w-full sm:w-64">
          <Input
            label={isAr ? 'البحث' : 'Search'}
            placeholder={isAr ? 'المجموعة، الملاحظات...' : 'Group, notes...'}
            value={sessionsSearch}
            onChange={(e) => setSessionsSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            label={isAr ? 'يوجد معلم' : 'Has Teacher'}
            value={hasTeacherFilter}
            onChange={(e) => setHasTeacherFilter(e.target.value as 'all' | 'yes' | 'no')}
            options={[
              { value: 'all', label: isAr ? 'الكل' : 'All' },
              { value: 'yes', label: isAr ? 'نعم' : 'Yes' },
              { value: 'no', label: isAr ? 'لا' : 'No' }
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : filteredSessions.length === 0 ? (
        <p className="text-slate-400 text-sm">
          {sessions.length === 0
            ? (isAr ? 'لا توجد جلسات في هذه الفترة.' : 'No sessions in this period.')
            : (isAr ? 'لا توجد نتائج مطابقة للبحث.' : 'No sessions matching search.')}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((s) => {
            const st = sessionStatus(s.session_date)
            const isClosed = st === 'closed'
            return (
              <div key={s.id} className={`bg-white border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${st === 'open' ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">{s.session_date}</p>
                    {sessionStatusBadge(s.session_date)}
                  </div>
                  {s.group_name && <p className="text-xs text-slate-500">{s.group_name}</p>}
                  {s.service_name && <p className="text-xs text-slate-400">{s.service_name}</p>}
                  {s.notes && <p className="text-xs text-slate-400">{s.notes}</p>}
                  {s.teachers && s.teachers.length > 0 && (
                    <p className="text-xs text-slate-400">{s.teachers.map((t: any) => t.name).join(', ')}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={isClosed ? 'ghost' : 'outline'}
                    size="sm"
                    onClick={() => openAttendance(s.id)}
                  >
                    {isClosed ? (isAr ? '👁 عرض الحضور' : '👁 View') : (isAr ? 'كشف الحضور' : 'Attendance')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}>{isAr ? 'تعديل' : 'Edit'}</Button>
                  <Button variant="danger" size="sm" onClick={() => setToDelete(s)}>{isAr ? 'حذف' : 'Delete'}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Session Modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)}
        title={editing ? (isAr ? 'تعديل الجلسة' : 'Edit Session') : (isAr ? 'إضافة جلسة' : 'Add Session')}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setIsFormOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>{isAr ? 'حفظ' : 'Save'}</Button></div>}
      >
        <div className="space-y-4">
          {formError && <Alert variant="danger" onClose={() => setFormError('')}>{formError}</Alert>}
          <Input label={isAr ? 'تاريخ الجلسة' : 'Session Date'} type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} required />
          <Input label={isAr ? 'اسم المجموعة (اختياري)' : 'Group Name (optional)'} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <Input label={isAr ? 'ملاحظات' : 'Notes'} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
          <p className="text-xs text-slate-400">
            {isAr
              ? '👩‍🏫 يتم ربط معلم كل طفل تلقائياً عند تسجيل حضوره — لا حاجة لتعيين المعلمين يدوياً.'
              : '👩‍🏫 Each attending child\'s teacher is linked automatically when attendance is recorded — no manual assignment needed.'}
          </p>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal isOpen={!!toDelete} onClose={() => setToDelete(null)} title={isAr ? 'حذف الجلسة' : 'Delete Session'}
        footer={<div className="flex gap-2"><Button variant="outline" onClick={() => setToDelete(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button><Button variant="danger" onClick={handleDelete}>{isAr ? 'حذف' : 'Delete'}</Button></div>}
      >
        <p className="text-sm text-slate-600">{isAr ? `حذف جلسة ${toDelete?.session_date}؟` : `Delete session on ${toDelete?.session_date}?`}</p>
        {!!toDelete?.attendance_count && toDelete.attendance_count > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            ⚠️ <span>
              {isAr
                ? `تحتوي هذه الجلسة على ${toDelete.attendance_count} سجل حضور. سيؤدي الحذف إلى حذف هذه السجلات نهائياً.`
                : `This session has ${toDelete.attendance_count} attendance record${toDelete.attendance_count !== 1 ? 's' : ''}. Deleting it will permanently delete ${toDelete.attendance_count !== 1 ? 'them' : 'it'}.`}
            </span>
          </div>
        )}
      </Modal>

      {/* Attendance Sheet Modal */}
      {(() => {
        const viewingSession = sessions.find(s => s.id === viewingSessionId)
        const viewingClosed = viewingSession ? sessionStatus(viewingSession.session_date) === 'closed' : false
        // Teachers actually assigned to a child in this session's sheet — not every teacher in the system.
        const sheetTeachers = (() => {
          const map = new Map<number, string>()
          for (const rec of sheet) {
            if (rec.teacher_id && rec.teacher_name && !map.has(rec.teacher_id)) map.set(rec.teacher_id, rec.teacher_name)
          }
          return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
        })()
        const filteredSheet = sheet.filter(rec => {
          if (attendanceHasTeacherOnly && !rec.teacher_id) return false
          if (teacherFilterId !== '' && rec.teacher_id !== teacherFilterId) return false
          if (!attendanceSearch) return true
          const searchLower = attendanceSearch.toLowerCase()
          return (
            (rec.child_name && rec.child_name.toLowerCase().includes(searchLower)) ||
            (rec.teacher_name && rec.teacher_name.toLowerCase().includes(searchLower))
          )
        })
        return (
      <Modal isOpen={!!viewingSessionId} onClose={() => setViewingSessionId(null)}
        title={isAr ? 'كشف الحضور' : 'Attendance Sheet'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setViewingSessionId(null)}>{isAr ? 'إغلاق' : 'Close'}</Button>
            {!viewingClosed && (
              <Button variant="primary" onClick={handleSaveAttendance} isLoading={isSavingAttendance}>{isAr ? 'حفظ الحضور' : 'Save Attendance'}</Button>
            )}
          </div>
        }
      >
        {viewingClosed && (
          <div className="mb-3 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500">
            🔒 {isAr ? 'هذه الجلسة مغلقة — تم إغلاقها تلقائياً بواسطة النظام. يمكن عرض الحضور فقط.' : 'This session is closed — auto-closed by the system. Attendance is view-only.'}
          </div>
        )}
        {/* Teacher payment banner — reflects the SAME rate resolution as the real payment
            engine (own rate → Settings default → none), so this preview can never disagree
            with what actually gets generated once Save is pressed. */}
        {teacherPaymentPreview.credits.length > 0 ? (
          <div className="mb-3 rounded-lg px-3 py-2 text-sm border bg-emerald-50 border-emerald-200 text-emerald-800">
            <div className="font-semibold">💰 {isAr ? 'دفعات المعلمين المتوقعة لهذه الجلسة:' : 'Expected teacher payments for this session:'}</div>
            <ul className="mt-1 space-y-0.5">
              {teacherPaymentPreview.credits.map((c) => (
                <li key={c.employee_id}>
                  {c.name}: <span className="font-semibold">+{c.amount} {isAr ? 'ج.م' : 'EGP'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mb-3 rounded-lg px-3 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-600">
            ℹ️ {teacherPaymentPreview.hasTeachers
              ? (isAr ? 'لا يوجد دفعات متوقعة حتى الآن — سجّل حضور المعلم وحضور/غياب بدون عذر للطفل.' : 'No expected payments yet — mark the teacher present and the child attended/absent-without-excuse.')
              : (isAr ? 'لا يوجد معلم معيّن لأي طفل في هذه الجلسة.' : 'No teacher is assigned to any child in this session.')}
          </div>
        )}
        {sheetError && <Alert variant="danger" onClose={clearSheetError}>{sheetError}</Alert>}
        {sheetLoading ? (
          <p className="text-sm text-slate-400">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
        ) : sheet.length === 0 ? (
          <p className="text-sm text-slate-400">{isAr ? 'لا يوجد أطفال مسجلون في هذه الجلسة.' : 'No children enrolled for this session.'}</p>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder={isAr ? 'البحث عن طفل أو معلم...' : 'Search child or teacher...'}
              value={attendanceSearch}
              onChange={(e) => setAttendanceSearch(e.target.value)}
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <select
                  value={teacherFilterId}
                  onChange={(e) => setTeacherFilterId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">{isAr ? 'كل المعلمين' : 'All teachers'}</option>
                  {sheetTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap select-none">
                <input
                  type="checkbox"
                  checked={attendanceHasTeacherOnly}
                  onChange={(e) => setAttendanceHasTeacherOnly(e.target.checked)}
                  className="rounded border-slate-300"
                />
                {isAr ? 'لديه معلم' : 'Has teacher'}
              </label>
            </div>
            {filteredSheet.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">{isAr ? 'لا توجد نتائج مطابقة للبحث.' : 'No matching results found.'}</p>
            ) : (
              filteredSheet.map((rec) => {
                const edit = getEdit(rec)
                const key = editKey(rec)
                // Locked (feature 007, FR-011): the row already exists, and the current user
                // isn't an admin — direct edits are blocked; only a "Request Edit" is offered.
                const isLockedForMe = !!rec.locked && !isAdmin
                const controlsDisabled = viewingClosed || isLockedForMe
                return (
                  <div key={key} className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 border border-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => navigate(`/children/${rec.child_id}/statement`)}
                      className="flex items-center gap-2 flex-1 text-start hover:opacity-75 transition-opacity"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {rec.child_photo_url
                          ? <img src={rec.child_photo_url} alt={rec.child_name} className="w-full h-full object-cover" />
                          : <span className="text-sm text-slate-300">🧒</span>
                        }
                      </div>
                      <span className="flex flex-col">
                        <span className="font-medium text-sm text-slate-800">{rec.child_name}</span>
                        <span className="text-xs text-slate-400">
                          {rec.teacher_name
                            ? (rec.teacher_session_rate == null
                                ? (isAr ? `⚠️ ${rec.teacher_name} — لا يوجد سعر جلسة محدد` : `⚠️ ${rec.teacher_name} — no session rate set`)
                                : `👩‍🏫 ${rec.teacher_name}`)
                            : (isAr ? '⚠️ لا يوجد معلم' : '⚠️ No teacher')}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
                        👩‍🏫 {isAr ? 'المعلم' : 'Teacher'}
                      </span>
                      <div className="flex gap-1">
                        {(['present', 'absent'] as const).map((ts) => (
                          <button
                            key={ts}
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => !controlsDisabled && setTeacherStatus(key, ts)}
                            className={[
                              'px-2 py-1 rounded text-xs font-medium border transition-all',
                              controlsDisabled ? 'cursor-default opacity-70' : '',
                              edit.teacher_status === ts
                                ? ts === 'present' ? 'bg-sky-100 border-sky-400 text-sky-700' : 'bg-red-100 border-red-400 text-red-700'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                            ].join(' ')}
                          >
                            {ts === 'present' ? (isAr ? 'حاضر' : 'Present') : (isAr ? 'غائب' : 'Absent')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 shrink-0">
                        🧒 {isAr ? 'الطفل' : 'Child'}
                      </span>
                      <div className="flex gap-1">
                        {(['attended', 'absent_excused', 'absent_unexcused'] as AttendanceStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => !controlsDisabled && toggleStatus(key, status, edit.status)}
                            className={[
                              'px-2 py-1 rounded text-xs font-medium border transition-all',
                              controlsDisabled ? 'cursor-default opacity-70' : '',
                              edit.status === status
                                ? status === 'attended' ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : status === 'absent_excused' ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-red-100 border-red-400 text-red-700'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                            ].join(' ')}
                          >
                            {statusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {edit.status === 'absent_excused' && (
                      <input
                        type="text"
                        disabled={controlsDisabled}
                        value={edit.excuse_notes}
                        onChange={(e) => !controlsDisabled && setEdit(key, 'excuse_notes', e.target.value)}
                        placeholder={isAr ? 'سبب الغياب بعذر...' : 'Reason...'}
                        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 disabled:bg-slate-50 disabled:cursor-default"
                      />
                    )}
                    {rec.payment?.generated && (
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                        {isAr ? `💰 دفعة: ${rec.payment.amount ?? 0} ج.م` : `💰 Payment: ${rec.payment.amount ?? 0} EGP`}
                      </span>
                    )}
                    {isLockedForMe && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">🔒 {isAr ? 'مقفل' : 'Locked'}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditRequestTarget(rec)
                            setEditRequestStatus((rec.status as AttendanceStatus) ?? 'attended')
                            setEditRequestExcuseNotes(rec.excuse_notes || '')
                            setEditRequestReason('')
                            setEditRequestError('')
                          }}
                        >
                          {isAr ? 'طلب تعديل' : 'Request Edit'}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </Modal>
        )
      })()}

      {/* Request Edit modal (feature 007) — employee proposes a change to a locked record */}
      <Modal
        isOpen={!!editRequestTarget}
        onClose={() => setEditRequestTarget(null)}
        title={isAr ? 'طلب تعديل الحضور' : 'Request Attendance Edit'}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditRequestTarget(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              variant="primary"
              isLoading={isSubmittingEditRequest}
              onClick={async () => {
                if (!editRequestTarget) return
                if (!editRequestReason.trim()) {
                  setEditRequestError(isAr ? 'السبب مطلوب' : 'A reason is required')
                  return
                }
                const created = await submitEditRequest({
                  attendance_record_id: (editRequestTarget.attendance_id ?? editRequestTarget.id) as number,
                  requested_status: editRequestStatus,
                  requested_excuse_notes: editRequestStatus === 'absent_excused' ? (editRequestExcuseNotes.trim() || null) : null,
                  reason: editRequestReason.trim()
                })
                if (created) {
                  setEditRequestTarget(null)
                  setSuccessMsg(isAr ? 'تم إرسال طلب التعديل.' : 'Edit request submitted.')
                } else {
                  setEditRequestError(useAttendanceEditRequestsStore.getState().error || (isAr ? 'فشل إرسال الطلب' : 'Failed to submit request'))
                }
              }}
            >
              {isAr ? 'إرسال الطلب' : 'Submit Request'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editRequestError && <Alert variant="danger" onClose={() => setEditRequestError('')}>{editRequestError}</Alert>}
          <p className="text-sm text-slate-600">
            {isAr
              ? `${editRequestTarget?.child_name} — الحالة الحالية: ${editRequestTarget ? statusLabel(editRequestTarget.status) : ''}`
              : `${editRequestTarget?.child_name} — current status: ${editRequestTarget ? statusLabel(editRequestTarget.status) : ''}`}
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500">{isAr ? 'الحالة المطلوبة' : 'Requested status'}</label>
            <div className="flex gap-1 flex-wrap">
              {(['attended', 'absent_excused', 'absent_unexcused', 'deleted'] as AttendanceStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setEditRequestStatus(status)}
                  className={[
                    'px-2 py-1 rounded text-xs font-medium border transition-all',
                    editRequestStatus === status
                      ? (status === 'deleted' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-primary/10 border-primary text-primary')
                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
                  ].join(' ')}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </div>
          {editRequestStatus === 'absent_excused' && (
            <Input
              label={isAr ? 'سبب الغياب بعذر' : 'Excuse reason'}
              value={editRequestExcuseNotes}
              onChange={(e) => setEditRequestExcuseNotes(e.target.value)}
            />
          )}
          <Input
            label={isAr ? 'سبب التعديل' : 'Reason for change'}
            value={editRequestReason}
            onChange={(e) => setEditRequestReason(e.target.value)}
            required
          />
        </div>
      </Modal>
    </div>
  )
}
