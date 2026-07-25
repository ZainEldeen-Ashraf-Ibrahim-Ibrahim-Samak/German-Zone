import mongoose, { Schema, Model } from 'mongoose'
import { promises as dnsPromises } from 'dns'

/**
 * mongoSync.ts — Mongoose models for cloud sync collections.
 *
 * Each model mirrors the SQLite table structure.
 * The _id in MongoDB is the SQLite id (integer) to enable deterministic conflict resolution.
 *
 * Fields synced to MongoDB match the SQLite columns plus an updated_at timestamp.
 */

// ── Connection Management ─────────────────────────────────────────────────────

let isConnected = false
let connectionError: string | null = null

async function convertSrvToStandardUri(uri: string): Promise<string> {
  if (!uri.startsWith('mongodb+srv://')) return uri;

  try {
    const { Resolver } = dnsPromises;
    const resolver = new Resolver();
    resolver.setServers(['8.8.8.8', '8.8.4.4']); // Use Google DNS to bypass local hotspots

    const url = new URL(uri);
    const hostname = url.hostname;

    // Fetch SRV records
    const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
    if (!srvRecords || srvRecords.length === 0) throw new Error('No SRV records found');

    // Fetch TXT records
    const txtRecords = await resolver.resolveTxt(hostname);
    const txtOptions = txtRecords.flat().join('&');

    // Construct hosts string
    const hosts = srvRecords.map(r => `${r.name}:${r.port}`).join(',');

    // Extract credentials
    const credentials = url.username ? `${url.username}:${url.password}@` : '';
    
    // Combine search params
    const searchParams = new URLSearchParams(url.search);
    const txtParams = new URLSearchParams(txtOptions);
    for (const [key, value] of txtParams) {
      if (!searchParams.has(key)) searchParams.set(key, value);
    }
    
    searchParams.set('ssl', 'true');

    return `mongodb://${credentials}${hosts}/${url.pathname.replace(/^\//, '')}?${searchParams.toString()}`;
  } catch (error) {
    console.error('Error converting SRV to standard URI, falling back to original:', error);
    return uri;
  }
}

/**
 * The MongoDB driver's server-selection timeout always says "check your IP whitelist" —
 * that text is hardcoded regardless of the actual cause. Dig into the per-server errors the
 * driver actually collected (auth failure, TLS handshake failure, DNS/connection refused, etc.)
 * so a failed connect() tells the user something they can actually act on.
 */
function describeConnectFailure(err: any): string {
  const genericMsg: string = err?.message || 'Failed to connect to MongoDB'

  // MongoServerSelectionError carries `.reason`, a TopologyDescription with a `servers` Map of
  // address -> ServerDescription, each with the real per-node error the generic message hides.
  const servers: Map<string, any> | undefined = err?.reason?.servers
  if (servers && servers.size > 0) {
    const perServer = [...servers.entries()]
      .map(([address, desc]: [string, any]) => {
        const nodeErr = desc?.error
        if (!nodeErr) return null
        const nodeMsg: string = nodeErr.message || String(nodeErr)
        return `${address}: ${nodeMsg}`
      })
      .filter(Boolean) as string[]

    if (perServer.length > 0) {
      const details = perServer.join(' | ')
      // Classify the most common real causes so the message is actionable, not just raw.
      if (/bad auth|authentication failed/i.test(details)) {
        return `MongoDB authentication failed — check the username/password in your connection string (and that any special characters like @ : / % are percent-encoded). Details: ${details}`
      }
      if (/certificate|ssl|tls/i.test(details)) {
        return `MongoDB TLS/SSL handshake failed — often a system clock that's wrong, or a corporate proxy/antivirus intercepting HTTPS/TLS traffic. Details: ${details}`
      }
      if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(details)) {
        return `Could not resolve the MongoDB Atlas hostname (DNS failure) — check your internet connection or try a different DNS/network. Details: ${details}`
      }
      if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(details)) {
        return `Could not reach MongoDB Atlas over the network — this really is a connectivity/firewall issue (a corporate network or antivirus may be blocking outbound port 27017), separate from the IP whitelist. Details: ${details}`
      }
      return `${genericMsg} — per-server details: ${details}`
    }
  }

  return genericMsg
}

export async function connectMongo(uri: string): Promise<void> {
  if (isConnected) return

  try {
    const finalUri = await convertSrvToStandardUri(uri);
    await mongoose.connect(finalUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    })
    isConnected = true
    connectionError = null

    mongoose.connection.on('disconnected', () => {
      isConnected = false
    })
  } catch (err: any) {
    isConnected = false
    connectionError = describeConnectFailure(err)
    console.error('[mongoSync] connect failed — raw error:', err)
    throw new Error(connectionError || 'Failed to connect to MongoDB')
  }
}

export async function disconnectMongo(): Promise<void> {
  if (!isConnected) return
  await mongoose.disconnect()
  isConnected = false
}

export function getConnectionStatus(): { connected: boolean; error: string | null } {
  return { connected: isConnected, error: connectionError }
}

// ── Shared schema options ─────────────────────────────────────────────────────

const sharedOptions: mongoose.SchemaOptions = { versionKey: false, _id: false }

// ── Children ─────────────────────────────────────────────────────────────────

const childSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  guardian: String,
  guardian_phone: String,
  child_phone: String,
  national_id: String,
  service: String,
  unit: String,
  price: Number,
  reg_date: String,
  notes: String,
  is_active: Number,
  // Feature 004 — additive enrollment fields
  photo_url: String,
  photo_public_id: String,
  teacher_id: Number,
  lesson_days: String,
  sessions_baseline: Number,
  extra_lessons: Number,
  session_price: Number,
  monthly_fee: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ChildModel: Model<any> = mongoose.models['sync_children'] ||
  mongoose.model('sync_children', childSchema)

// ── Payments ─────────────────────────────────────────────────────────────────

const paymentSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  child_id: Number,
  service_id: Number,
  service: String,
  unit: String,
  quantity: Number,
  price: Number,
  prorated_calculated: Number,
  month: String,
  year: Number,
  total: Number,
  paid: Number,
  balance: Number,
  status: String,
  notes: String,
  payment_method_id: Number,
  payment_method_name: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const PaymentModel: Model<any> = mongoose.models['sync_payments'] ||
  mongoose.model('sync_payments', paymentSchema)

// ── Child Services ─────────────────────────────────────────────────────────────

const childServiceSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  child_id: Number,
  service: String,
  unit: String,
  price: Number,
  teacher_session_rate: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ChildServiceModel: Model<any> = mongoose.models['sync_child_services'] ||
  mongoose.model('sync_child_services', childServiceSchema)

// ── Users ────────────────────────────────────────────────────────────────────

const userSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  username: String,
  password: String, // Hashed
  role: String,
  name: String,
  is_active: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const UserModel: Model<any> = mongoose.models['sync_users'] ||
  mongoose.model('sync_users', userSchema)

// ── Settings ──────────────────────────────────────────────────────────────────

const settingSchema = new Schema({
  // Using id because sync logic expects an id field. 
  // Wait, settings table has `key` as PRIMARY KEY. 
  // The task says "sync_settings (key identity)". We'll use `id` as the key.
  id: { type: String, required: true, unique: true }, // 'id' maps to SQLite 'key'
  key: String,
  value: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const SettingModel: Model<any> = mongoose.models['sync_settings'] ||
  mongoose.model('sync_settings', settingSchema)

// ── Tombstones ────────────────────────────────────────────────────────────────

const tombstoneSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  entity: String,
  record_id: Number,
  created_at: String,
  synced: Number
}, sharedOptions)

export const TombstoneModel: Model<any> = mongoose.models['sync_tombstones'] ||
  mongoose.model('sync_tombstones', tombstoneSchema)

// ── Employees ─────────────────────────────────────────────────────────────────

const employeeSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  role: String,
  role_id: Number,
  salary_type_override_id: Number,
  base_salary: Number,
  housing: Number,
  transport: Number,
  net_salary: Number,
  is_active: Number,
  created_at: String,
  updated_at: String,
  synced: Number,
  teacher_session_rate: Number
}, sharedOptions)

export const EmployeeModel: Model<any> = mongoose.models['sync_employees'] ||
  mongoose.model('sync_employees', employeeSchema)

// ── Salary Payments ───────────────────────────────────────────────────────────

const salaryPaymentSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  employee_id: Number,
  month: String,
  year: Number,
  bonus: Number,
  deductions: Number,
  actual_paid: Number,
  paid_date: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const SalaryPaymentModel: Model<any> = mongoose.models['sync_salary_payments'] ||
  mongoose.model('sync_salary_payments', salaryPaymentSchema)

// ── Expenses ──────────────────────────────────────────────────────────────────

const expenseSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  item: String,
  month: String,
  year: Number,
  amount: Number,
  category: String,
  notes: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ExpenseModel: Model<any> = mongoose.models['sync_expenses'] ||
  mongoose.model('sync_expenses', expenseSchema)

// ── Imported Snapshots (dashboard / statement raw rows) ────────────────────────

const importedSnapshotSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  sheet: String,
  row_index: Number,
  data_json: String,
  imported_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ImportedSnapshotModel: Model<any> = mongoose.models['sync_imported_snapshots'] ||
  mongoose.model('sync_imported_snapshots', importedSnapshotSchema)

// ── Salary Types ─────────────────────────────────────────────────────────────

const salaryTypeSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  mode: String,
  monthly_rate: Number,
  session_rate: Number,
  session_pct: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const SalaryTypeModel: Model<any> = mongoose.models['sync_salary_types'] ||
  mongoose.model('sync_salary_types', salaryTypeSchema)

// ── Employee Roles ────────────────────────────────────────────────────────────

const employeeRoleSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  salary_type_id: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const EmployeeRoleModel: Model<any> = mongoose.models['sync_employee_roles'] ||
  mongoose.model('sync_employee_roles', employeeRoleSchema)

// ── Service Definitions ───────────────────────────────────────────────────────

const serviceDefinitionSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  is_custom: Number,
  price_monthly: Number,
  price_daily: Number,
  price_hourly: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ServiceDefinitionModel: Model<any> = mongoose.models['sync_service_definitions'] ||
  mongoose.model('sync_service_definitions', serviceDefinitionSchema)

// ── Scheduled Sessions ────────────────────────────────────────────────────────

const scheduledSessionSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  session_date: String,
  service_id: Number,
  group_name: String,
  notes: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ScheduledSessionModel: Model<any> = mongoose.models['sync_scheduled_sessions'] ||
  mongoose.model('sync_scheduled_sessions', scheduledSessionSchema)

// ── Session Teachers ──────────────────────────────────────────────────────────

const sessionTeacherSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  session_id: Number,
  employee_id: Number,
  synced: Number
}, sharedOptions)

export const SessionTeacherModel: Model<any> = mongoose.models['sync_session_teachers'] ||
  mongoose.model('sync_session_teachers', sessionTeacherSchema)

// ── Attendance Records ────────────────────────────────────────────────────────

const attendanceRecordSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  session_id: Number,
  child_id: Number,
  status: String,
  excuse_notes: String,
  recorded_by: Number,
  recorded_at: String,
  updated_at: String,
  synced: Number,
  attended_teacher_id: Number,
  teacher_status: String
}, sharedOptions)

export const AttendanceRecordModel: Model<any> = mongoose.models['sync_attendance_records'] ||
  mongoose.model('sync_attendance_records', attendanceRecordSchema)

// ── Attendance Conflicts ──────────────────────────────────────────────────────

const attendanceConflictSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  attendance_record_id: Number,
  overwritten_status: String,
  overwritten_by: String,
  overwritten_at: String,
  winning_status: String,
  winning_by: String,
  winning_at: String,
  reviewed: Number,
  created_at: String
}, sharedOptions)

export const AttendanceConflictModel: Model<any> = mongoose.models['sync_attendance_conflicts'] ||
  mongoose.model('sync_attendance_conflicts', attendanceConflictSchema)

// ── Payment Methods ───────────────────────────────────────────────────────────

const paymentMethodSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  is_active: Number,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const PaymentMethodModel: Model<any> = mongoose.models['sync_payment_methods'] ||
  mongoose.model('sync_payment_methods', paymentMethodSchema)

// ── Employee Deductions ───────────────────────────────────────────────────────

const employeeDeductionSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  employee_id: Number,
  month: String,
  year: Number,
  reason: String,
  amount: Number,
  created_at: String,
  synced: Number
}, sharedOptions)

export const EmployeeDeductionModel: Model<any> = mongoose.models['sync_employee_deductions'] ||
  mongoose.model('sync_employee_deductions', employeeDeductionSchema)

// ── Payment Transactions (partial payments / installments) ─────────────────────

const paymentTransactionSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  payment_id: Number,
  amount: Number,
  payment_method_id: Number,
  payment_method_name: String,
  paid_date: String,
  notes: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const PaymentTransactionModel: Model<any> = mongoose.models['sync_payment_transactions'] ||
  mongoose.model('sync_payment_transactions', paymentTransactionSchema)

// ── Service Teachers ──────────────────────────────────────────────────────────

const serviceTeacherSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  service_id: Number,
  employee_id: Number,
  created_at: String,
  synced: Number
}, sharedOptions)

export const ServiceTeacherModel: Model<any> = mongoose.models['sync_service_teachers'] ||
  mongoose.model('sync_service_teachers', serviceTeacherSchema)

// ── Teacher Payments ──────────────────────────────────────────────────────────

const teacherPaymentSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  teacher_id: Number,
  child_id: Number,
  attendance_record_id: Number,
  attendance_date: String,
  session_cost: Number,
  status: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const TeacherPaymentModel: Model<any> = mongoose.models['sync_teacher_payments'] ||
  mongoose.model('sync_teacher_payments', teacherPaymentSchema)

// ── Attendance Edit Requests ───────────────────────────────────────────────────

const attendanceEditRequestSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  attendance_record_id: Number,
  child_id: Number,
  teacher_id: Number,
  attendance_date: String,
  original_status: String,
  original_excuse_notes: String,
  original_teacher_status: String,
  requested_status: String,
  requested_excuse_notes: String,
  requested_teacher_status: String,
  reason: String,
  requested_by: Number,
  requested_at: String,
  status: String,
  decided_by: Number,
  decided_at: String,
  decision_notes: String,
  synced: Number
}, sharedOptions)

export const AttendanceEditRequestModel: Model<any> = mongoose.models['sync_attendance_edit_requests'] ||
  mongoose.model('sync_attendance_edit_requests', attendanceEditRequestSchema)

// ── Attendance Audit Log ───────────────────────────────────────────────────────

const attendanceAuditLogSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  attendance_record_id: Number,
  edit_request_id: Number,
  old_status: String,
  old_excuse_notes: String,
  old_teacher_status: String,
  new_status: String,
  new_excuse_notes: String,
  new_teacher_status: String,
  changed_by: Number,
  approved_by: Number,
  reason: String,
  changed_at: String,
  synced: Number
}, sharedOptions)

export const AttendanceAuditLogModel: Model<any> = mongoose.models['sync_attendance_audit_log'] ||
  mongoose.model('sync_attendance_audit_log', attendanceAuditLogSchema)

// ── Notifications ───────────────────────────────────────────────────────────────

const notificationSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  user_id: Number,
  type: String,
  related_id: Number,
  message_ar: String,
  message_en: String,
  read_at: String,
  created_at: String,
  synced: Number
}, sharedOptions)

export const NotificationModel: Model<any> = mongoose.models['sync_notifications'] ||
  mongoose.model('sync_notifications', notificationSchema)

// ── Child Illness Cases (feature 009) ───────────────────────────────────────────

const childIllnessCaseSchema = new Schema({
  id: { type: Number, required: true, unique: true },
  child_id: Number,
  status: String,
  description: String,
  opened_at: String,
  resolved_at: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ChildIllnessCaseModel: Model<any> = mongoose.models['sync_child_illness_cases'] ||
  mongoose.model('sync_child_illness_cases', childIllnessCaseSchema)

// ── Child Activities / Diary (feature 009, media hosted on Cloudinary) ─────────

const childActivitySchema = new Schema({
  id: { type: Number, required: true, unique: true },
  child_id: Number,
  activity_date: String,
  note: String,
  media_url: String,
  media_type: String,
  media_status: String,
  created_at: String,
  updated_at: String,
  synced: Number
}, sharedOptions)

export const ChildActivityModel: Model<any> = mongoose.models['sync_child_activities'] ||
  mongoose.model('sync_child_activities', childActivitySchema)

// ── Entity registry ───────────────────────────────────────────────────────────

export const SYNC_ENTITIES: {
  name: string
  model: Model<any>
  table: string
}[] = [
  { name: 'children', model: ChildModel, table: 'children' },
  { name: 'child_services', model: ChildServiceModel, table: 'child_services' },
  { name: 'payments', model: PaymentModel, table: 'payments' },
  { name: 'employees', model: EmployeeModel, table: 'employees' },
  { name: 'salary_payments', model: SalaryPaymentModel, table: 'salary_payments' },
  { name: 'expenses', model: ExpenseModel, table: 'expenses' },
  { name: 'users', model: UserModel, table: 'users' },
  { name: 'settings', model: SettingModel, table: 'settings' },
  { name: 'imported_snapshots', model: ImportedSnapshotModel, table: 'imported_snapshots' },
  { name: 'tombstones', model: TombstoneModel, table: 'tombstones' },
  { name: 'salary_types', model: SalaryTypeModel, table: 'salary_types' },
  { name: 'employee_roles', model: EmployeeRoleModel, table: 'employee_roles' },
  { name: 'service_definitions', model: ServiceDefinitionModel, table: 'service_definitions' },
  { name: 'scheduled_sessions', model: ScheduledSessionModel, table: 'scheduled_sessions' },
  { name: 'session_teachers', model: SessionTeacherModel, table: 'session_teachers' },
  { name: 'attendance_records', model: AttendanceRecordModel, table: 'attendance_records' },
  { name: 'attendance_conflicts', model: AttendanceConflictModel, table: 'attendance_conflicts' },
  { name: 'payment_methods', model: PaymentMethodModel, table: 'payment_methods' },
  { name: 'employee_deductions', model: EmployeeDeductionModel, table: 'employee_deductions' },
  { name: 'payment_transactions', model: PaymentTransactionModel, table: 'payment_transactions' },
  { name: 'service_teachers', model: ServiceTeacherModel, table: 'service_teachers' },
  { name: 'teacher_payments', model: TeacherPaymentModel, table: 'teacher_payments' },
  { name: 'attendance_edit_requests', model: AttendanceEditRequestModel, table: 'attendance_edit_requests' },
  { name: 'attendance_audit_log', model: AttendanceAuditLogModel, table: 'attendance_audit_log' },
  { name: 'notifications', model: NotificationModel, table: 'notifications' },
  { name: 'child_illness_cases', model: ChildIllnessCaseModel, table: 'child_illness_cases' },
  { name: 'child_activities', model: ChildActivityModel, table: 'child_activities' },
]
