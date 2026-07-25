import { n as getDb } from "./connection-87fvLz8b.js";
import ExcelJS from "exceljs";
//#region electron/services/importService.ts
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
var CHILD_COL = {
	name: 3,
	guardian: 4,
	guardianPhone: 5,
	childPhone: 6,
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
* skipped so they don't pollute children/employees/expenses.
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
function isChildrenSheet(name) {
	return name.includes("بيانات الأطفال") || name.includes("الأطفال");
}
function isSalarySheet(name) {
	return name.includes("رواتب") || name.includes("راتب") || name.includes("موظف") || name.toLowerCase().includes("salary");
}
function isExpensesSheet(name) {
	return name.includes("مصروف") || name.toLowerCase().includes("expense");
}
function monthOfSheet(name) {
	return ARABIC_MONTHS.findIndex((m) => name.includes(m));
}
async function importFromWorkbook(filePath) {
	const db = getDb();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(filePath);
	const year = resolveImportYear();
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const summary = {
		children: {
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
		sheetsProcessed: [],
		sheetsIgnored: [],
		year,
		rowErrors: 0
	};
	const findChild = db.prepare("SELECT id FROM children WHERE name = ?");
	const insertChild = db.prepare(`
    INSERT INTO children
      (name, guardian, guardian_phone, child_phone, national_id, service, unit, price,
       reg_date, notes, is_active, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)
  `);
	const findPayment = db.prepare("SELECT id FROM payments WHERE child_id = ? AND month = ? AND year = ? AND service = ?");
	const insertPayment = db.prepare(`
    INSERT INTO payments
      (child_id, service_id, month, year, service, unit, quantity, price, total, paid, balance,
       status, notes, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
	const insertChildService = db.prepare(`
    INSERT INTO child_services (child_id, service, unit, price, created_at, updated_at, synced)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(child_id, service) DO NOTHING
  `);
	const findChildService = db.prepare("SELECT id FROM child_services WHERE child_id = ? AND service = ?");
	/** Ensure a (child, service) enrollment exists; return its id. Idempotent. */
	function ensureEnrollment(childId, service, unit, price) {
		insertChildService.run(childId, service, unit, price, now, now);
		const row = findChildService.get(childId, service);
		return row ? row.id : null;
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
	/** Ensure a child row exists for `name`; return its id (creating a placeholder). */
	function ensureChild(name, opts = {}) {
		const existing = findChild.get(name);
		if (existing) return existing.id;
		const svc = opts.service || "حضانة";
		const unit = opts.unit || "شهر";
		const price = opts.price ?? 0;
		const res = insertChild.run(name, "—", "—", null, null, svc, unit, price, opts.regDate || now.slice(0, 10), null, now, now);
		const childId = Number(res.lastInsertRowid);
		ensureEnrollment(childId, svc, unit, price);
		summary.children.imported++;
		return childId;
	}
	const childSheet = workbook.worksheets.find((ws) => isChildrenSheet(ws.name));
	if (childSheet) {
		summary.sheetsProcessed.push(childSheet.name);
		db.transaction(() => {
			for (let r = DATA_START_ROW; r <= childSheet.rowCount; r++) {
				const row = childSheet.getRow(r);
				const name = toStr(cellAt(row, CHILD_COL.name));
				if (!isDataName(name)) continue;
				if (findChild.get(name)) {
					summary.children.skipped++;
					continue;
				}
				try {
					const svc = toStr(cellAt(row, CHILD_COL.service)) || "حضانة";
					const unit = toStr(cellAt(row, CHILD_COL.unit)) || "شهر";
					const price = toNum(cellAt(row, CHILD_COL.price));
					const res = insertChild.run(name, toStr(cellAt(row, CHILD_COL.guardian)) || "—", toStr(cellAt(row, CHILD_COL.guardianPhone)) || "—", orNull(toStr(cellAt(row, CHILD_COL.childPhone))), orNull(toStr(cellAt(row, CHILD_COL.nationalId))), svc, unit, price, toStr(cellAt(row, CHILD_COL.regDate)) || now.slice(0, 10), orNull(toStr(cellAt(row, CHILD_COL.notes))), now, now);
					ensureEnrollment(Number(res.lastInsertRowid), svc, unit, price);
					summary.children.imported++;
				} catch {
					summary.rowErrors++;
				}
			}
		})();
	}
	for (const ws of workbook.worksheets) {
		if (isIgnoredSheet(ws.name) || isChildrenSheet(ws.name) || isSalarySheet(ws.name) || isExpensesSheet(ws.name)) continue;
		const monthIdx = monthOfSheet(ws.name);
		if (monthIdx < 0) continue;
		summary.sheetsProcessed.push(ws.name);
		const month = ARABIC_MONTHS[monthIdx];
		const regBase = firstOfMonth(year, monthIdx);
		db.transaction(() => {
			for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
				const row = ws.getRow(r);
				const name = toStr(cellAt(row, PAY_COL.name));
				if (!isDataName(name)) continue;
				try {
					const service = toStr(cellAt(row, PAY_COL.service)) || "حضانة";
					const unit = toStr(cellAt(row, PAY_COL.unit)) || "شهر";
					const quantity = toNum(cellAt(row, PAY_COL.quantity)) || 1;
					const price = toNum(cellAt(row, PAY_COL.price));
					const total = toNum(cellAt(row, PAY_COL.total)) || price * quantity;
					const paid = toNum(cellAt(row, PAY_COL.paid));
					const balance = toNum(cellAt(row, PAY_COL.balance)) || total - paid;
					const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
					const notes = orNull(toStr(cellAt(row, PAY_COL.notes)));
					const childId = ensureChild(name, {
						service,
						unit,
						price,
						regDate: regBase
					});
					if (findPayment.get(childId, month, year, service)) {
						summary.payments.skipped++;
						continue;
					}
					insertPayment.run(childId, month, year, service, unit, quantity, price, total, paid, balance, status, notes, now, now);
					summary.payments.imported++;
				} catch {
					summary.rowErrors++;
				}
			}
		})();
	}
	const salarySheet = workbook.worksheets.find((ws) => isSalarySheet(ws.name));
	if (salarySheet) {
		summary.sheetsProcessed.push(salarySheet.name);
		db.transaction(() => {
			for (let r = DATA_START_ROW; r <= salarySheet.rowCount; r++) {
				const row = salarySheet.getRow(r);
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
				} catch {
					summary.rowErrors++;
				}
			}
		})();
	}
	const expensesSheet = workbook.worksheets.find((ws) => isExpensesSheet(ws.name));
	if (expensesSheet) {
		summary.sheetsProcessed.push(expensesSheet.name);
		db.transaction(() => {
			for (let r = DATA_START_ROW; r <= expensesSheet.rowCount; r++) {
				const row = expensesSheet.getRow(r);
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
				} catch {
					summary.rowErrors++;
				}
			}
		})();
	}
	summary.sheetsIgnored = workbook.worksheets.map((ws) => ws.name).filter((n) => !summary.sheetsProcessed.includes(n));
	return summary;
}
//#endregion
export { importFromWorkbook };

//# sourceMappingURL=importService-DSniA-xK.js.map