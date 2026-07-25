import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAttendanceEditRequestsStore } from '../../store/useAttendanceEditRequestsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import type { AttendanceEditRequest, EditRequestStatus, AttendanceAuditLogEntry } from '../../types/index.js'

const STATUS_TABS: EditRequestStatus[] = ['pending', 'approved', 'rejected']

const statusLabel = (s: string, isAr: boolean) => {
  if (s === 'attended') return isAr ? 'حاضر' : 'Attended'
  if (s === 'absent_excused') return isAr ? 'غائب بعذر' : 'Excused'
  if (s === 'absent_unexcused') return isAr ? 'غائب' : 'Absent'
  if (s === 'deleted') return isAr ? 'حذف السجل' : 'Delete Record'
  return s
}

export default function EditRequestsInbox() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { requests, isLoading, error, fetchRequests, decide, clearError } = useAttendanceEditRequestsStore()
  const [tab, setTab] = useState<EditRequestStatus>('pending')
  const [decisionTarget, setDecisionTarget] = useState<{ request: AttendanceEditRequest; decision: 'approve' | 'reject' } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [auditRecordId, setAuditRecordId] = useState<number | null>(null)
  const [auditLog, setAuditLog] = useState<AttendanceAuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => { fetchRequests({ status: tab }) }, [tab])

  const openAuditLog = async (attendanceRecordId: number) => {
    setAuditRecordId(attendanceRecordId)
    setAuditLoading(true)
    try {
      const rows = await window.api.attendance.getAuditLog(attendanceRecordId)
      setAuditLog(rows)
    } finally {
      setAuditLoading(false)
    }
  }

  const handleDecide = async () => {
    if (!decisionTarget) return
    const ok = await decide(decisionTarget.request.id, decisionTarget.decision, decisionNotes || undefined)
    if (ok) {
      setSuccessMsg(decisionTarget.decision === 'approve'
        ? (isAr ? 'تمت الموافقة على الطلب.' : 'Request approved.')
        : (isAr ? 'تم رفض الطلب.' : 'Request rejected.'))
      setDecisionTarget(null)
      setDecisionNotes('')
      fetchRequests({ status: tab })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'طلبات تعديل الحضور' : 'Attendance Edit Requests'}</h1>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert variant="danger" onClose={clearError}>{error}</Alert>}

      <div className="flex gap-1 border-b border-slate-200">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === s ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'
            ].join(' ')}
          >
            {s === 'pending' ? (isAr ? 'قيد الانتظار' : 'Pending') : s === 'approved' ? (isAr ? 'موافق عليها' : 'Approved') : (isAr ? 'مرفوضة' : 'Rejected')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-400">{isAr ? 'لا توجد طلبات.' : 'No requests.'}</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div key={req.id} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-800">
                  {req.child_name || `#${req.child_id}`} — {req.attendance_date}
                </p>
                <p className="text-slate-500">
                  {statusLabel(req.original_status, isAr)} → {statusLabel(req.requested_status, isAr)}
                </p>
                <p className="text-slate-400 text-xs">{isAr ? 'السبب:' : 'Reason:'} {req.reason}</p>
                {req.decision_notes && (
                  <p className="text-slate-400 text-xs">{isAr ? 'ملاحظة القرار:' : 'Decision note:'} {req.decision_notes}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => openAuditLog(req.attendance_record_id)}>
                  {isAr ? 'سجل التغييرات' : 'Audit Log'}
                </Button>
                {req.status === 'pending' && (
                  <>
                    <Button variant="primary" size="sm" onClick={() => setDecisionTarget({ request: req, decision: 'approve' })}>
                      {isAr ? 'موافقة' : 'Approve'}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDecisionTarget({ request: req, decision: 'reject' })}>
                      {isAr ? 'رفض' : 'Reject'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision confirm modal */}
      <Modal
        isOpen={!!decisionTarget}
        onClose={() => setDecisionTarget(null)}
        title={decisionTarget?.decision === 'approve' ? (isAr ? 'الموافقة على الطلب' : 'Approve Request') : (isAr ? 'رفض الطلب' : 'Reject Request')}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDecisionTarget(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant={decisionTarget?.decision === 'approve' ? 'primary' : 'danger'} onClick={handleDecide} isLoading={isLoading}>
              {decisionTarget?.decision === 'approve' ? (isAr ? 'تأكيد الموافقة' : 'Confirm Approve') : (isAr ? 'تأكيد الرفض' : 'Confirm Reject')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={isAr ? 'ملاحظة (اختياري)' : 'Decision note (optional)'}
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
          />
        </div>
      </Modal>

      {/* Audit log viewer */}
      <Modal isOpen={auditRecordId != null} onClose={() => setAuditRecordId(null)} title={isAr ? 'سجل تغييرات الحضور' : 'Attendance Audit Log'}>
        {auditLoading ? (
          <p className="text-sm text-slate-400">{isAr ? 'جارٍ التحميل...' : 'Loading...'}</p>
        ) : auditLog.length === 0 ? (
          <p className="text-sm text-slate-400">{isAr ? 'لا يوجد سجل تغييرات.' : 'No history yet.'}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {auditLog.map((entry) => (
              <li key={entry.id} className="border border-slate-100 rounded-lg p-2">
                <p>{statusLabel(entry.old_status || '', isAr)} → {statusLabel(entry.new_status, isAr)}</p>
                <p className="text-xs text-slate-400">{entry.changed_at}</p>
                {entry.reason && <p className="text-xs text-slate-400">{isAr ? 'السبب:' : 'Reason:'} {entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
