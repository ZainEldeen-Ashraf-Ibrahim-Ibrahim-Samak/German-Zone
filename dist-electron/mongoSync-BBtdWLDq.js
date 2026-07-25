import mongoose, { Schema } from "mongoose";
import { promises } from "dns";
//#region electron/services/mongoSync.ts
/**
* mongoSync.ts — Mongoose models for cloud sync collections.
*
* Each model mirrors the SQLite table structure.
* The _id in MongoDB is the SQLite id (integer) to enable deterministic conflict resolution.
*
* Fields synced to MongoDB match the SQLite columns plus an updated_at timestamp.
*/
var isConnected = false;
var connectionError = null;
async function convertSrvToStandardUri(uri) {
	if (!uri.startsWith("mongodb+srv://")) return uri;
	try {
		const { Resolver } = promises;
		const resolver = new Resolver();
		resolver.setServers(["8.8.8.8", "8.8.4.4"]);
		const url = new URL(uri);
		const hostname = url.hostname;
		const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
		if (!srvRecords || srvRecords.length === 0) throw new Error("No SRV records found");
		const txtOptions = (await resolver.resolveTxt(hostname)).flat().join("&");
		const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
		const credentials = url.username ? `${url.username}:${url.password}@` : "";
		const searchParams = new URLSearchParams(url.search);
		const txtParams = new URLSearchParams(txtOptions);
		for (const [key, value] of txtParams) if (!searchParams.has(key)) searchParams.set(key, value);
		searchParams.set("ssl", "true");
		return `mongodb://${credentials}${hosts}/${url.pathname.replace(/^\//, "")}?${searchParams.toString()}`;
	} catch (error) {
		console.error("Error converting SRV to standard URI, falling back to original:", error);
		return uri;
	}
}
/**
* The MongoDB driver's server-selection timeout always says "check your IP whitelist" —
* that text is hardcoded regardless of the actual cause. Dig into the per-server errors the
* driver actually collected (auth failure, TLS handshake failure, DNS/connection refused, etc.)
* so a failed connect() tells the user something they can actually act on.
*/
function describeConnectFailure(err) {
	const genericMsg = err?.message || "Failed to connect to MongoDB";
	const servers = err?.reason?.servers;
	if (servers && servers.size > 0) {
		const perServer = [...servers.entries()].map(([address, desc]) => {
			const nodeErr = desc?.error;
			if (!nodeErr) return null;
			return `${address}: ${nodeErr.message || String(nodeErr)}`;
		}).filter(Boolean);
		if (perServer.length > 0) {
			const details = perServer.join(" | ");
			if (/bad auth|authentication failed/i.test(details)) return `MongoDB authentication failed — check the username/password in your connection string (and that any special characters like @ : / % are percent-encoded). Details: ${details}`;
			if (/certificate|ssl|tls/i.test(details)) return `MongoDB TLS/SSL handshake failed — often a system clock that's wrong, or a corporate proxy/antivirus intercepting HTTPS/TLS traffic. Details: ${details}`;
			if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(details)) return `Could not resolve the MongoDB Atlas hostname (DNS failure) — check your internet connection or try a different DNS/network. Details: ${details}`;
			if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(details)) return `Could not reach MongoDB Atlas over the network — this really is a connectivity/firewall issue (a corporate network or antivirus may be blocking outbound port 27017), separate from the IP whitelist. Details: ${details}`;
			return `${genericMsg} — per-server details: ${details}`;
		}
	}
	return genericMsg;
}
async function connectMongo(uri) {
	if (isConnected) return;
	try {
		const finalUri = await convertSrvToStandardUri(uri);
		await mongoose.connect(finalUri, {
			serverSelectionTimeoutMS: 1e4,
			connectTimeoutMS: 1e4
		});
		isConnected = true;
		connectionError = null;
		mongoose.connection.on("disconnected", () => {
			isConnected = false;
		});
	} catch (err) {
		isConnected = false;
		connectionError = describeConnectFailure(err);
		console.error("[mongoSync] connect failed — raw error:", err);
		throw new Error(connectionError || "Failed to connect to MongoDB");
	}
}
async function disconnectMongo() {
	if (!isConnected) return;
	await mongoose.disconnect();
	isConnected = false;
}
function getConnectionStatus() {
	return {
		connected: isConnected,
		error: connectionError
	};
}
var sharedOptions = {
	versionKey: false,
	_id: false
};
var childSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var ChildModel = mongoose.models["sync_children"] || mongoose.model("sync_children", childSchema);
var paymentSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var PaymentModel = mongoose.models["sync_payments"] || mongoose.model("sync_payments", paymentSchema);
var childServiceSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	child_id: Number,
	service: String,
	unit: String,
	price: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var ChildServiceModel = mongoose.models["sync_child_services"] || mongoose.model("sync_child_services", childServiceSchema);
var userSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	username: String,
	password: String,
	role: String,
	name: String,
	is_active: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var UserModel = mongoose.models["sync_users"] || mongoose.model("sync_users", userSchema);
var settingSchema = new Schema({
	id: {
		type: String,
		required: true,
		unique: true
	},
	key: String,
	value: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var SettingModel = mongoose.models["sync_settings"] || mongoose.model("sync_settings", settingSchema);
var tombstoneSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	entity: String,
	record_id: Number,
	created_at: String,
	synced: Number
}, sharedOptions);
var TombstoneModel = mongoose.models["sync_tombstones"] || mongoose.model("sync_tombstones", tombstoneSchema);
var employeeSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var EmployeeModel = mongoose.models["sync_employees"] || mongoose.model("sync_employees", employeeSchema);
var salaryPaymentSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var SalaryPaymentModel = mongoose.models["sync_salary_payments"] || mongoose.model("sync_salary_payments", salaryPaymentSchema);
var expenseSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	item: String,
	month: String,
	year: Number,
	amount: Number,
	category: String,
	notes: String,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var ExpenseModel = mongoose.models["sync_expenses"] || mongoose.model("sync_expenses", expenseSchema);
var importedSnapshotSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	sheet: String,
	row_index: Number,
	data_json: String,
	imported_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var ImportedSnapshotModel = mongoose.models["sync_imported_snapshots"] || mongoose.model("sync_imported_snapshots", importedSnapshotSchema);
var salaryTypeSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	name: String,
	mode: String,
	monthly_rate: Number,
	session_rate: Number,
	session_pct: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var SalaryTypeModel = mongoose.models["sync_salary_types"] || mongoose.model("sync_salary_types", salaryTypeSchema);
var employeeRoleSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	name: String,
	salary_type_id: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var EmployeeRoleModel = mongoose.models["sync_employee_roles"] || mongoose.model("sync_employee_roles", employeeRoleSchema);
var serviceDefinitionSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	name: String,
	is_custom: Number,
	price_monthly: Number,
	price_daily: Number,
	price_hourly: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var ServiceDefinitionModel = mongoose.models["sync_service_definitions"] || mongoose.model("sync_service_definitions", serviceDefinitionSchema);
var scheduledSessionSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	session_date: String,
	service_id: Number,
	group_name: String,
	notes: String,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var ScheduledSessionModel = mongoose.models["sync_scheduled_sessions"] || mongoose.model("sync_scheduled_sessions", scheduledSessionSchema);
var sessionTeacherSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	session_id: Number,
	employee_id: Number,
	synced: Number
}, sharedOptions);
var SessionTeacherModel = mongoose.models["sync_session_teachers"] || mongoose.model("sync_session_teachers", sessionTeacherSchema);
var attendanceRecordSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var AttendanceRecordModel = mongoose.models["sync_attendance_records"] || mongoose.model("sync_attendance_records", attendanceRecordSchema);
var attendanceConflictSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	attendance_record_id: Number,
	overwritten_status: String,
	overwritten_by: String,
	overwritten_at: String,
	winning_status: String,
	winning_by: String,
	winning_at: String,
	reviewed: Number,
	created_at: String
}, sharedOptions);
var AttendanceConflictModel = mongoose.models["sync_attendance_conflicts"] || mongoose.model("sync_attendance_conflicts", attendanceConflictSchema);
var paymentMethodSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	name: String,
	is_active: Number,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var PaymentMethodModel = mongoose.models["sync_payment_methods"] || mongoose.model("sync_payment_methods", paymentMethodSchema);
var employeeDeductionSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	employee_id: Number,
	month: String,
	year: Number,
	reason: String,
	amount: Number,
	created_at: String,
	synced: Number
}, sharedOptions);
var EmployeeDeductionModel = mongoose.models["sync_employee_deductions"] || mongoose.model("sync_employee_deductions", employeeDeductionSchema);
var paymentTransactionSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	payment_id: Number,
	amount: Number,
	payment_method_id: Number,
	payment_method_name: String,
	paid_date: String,
	notes: String,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var PaymentTransactionModel = mongoose.models["sync_payment_transactions"] || mongoose.model("sync_payment_transactions", paymentTransactionSchema);
var serviceTeacherSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	service_id: Number,
	employee_id: Number,
	created_at: String,
	synced: Number
}, sharedOptions);
var ServiceTeacherModel = mongoose.models["sync_service_teachers"] || mongoose.model("sync_service_teachers", serviceTeacherSchema);
var teacherPaymentSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	teacher_id: Number,
	child_id: Number,
	attendance_record_id: Number,
	attendance_date: String,
	session_cost: Number,
	status: String,
	created_at: String,
	updated_at: String,
	synced: Number
}, sharedOptions);
var TeacherPaymentModel = mongoose.models["sync_teacher_payments"] || mongoose.model("sync_teacher_payments", teacherPaymentSchema);
var attendanceEditRequestSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var AttendanceEditRequestModel = mongoose.models["sync_attendance_edit_requests"] || mongoose.model("sync_attendance_edit_requests", attendanceEditRequestSchema);
var attendanceAuditLogSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
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
}, sharedOptions);
var AttendanceAuditLogModel = mongoose.models["sync_attendance_audit_log"] || mongoose.model("sync_attendance_audit_log", attendanceAuditLogSchema);
var notificationSchema = new Schema({
	id: {
		type: Number,
		required: true,
		unique: true
	},
	user_id: Number,
	type: String,
	related_id: Number,
	message_ar: String,
	message_en: String,
	read_at: String,
	created_at: String,
	synced: Number
}, sharedOptions);
var NotificationModel = mongoose.models["sync_notifications"] || mongoose.model("sync_notifications", notificationSchema);
var SYNC_ENTITIES = [
	{
		name: "children",
		model: ChildModel,
		table: "children"
	},
	{
		name: "child_services",
		model: ChildServiceModel,
		table: "child_services"
	},
	{
		name: "payments",
		model: PaymentModel,
		table: "payments"
	},
	{
		name: "employees",
		model: EmployeeModel,
		table: "employees"
	},
	{
		name: "salary_payments",
		model: SalaryPaymentModel,
		table: "salary_payments"
	},
	{
		name: "expenses",
		model: ExpenseModel,
		table: "expenses"
	},
	{
		name: "users",
		model: UserModel,
		table: "users"
	},
	{
		name: "settings",
		model: SettingModel,
		table: "settings"
	},
	{
		name: "imported_snapshots",
		model: ImportedSnapshotModel,
		table: "imported_snapshots"
	},
	{
		name: "tombstones",
		model: TombstoneModel,
		table: "tombstones"
	},
	{
		name: "salary_types",
		model: SalaryTypeModel,
		table: "salary_types"
	},
	{
		name: "employee_roles",
		model: EmployeeRoleModel,
		table: "employee_roles"
	},
	{
		name: "service_definitions",
		model: ServiceDefinitionModel,
		table: "service_definitions"
	},
	{
		name: "scheduled_sessions",
		model: ScheduledSessionModel,
		table: "scheduled_sessions"
	},
	{
		name: "session_teachers",
		model: SessionTeacherModel,
		table: "session_teachers"
	},
	{
		name: "attendance_records",
		model: AttendanceRecordModel,
		table: "attendance_records"
	},
	{
		name: "attendance_conflicts",
		model: AttendanceConflictModel,
		table: "attendance_conflicts"
	},
	{
		name: "payment_methods",
		model: PaymentMethodModel,
		table: "payment_methods"
	},
	{
		name: "employee_deductions",
		model: EmployeeDeductionModel,
		table: "employee_deductions"
	},
	{
		name: "payment_transactions",
		model: PaymentTransactionModel,
		table: "payment_transactions"
	},
	{
		name: "service_teachers",
		model: ServiceTeacherModel,
		table: "service_teachers"
	},
	{
		name: "teacher_payments",
		model: TeacherPaymentModel,
		table: "teacher_payments"
	},
	{
		name: "attendance_edit_requests",
		model: AttendanceEditRequestModel,
		table: "attendance_edit_requests"
	},
	{
		name: "attendance_audit_log",
		model: AttendanceAuditLogModel,
		table: "attendance_audit_log"
	},
	{
		name: "notifications",
		model: NotificationModel,
		table: "notifications"
	}
];
//#endregion
export { SettingModel as C, connectMongo as D, UserModel as E, disconnectMongo as O, SessionTeacherModel as S, TombstoneModel as T, SalaryPaymentModel as _, ChildModel as a, ServiceDefinitionModel as b, EmployeeModel as c, ImportedSnapshotModel as d, NotificationModel as f, SYNC_ENTITIES as g, PaymentTransactionModel as h, AttendanceRecordModel as i, getConnectionStatus as k, EmployeeRoleModel as l, PaymentModel as m, AttendanceConflictModel as n, ChildServiceModel as o, PaymentMethodModel as p, AttendanceEditRequestModel as r, EmployeeDeductionModel as s, AttendanceAuditLogModel as t, ExpenseModel as u, SalaryTypeModel as v, TeacherPaymentModel as w, ServiceTeacherModel as x, ScheduledSessionModel as y };

//# sourceMappingURL=mongoSync-BBtdWLDq.js.map