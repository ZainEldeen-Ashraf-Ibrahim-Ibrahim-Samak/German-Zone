import { o as getDb, r as SPEAKING } from "./services-CCTLx17J.js";
import ExcelJS from "exceljs";
//#region electron/services/importService.ts
/**
* The legacy workbook still labels enrolments with the pre-rebrand nursery service
* names, so keep matching those on the way in and map them onto the German Zone
* course levels. Mirrors migration 045, which applies the same mapping to rows
* already in the database.
*/
var LEGACY_SERVICE_MAP = {
	"حضانة": "A1",
	"حضانه": "A1",
	"استضافة": "A2",
	"استضافه": "A2",
	"جلسة": SPEAKING,
	"جلسه": SPEAKING
};
function mapLegacyService(name) {
	const trimmed = (name ?? "").trim();
	return LEGACY_SERVICE_MAP[trimmed] ?? trimmed;
}
var DATA_START_ROW = 4;
var ARABIC_MONTHS = [
	"يناير",
	"فبراير",
	"مارس",
	"أبريل",
	"مايو",
	"يونيو",
	"يوليو",
	"أغسطس",
	"سبتمبر",
	"أكتوبر",
	"نوفمبر",
	"ديسمبر"
];
var STUDENT_COL = {
	name: 3,
	guardian: 4,
	guardianPhone: 5,
	studentPhone: 6,
	nationalId: 7,
	service: 8,
	unit: 9,
	price: 10,
	regDate: 11,
	notes: 12
};
var PAY_COL = {
	name: 3,
	service: 4,
	unit: 5,
	quantity: 6,
	price: 7,
	total: 8,
	paid: 9,
	balance: 10,
	status: 11,
	notes: 12
};
var SAL_COL = {
	name: 3,
	role: 4,
	base: 5,
	housing: 6,
	transport: 7,
	bonus: 8,
	deductions: 9,
	net: 10,
	firstMonth: 12
};
var EXP_COL = {
	item: 3,
	firstMonth: 4
};
/**
* Resolve an ExcelJS cell value to its effective primitive: formula cells expose
* their cached `.result`, rich text is joined, hyperlinks use their text.
*/
function resolveCellValue(v) {
	if (v === null || v === void 0) return null;
	if (v instanceof Date) return v;
	if (typeof v === "object") {
		const o = v;
		if ("result" in o) return o.result;
		if ("richText" in o && Array.isArray(o.richText)) return o.richText.map((r) => r?.text ?? "").join("");
		if ("text" in o) return o.text;
		if ("error" in o) return null;
	}
	return v;
}
function cellAt(row, col) {
	return resolveCellValue(row.getCell(col).value);
}
function toNum(val) {
	const v = resolveCellValue(val);
	if (v === null || v === void 0 || v === "") return 0;
	const n = Number(v);
	return isNaN(n) ? 0 : n;
}
function toStr(val) {
	const v = resolveCellValue(val);
	if (v === null || v === void 0) return "";
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	return String(v).trim();
}
/** Empty string → null (for nullable columns; node:sqlite rejects undefined). */
function orNull(s) {
	return s === "" ? null : s;
}
/**
* The workbook sheets embed summary/total/tip rows (e.g. "إجمالي الرواتب",
* "💰 إجمالي الفواتير", "💡 ..."). These are NOT real records and must be
* skipped so they don't pollute students/employees/expenses.
*/
function isDataName(name) {
	if (!name) return false;
	const first = name.trimStart().charAt(0);
	if (!/[؀-ۿA-Za-z0-9]/.test(first)) return false;
	if (/إجمالي|الإجمالي|ملخّص|ملخص|صافي الربح|التارجت|نسبة التحصيل|المحصّل|المحصل/.test(name)) return false;
	return true;
}
function resolveImportYear() {
	const envYear = parseInt(process.env.IMPORT_DEFAULT_YEAR ?? "", 10);
	if (!isNaN(envYear) && envYear > 1900 && envYear < 3e3) return envYear;
	return (/* @__PURE__ */ new Date()).getFullYear();
}
function firstOfMonth(year, monthIndex) {
	return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}
function isIgnoredSheet(name) {
	return name.includes("داشبورد") || name.includes("إعدادات") || name.includes("الإعدادات") || name.includes("كشف حساب") || name.includes("تخطيط") || name.includes("تارجت") || name.toLowerCase().includes("dashboard") || name.toLowerCase().includes("setting");
}
function isStudentsSheet(name) {
	return name.includes("بيانات الطلاب") || name.includes("الطلاب");
}
function isSalarySheet(name) {
	return name.includes("رواتب") || name.includes("راتب") || name.includes("موظف") || name.toLowerCase().includes("salary");
}
function isExpensesSheet(name) {
	return name.includes("مصروف") || name.toLowerCase().includes("expense");
}
function isSettingsSheet(name) {
	return name.includes("إعداد") || name.includes("الإعداد") || name.toLowerCase().includes("setting");
}
function isTargetSheet(name) {
	return name.includes("تخطيط") || name.includes("تارجت") || name.toLowerCase().includes("target");
}
function isDashboardSheet(name) {
	return name.includes("داشبورد") || name.toLowerCase().includes("dashboard");
}
function isStatementSheet(name) {
	return name.includes("كشف حساب") || name.toLowerCase().includes("statement");
}
function monthOfSheet(name) {
	return ARABIC_MONTHS.findIndex((m) => name.includes(m));
}
/**
* Return only the rows from DATA_START_ROW onward that actually hold values.
*
* `sheet.rowCount` can balloon to tens of thousands when a workbook carries
* stray formatting far below the data, which makes a `for (r <= rowCount)` loop
* crawl over endless empty rows. `eachRow({ includeEmpty: false })` visits only
* populated rows, so the import stays fast regardless of the sheet's formatting.
*/
function dataRows(sheet) {
	const rows = [];
	sheet.eachRow({ includeEmpty: false }, (row, r) => {
		if (r >= DATA_START_ROW) rows.push(row);
	});
	return rows;
}
async function importFromWorkbook(filePath, onProgress) {
	const db = getDb();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(filePath);
	const year = resolveImportYear();
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const totalSheets = Math.max(1, workbook.worksheets.length);
	let sheetsDone = 0;
	const tick = (phase) => onProgress?.(++sheetsDone, totalSheets, phase);
	onProgress?.(0, totalSheets, "starting");
	const summary = {
		students: {
			imported: 0,
			skipped: 0
		},
		payments: {
			imported: 0,
			skipped: 0
		},
		employees: {
			imported: 0,
			skipped: 0
		},
		salaryPayments: {
			imported: 0,
			skipped: 0
		},
		expenses: {
			imported: 0,
			skipped: 0
		},
		settings: {
			imported: 0,
			skipped: 0
		},
		snapshots: {
			imported: 0,
			skipped: 0
		},
		sheetsProcessed: [],
		sheetsIgnored: [],
		year,
		rowErrors: 0,
		rowErrorDetails: []
	};
	/** Record a swallowed row failure with its reason (logged + returned to UI). */
	function recordRowError(sheet, row, name, err) {
		summary.rowErrors++;
		const message = err instanceof Error ? err.message : String(err);
		if (summary.rowErrorDetails.length < 50) summary.rowErrorDetails.push({
			sheet,
			row,
			name,
			message
		});
		console.error(`[import] row error — sheet="${sheet}" row=${row} name="${name}": ${message}`);
	}
	const findStudent = db.prepare("SELECT id FROM students WHERE name = ?");
	const insertStudent = db.prepare(`
    INSERT INTO students
      (name, guardian, guardian_phone, student_phone, national_id, service, unit, price,
       reg_date, notes, is_active, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
  `);
	const findPayment = db.prepare("SELECT id FROM payments WHERE student_id = ? AND month = ? AND year = ? AND service = ?");
	const insertPayment = db.prepare(`
    INSERT INTO payments
      (student_id, service_id, month, year, service, unit, quantity, price, total, paid, balance,
       status, notes, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
	const insertStudentService = db.prepare(`
    INSERT INTO student_services (student_id, service, unit, price, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
	const findStudentService = db.prepare("SELECT id FROM student_services WHERE student_id = ? AND service = ?");
	/** Ensure a (student, service) enrollment exists; return its id. Idempotent. */
	function ensureEnrollment(studentId, service, unit, price) {
		const row = findStudentService.get(studentId, service);
		if (row) return row.id;
		const res = insertStudentService.run(studentId, service, unit, price, now, now);
		return Number(res.lastInsertRowid);
	}
	const findEmployee = db.prepare("SELECT id FROM employees WHERE name = ?");
	const insertEmployee = db.prepare(`
    INSERT INTO employees
      (name, role, base_salary, housing, transport, net_salary, is_active, created_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)
  `);
	const findSalary = db.prepare("SELECT id FROM salary_payments WHERE employee_id = ? AND month = ? AND year = ?");
	const insertSalary = db.prepare(`
    INSERT INTO salary_payments
      (employee_id, month, year, bonus, deductions, actual_paid, paid_date, notes, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
	const insertExpense = db.prepare(`
    INSERT INTO expenses (item, month, year, amount, category, notes, created_at, synced)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, 0)
    ON CONFLICT(item, month, year) DO NOTHING
  `);
	const SETTINGS_IMPORT_DENYLIST = new Set(["sync_mongo_uri"]);
	const upsertSetting = db.prepare(`
    INSERT INTO settings (key, value, updated_at, synced)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, synced = 0
  `);
	function setSetting(key, value) {
		if (SETTINGS_IMPORT_DENYLIST.has(key)) return;
		upsertSetting.run(key, String(value), now);
		summary.settings.imported++;
	}
	function setServicePrice(serviceName, field, value) {
		const res = db.prepare(`UPDATE service_definitions SET ${field} = ?, updated_at = ?, synced = 0 WHERE name = ?`).run(value, now, serviceName);
		if (Number(res.changes) > 0) summary.settings.imported++;
	}
	const upsertSnapshot = db.prepare(`
    INSERT INTO imported_snapshots (sheet, row_index, data_json, imported_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(sheet, row_index) DO UPDATE SET
      data_json = excluded.data_json, updated_at = excluded.updated_at, synced = 0
  `);
	/** Ensure a student row exists for `name`; return its id (creating a placeholder). */
	function ensureStudent(name, opts = {}) {
		const existing = findStudent.get(name);
		if (existing) return existing.id;
		const svc = mapLegacyService(opts.service ?? "") || "A1";
		const unit = opts.unit || "شهر";
		const price = opts.price ?? 0;
		const res = insertStudent.run(name, "—", "—", null, null, svc, unit, price, opts.regDate || now.slice(0, 10), null, now, now);
		const studentId = Number(res.lastInsertRowid);
		ensureEnrollment(studentId, svc, unit, price);
		summary.students.imported++;
		return studentId;
	}
	const studentSheet = workbook.worksheets.find((ws) => isStudentsSheet(ws.name));
	if (studentSheet) {
		summary.sheetsProcessed.push(studentSheet.name);
		db.transaction(() => {
			for (const row of dataRows(studentSheet)) {
				const r = row.number;
				const name = toStr(cellAt(row, STUDENT_COL.name));
				if (!isDataName(name)) continue;
				if (findStudent.get(name)) {
					summary.students.skipped++;
					continue;
				}
				try {
					const svc = mapLegacyService(toStr(cellAt(row, STUDENT_COL.service))) || "A1";
					const unit = toStr(cellAt(row, STUDENT_COL.unit)) || "شهر";
					const price = toNum(cellAt(row, STUDENT_COL.price));
					const res = insertStudent.run(name, toStr(cellAt(row, STUDENT_COL.guardian)) || "—", toStr(cellAt(row, STUDENT_COL.guardianPhone)) || "—", orNull(toStr(cellAt(row, STUDENT_COL.studentPhone))), orNull(toStr(cellAt(row, STUDENT_COL.nationalId))), svc, unit, price, toStr(cellAt(row, STUDENT_COL.regDate)) || now.slice(0, 10), orNull(toStr(cellAt(row, STUDENT_COL.notes))), now, now);
					ensureEnrollment(Number(res.lastInsertRowid), svc, unit, price);
					summary.students.imported++;
				} catch (err) {
					recordRowError(studentSheet.name, r, name, err);
				}
			}
		})();
		tick(studentSheet.name);
	}
	for (const ws of workbook.worksheets) {
		if (isIgnoredSheet(ws.name) || isStudentsSheet(ws.name) || isSalarySheet(ws.name) || isExpensesSheet(ws.name) || isSettingsSheet(ws.name) || isTargetSheet(ws.name) || isDashboardSheet(ws.name) || isStatementSheet(ws.name)) continue;
		const monthIdx = monthOfSheet(ws.name);
		if (monthIdx < 0) continue;
		summary.sheetsProcessed.push(ws.name);
		const month = ARABIC_MONTHS[monthIdx];
		const regBase = firstOfMonth(year, monthIdx);
		db.transaction(() => {
			for (const row of dataRows(ws)) {
				const r = row.number;
				const name = toStr(cellAt(row, PAY_COL.name));
				if (!isDataName(name)) continue;
				try {
					const service = mapLegacyService(toStr(cellAt(row, PAY_COL.service))) || "A1";
					const unit = toStr(cellAt(row, PAY_COL.unit)) || "شهر";
					const quantity = toNum(cellAt(row, PAY_COL.quantity)) || 1;
					const price = toNum(cellAt(row, PAY_COL.price));
					const total = toNum(cellAt(row, PAY_COL.total)) || price * quantity;
					const paid = toNum(cellAt(row, PAY_COL.paid));
					const balance = toNum(cellAt(row, PAY_COL.balance)) || total - paid;
					const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
					const notes = orNull(toStr(cellAt(row, PAY_COL.notes)));
					const studentId = ensureStudent(name, {
						service,
						unit,
						price,
						regDate: regBase
					});
					const serviceId = ensureEnrollment(studentId, service, unit, price);
					if (findPayment.get(studentId, month, year, service)) {
						summary.payments.skipped++;
						continue;
					}
					insertPayment.run(studentId, serviceId, month, year, service, unit, quantity, price, total, paid, balance, status, notes, now, now);
					summary.payments.imported++;
				} catch (err) {
					recordRowError(ws.name, r, name, err);
				}
			}
		})();
		tick(ws.name);
	}
	const salarySheet = workbook.worksheets.find((ws) => isSalarySheet(ws.name));
	if (salarySheet) {
		summary.sheetsProcessed.push(salarySheet.name);
		db.transaction(() => {
			for (const row of dataRows(salarySheet)) {
				const r = row.number;
				const name = toStr(cellAt(row, SAL_COL.name));
				if (!isDataName(name)) continue;
				try {
					const role = toStr(cellAt(row, SAL_COL.role)) || "موظف";
					const base = toNum(cellAt(row, SAL_COL.base));
					const housing = toNum(cellAt(row, SAL_COL.housing));
					const transport = toNum(cellAt(row, SAL_COL.transport));
					const bonus = toNum(cellAt(row, SAL_COL.bonus));
					const deductions = toNum(cellAt(row, SAL_COL.deductions));
					const net = toNum(cellAt(row, SAL_COL.net)) || base + housing + transport - deductions + bonus;
					if (base === 0 && net === 0) continue;
					let emp = findEmployee.get(name);
					if (!emp) {
						const res = insertEmployee.run(name, role, base, housing, transport, net, now);
						summary.employees.imported++;
						emp = { id: Number(res.lastInsertRowid) };
					} else summary.employees.skipped++;
					for (let m = 0; m < 12; m++) {
						const paid = toNum(cellAt(row, SAL_COL.firstMonth + m)) || net;
						if (paid === 0) continue;
						if (findSalary.get(emp.id, ARABIC_MONTHS[m], year)) {
							summary.salaryPayments.skipped++;
							continue;
						}
						insertSalary.run(emp.id, ARABIC_MONTHS[m], year, bonus, deductions, paid, firstOfMonth(year, m), null);
						summary.salaryPayments.imported++;
					}
				} catch (err) {
					recordRowError(salarySheet.name, r, name, err);
				}
			}
		})();
		tick(salarySheet.name);
	}
	const expensesSheet = workbook.worksheets.find((ws) => isExpensesSheet(ws.name));
	if (expensesSheet) {
		summary.sheetsProcessed.push(expensesSheet.name);
		db.transaction(() => {
			for (const row of dataRows(expensesSheet)) {
				const r = row.number;
				const item = toStr(cellAt(row, EXP_COL.item));
				if (!isDataName(item)) continue;
				try {
					for (let m = 0; m < 12; m++) {
						const amount = toNum(cellAt(row, EXP_COL.firstMonth + m));
						if (amount === 0) continue;
						const res = insertExpense.run(item, ARABIC_MONTHS[m], year, amount, now);
						if (Number(res.changes) > 0) summary.expenses.imported++;
						else summary.expenses.skipped++;
					}
				} catch (err) {
					recordRowError(expensesSheet.name, r, item, err);
				}
			}
		})();
		tick(expensesSheet.name);
	}
	const settingsSheet = workbook.worksheets.find((ws) => isSettingsSheet(ws.name));
	if (settingsSheet) {
		summary.sheetsProcessed.push(settingsSheet.name);
		db.transaction(() => {
			settingsSheet.eachRow({ includeEmpty: false }, (row, r) => {
				try {
					const label = toStr(cellAt(row, 2));
					if (!label) return;
					const hourly = toNum(cellAt(row, 3));
					const monthly = toNum(cellAt(row, 5));
					if (label.includes("حضانة")) {
						if (monthly > 0) {
							setServicePrice("A1", "price_monthly", monthly);
							setSetting("nursery_monthly", monthly);
						}
					} else if (label.includes("استضافة")) {
						if (monthly > 0) {
							setServicePrice("A2", "price_monthly", monthly);
							setSetting("hosting_monthly", monthly);
						}
					} else if (label.includes("جلسة")) {
						if (hourly > 0) {
							setServicePrice(SPEAKING, "price_hourly", hourly);
							setSetting("session_hourly", hourly);
						}
					} else if (label.includes("نسبة الربح")) {
						if (hourly > 0) setSetting("target_profit_pct", hourly);
					}
				} catch (err) {
					recordRowError(settingsSheet.name, r, "", err);
				}
			});
		})();
		tick(settingsSheet.name);
	}
	const targetSheet = workbook.worksheets.find((ws) => isTargetSheet(ws.name));
	if (targetSheet) {
		summary.sheetsProcessed.push(targetSheet.name);
		db.transaction(() => {
			for (const row of dataRows(targetSheet)) {
				const pct = toNum(cellAt(row, 5));
				if (pct > 0 && pct < 1) {
					setSetting("target_profit_pct", pct);
					break;
				}
			}
		})();
		tick(targetSheet.name);
	}
	const colCount = (ws) => Math.max(1, ws.columnCount);
	function snapshotSheet(ws) {
		summary.sheetsProcessed.push(ws.name);
		const cols = colCount(ws);
		db.transaction(() => {
			ws.eachRow({ includeEmpty: false }, (row, r) => {
				try {
					const values = [];
					for (let c = 1; c <= cols; c++) values.push(resolveCellValue(row.getCell(c).value) ?? null);
					if (values.every((v) => v === null || v === "")) return;
					upsertSnapshot.run(ws.name, r, JSON.stringify(values), now, now);
					summary.snapshots.imported++;
				} catch (err) {
					recordRowError(ws.name, r, "", err);
				}
			});
		})();
		tick(ws.name);
	}
	const dashboardSheet = workbook.worksheets.find((ws) => isDashboardSheet(ws.name));
	if (dashboardSheet) snapshotSheet(dashboardSheet);
	const statementSheet = workbook.worksheets.find((ws) => isStatementSheet(ws.name));
	if (statementSheet) snapshotSheet(statementSheet);
	summary.sheetsIgnored = workbook.worksheets.map((ws) => ws.name).filter((n) => !summary.sheetsProcessed.includes(n));
	onProgress?.(totalSheets, totalSheets, "done");
	return summary;
}
//#endregion
export { importFromWorkbook };

//# sourceMappingURL=importService-BHfQrKM0.js.map