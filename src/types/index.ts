export type UserRole = 'admin' | 'employee'

export interface User {
  id: number
  username: string
  role: UserRole
  name?: string | null
  is_active: number // 0 or 1
  created_at?: string

  /** How this account is attached to branches (migration 050). */
  branch_mode?: BranchMode
  primary_branch_id?: number | null
}

/**
 * 'branch' — works out of one physical branch; 'online' — online students only;
 * 'mixed' — covers a physical branch AND online (or several branches at once).
 */
export type BranchMode = 'branch' | 'online' | 'mixed'

export interface Branch {
  id: number
  name: string
  code?: string | null
  city?: string | null
  address?: string | null
  phone?: string | null
  kind: 'physical' | 'online'
  manager_user_id?: number | null
  is_active: number
  created_at: string
  updated_at: string
  synced: number

  // Join fields from branches:list
  manager_name?: string | null
  manager_username?: string | null
  student_count?: number
  employee_count?: number
  hall_count?: number
}

export interface UserBranchAssignment {
  user_id: number
  mode: BranchMode
  primary_branch_id: number | null
  branches: { id: number; name: string; kind: 'physical' | 'online' }[]
}

/** One opening interval of a hall on one weekday. Times are 'HH:MM' (24h); '24:00' = midnight. */
export interface HallTimeSlot {
  id?: number
  hall_id?: number
  day_of_week: number // 0 = Sunday … 6 = Saturday
  start_time: string
  end_time: string
  notes?: string | null
  created_at?: string
  updated_at?: string
  synced?: number
}

export interface Hall {
  id: number
  name: string
  branch_id?: number | null
  capacity?: number | null
  notes?: string | null
  is_active: number
  created_at: string
  updated_at: string
  synced: number

  /** The hall's weekly timetable — a hall may open more than once on the same day. */
  slots?: HallTimeSlot[]
  total_hours?: number
  branch_name?: string | null
  branch_kind?: 'physical' | 'online' | null
}

/**
 * One agreed payment milestone of a student's instalment plan. The plan splits the total fee
 * across N dated instalments, so each month only carries the instalment falling due in it.
 */
export interface StudentInstallment {
  id: number
  student_id: number
  service_id?: number | null
  seq: number
  due_date: string
  month: string // Arabic month name
  year: number
  amount: number
  paid: number
  balance: number
  status: 'unpaid' | 'partial' | 'paid'
  paid_date?: string | null
  payment_method_id?: number | null
  payment_method_name?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  synced: number

  // Derived / join fields
  is_overdue?: boolean
  student_name?: string
  student_guardian?: string
  student_guardian_phone?: string
  student_is_active?: number
  branch_id?: number | null
}

/** One month's bucket of the instalment calendar — what is due in that month, and nothing else. */
export interface InstallmentMonth {
  month: string
  month_index: number
  year: number
  count: number
  due: number
  collected: number
  outstanding: number
}

/** German Zone course levels. Admins can add further services in Settings → Services,
 *  so this union names the built-in ones rather than constraining the whole domain. */
export type ServiceType = 'A1' | 'A2' | 'B1' | 'B2' | 'جلسات محادثة'

/** Billing unit. Note 'جلسة' here is the per-session *unit*, unrelated to the
 *  'جلسات محادثة' speaking-sessions *service*. */
export type UnitType = 'شهر' | 'يوم' | 'ساعة' | 'جلسة'

export interface ServiceEnrollment {
  id: number
  student_id: number
  service: ServiceType
  unit: UnitType
  price: number
  teacher_id?: number | null
  lesson_days?: number[] | string | null
  extra_lessons?: number
  session_price?: number | null
  // Per-student override of the assigned teacher's per-session pay rate — "salary type per
  // student". Falls back to the teacher's own rate, then their salary type's session rate.
  teacher_session_rate?: number | null
  created_at?: string
  updated_at?: string
  synced?: number
}

export interface Student {
  id: number
  name: string
  guardian: string
  guardian_phone: string
  student_phone?: string | null
  national_id?: string | null
  service: ServiceType
  unit: UnitType
  price: number
  services?: ServiceEnrollment[]
  reg_date: string
  notes?: string | null
  is_active: number // 0 or 1
  created_at: string
  updated_at: string
  synced: number // 0 or 1

  // Feature 004 — student enrollment enhancements (all optional / additive)
  photo_url?: string | null
  photo_public_id?: string | null
  teacher_id?: number | null
  lesson_days?: number[] | string | null // number[] in the UI; JSON string at rest
  sessions_baseline?: number // default 8
  extra_lessons?: number // default 0
  session_price?: number | null
  monthly_fee?: number | null

  /** Instalment plan agreed at enrollment (migration 049) + branch (migration 050). */
  installments_count?: number | null
  installment_total?: number | null
  installment_start_date?: string | null
  branch_id?: number | null
}

/** A teacher option, projected from the employees table (feature 004). */
export interface Teacher {
  id: number
  name: string
  role: string
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

export interface Payment {
  id: number
  student_id: number
  service_id?: number
  month: string // Arabic month name
  year: number
  service: string
  unit: string
  quantity: number
  price: number
  total: number
  paid: number
  balance: number
  status: PaymentStatus
  notes?: string | null
  created_at: string
  updated_at: string
  synced: number // 0 or 1

  // Optional join field for UI
  student_name?: string
  // Full scheduled amount for the month regardless of attendance (vs. `quantity`, which for
  // attendance-driven units only counts days/hours attended or absent-unexcused so far)
  expected_quantity?: number
  expected_total?: number
  // Pro-rating audit (feature 005)
  prorated_calculated?: number | null
  // Payment method (feature 005 extension)
  payment_method_id?: number | null
  payment_method_name?: string | null
  // Number of recorded partial-payment transactions (installments)
  transaction_count?: number
}

// Feature 009: financial "transaction" row shown in the Transactions tab (replaces the removed
// Daily Billing entity) — derived read-time from payments/payment_transactions, not a table.
export interface Transaction {
  id: number
  student_id: number
  student_name: string
  service_name: string
  amount: number
  type: 'charge' | 'payment' | 'refund'
  date: string
}

export interface StudentIllnessCase {
  id: number
  student_id: number
  status: 'open' | 'resolved'
  description?: string | null
  opened_at: string
  resolved_at?: string | null
  created_at: string
  updated_at: string
  synced: number
}

export interface StudentActivity {
  id: number
  student_id: number
  activity_date: string
  note?: string | null
  media_url?: string | null
  media_type?: 'photo' | 'video' | 'file' | null
  media_status?: 'uploaded' | 'failed' | null
  created_at: string
  updated_at: string
  synced: number
}

export interface TimetableSlot {
  service_row_id: number
  service: string
  day: number // 0=Sun..6=Sat
  teacher_id: number | null
  teacher_name: string | null
}

export interface CalendarEntry {
  date: string
  user_id: number
  user_name: string
  user_type: 'student' | 'teacher' | 'session'
  service_id: number | null
  service_name: string | null
  teacher_id: number | null
  teacher_name: string | null
  session_id: number | null
}

export interface PaymentTransaction {
  id: number
  payment_id: number
  amount: number
  payment_method_id?: number | null
  payment_method_name?: string | null
  paid_date?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  synced: number
}


export interface EmployeeRole {
  id: number
  name: string
  salary_type_id: number | null
  created_at: string
  updated_at: string
  synced: number

  // Join fields from roles:list — shown in the Job Types manager
  salary_type_name?: string | null
  salary_type_mode?: SalaryMode | null
  employee_count?: number
  active_employee_count?: number
}

export type SalaryMode = 'fixed_monthly' | 'per_session_fixed' | 'per_session_pct' | 'hybrid' | 'per_student_session' | 'hourly'

export interface SalaryType {
  id: number
  name: string
  mode: SalaryMode
  monthly_rate: number | null
  session_rate: number | null
  session_pct: number | null
  /** Unit price of one hour — used by the `hourly` mode together with the session timer. */
  hourly_rate: number | null
  created_at: string
  updated_at: string
  synced: number
}

/**
 * One clocked work stint behind hourly pay. `running` while the timer is going; stopping it
 * freezes `duration_minutes`, snapshots the `hourly_rate` then in force and stores the `amount`
 * that stint earned. Only `completed` rows count towards salary.
 */
export interface SessionTimeLog {
  id: number
  session_id: number | null
  employee_id: number
  work_date: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  hourly_rate: number | null
  amount: number | null
  status: 'running' | 'completed' | 'void'
  notes: string | null
  created_at: string
  updated_at: string
  synced: number

  // Join fields
  employee_name?: string
  session_date?: string | null
  session_group?: string | null
}

export interface ServiceDefinition {
  id: number
  name: string
  is_custom: number // 0 = built-in, 1 = custom
  price_monthly: number | null
  price_daily: number | null
  price_hourly: number | null
  created_at: string
  updated_at: string
  synced: number
}

export interface ScheduledSession {
  id: number
  session_date: string
  service_id: number | null
  service_name?: string | null
  group_name: string | null
  notes: string | null
  teachers?: Teacher[]
  attendance_count?: number
  created_at: string
  updated_at: string
  synced: number
}

export interface SessionTeacher {
  id: number
  session_id: number
  employee_id: number
  synced: number
}

export type AttendanceStatus = 'attended' | 'absent_excused' | 'absent_unexcused' | 'deleted'

export interface AttendanceRecord {
  id: number
  attendance_id?: number | null
  locked?: boolean
  session_id: number
  student_id: number
  student_name?: string
  student_photo_url?: string | null
  teacher_id?: number | null
  teacher_name?: string | null
  teacher_session_rate?: number | null
  status: AttendanceStatus
  excuse_notes: string | null
  recorded_by: number | null
  recorded_at: string
  updated_at: string
  synced: number

  // Feature 006 — attendance-based teacher payments
  attended_teacher_id?: number | null
  teacher_status?: 'present' | 'absent' | null
  payment?: { generated: boolean; amount: number | null; status: TeacherPaymentStatus | null }
}

export type EditRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AttendanceEditRequest {
  id: number
  attendance_record_id: number
  student_id: number
  student_name?: string
  teacher_id: number | null
  teacher_name?: string | null
  attendance_date: string
  original_status: AttendanceStatus
  original_excuse_notes: string | null
  original_teacher_status: 'present' | 'absent' | null
  requested_status: AttendanceStatus
  requested_excuse_notes: string | null
  requested_teacher_status: 'present' | 'absent' | null
  reason: string
  requested_by: number
  requested_by_name?: string | null
  requested_at: string
  status: EditRequestStatus
  decided_by: number | null
  decided_by_name?: string | null
  decided_at: string | null
  decision_notes: string | null
  synced?: number
}

export interface AttendanceAuditLogEntry {
  id: number
  attendance_record_id: number
  edit_request_id: number | null
  old_status: AttendanceStatus | null
  old_excuse_notes: string | null
  old_teacher_status: 'present' | 'absent' | null
  new_status: AttendanceStatus
  new_excuse_notes: string | null
  new_teacher_status: 'present' | 'absent' | null
  changed_by: number
  changed_by_name?: string | null
  approved_by: number | null
  approved_by_name?: string | null
  reason: string | null
  changed_at: string
}

export type NotificationType = 'edit_request_submitted' | 'edit_request_approved' | 'edit_request_rejected'

export interface Notification {
  id: number
  user_id: number
  type: NotificationType
  related_id: number | null
  message_ar: string
  message_en: string
  read_at: string | null
  created_at: string
}

export interface AttendanceConflict {
  id: number
  attendance_record_id: number
  overwritten_status: AttendanceStatus
  overwritten_by: string | null
  overwritten_at: string
  winning_status: AttendanceStatus
  winning_by: string | null
  winning_at: string
  reviewed: number
  created_at: string
}

export interface AttendanceSummary {
  total_sessions: number
  payable_sessions: number
  excused_absences: number
  unexcused_absences: number
  breakdown: { status: string; cnt: number }[]
}

export interface Employee {
  id: number
  name: string
  role: string
  role_id?: number | null
  role_name?: string | null
  salary_type_override_id?: number | null
  base_salary: number
  housing: number
  transport: number
  net_salary: number
  is_active: number // 0 or 1
  created_at: string
  updated_at?: string
  synced: number // 0 or 1

  // Feature 006 — attendance-based teacher payments
  teacher_session_rate?: number | null

  /** Unit price of one hour for this employee — overrides the salary type's hourly rate. */
  hourly_rate?: number | null

  /** Branch this employee works out of (migration 050). */
  branch_id?: number | null
}

export interface ServiceTeacher {
  id: number
  service_id: number
  employee_id: number
  created_at: string
  synced: number
}

export type TeacherPaymentStatus = 'pending' | 'paid' | 'void'

export interface TeacherPayment {
  id: number
  teacher_id: number
  teacher_name?: string
  student_id: number
  student_name?: string
  attendance_record_id: number
  attendance_date: string
  session_cost: number
  status: TeacherPaymentStatus
  created_at: string
  updated_at: string
  synced: number
}

export interface PayrollReportRow {
  teacher_id: number
  teacher_name: string
  sessions_paid: number
  session_cost: number
  total_salary: number
}

export interface AttendanceHistoryRow {
  attendance_date: string
  teacher_id: number | null
  teacher_name: string | null
  teacher_status: 'present' | 'absent' | null
  student_status: AttendanceStatus
  payment_generated: boolean
  payment_status: TeacherPaymentStatus | null
  session_cost: number | null
}

export interface SalaryPayment {
  id: number
  employee_id: number
  month: string // Arabic month name
  year: number
  bonus: number
  deductions: number
  actual_paid: number
  paid_date?: string | null
  notes?: string | null
  updated_at?: string
  synced: number // 0 or 1

  // Optional join fields for UI
  employee_name?: string
  employee_role?: string
  net_salary?: number

  /** Breakdown of net_salary for this period: work earnings + housing/transport allowances. */
  earnings?: number
  allowances?: number
  payable_sessions?: number
  total_sessions?: number
  /** Hours clocked on the session timer this period (hourly salary mode). */
  hours_worked?: number
  hourly_earnings?: number
  salary_type_name?: string | null
  salary_type_mode?: SalaryMode | null
}

export interface Expense {
  id: number
  item: string
  month: string // Arabic month name
  year: number
  amount: number
  category?: string | null
  notes?: string | null
  created_at: string
  updated_at?: string
  synced: number // 0 or 1
}

export interface Setting {
  key: string
  value: string
}

export type SyncAction = 'push' | 'pull'
export type SyncStatus = 'ok' | 'error'

export interface SyncLog {
  id: number
  action: SyncAction
  table_name: string
  record_id: number
  status: SyncStatus
  error?: string | null
  synced_at: string
}

export interface StudentStatementRow {
  month: string
  year: number
  service: string
  unit: string
  quantity: number
  price: number
  total: number
  paid: number
  balance: number
  status: PaymentStatus
  notes: string
}

export interface StudentStatement {
  student: {
    id: number
    name: string
    guardian: string
    guardian_phone: string
    service: string
    unit: string
    price: number
    reg_date: string
    is_active: number
    photo_url?: string | null
    teacher_name?: string | null
    monthly_fee?: number | null
  }
  rows: StudentStatementRow[]
  summary: {
    activeMonths: number
    totalInvoiced: number
    totalCollected: number
    totalBalance: number
  }
}
