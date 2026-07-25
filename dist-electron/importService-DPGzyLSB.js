import { n as getDb } from "./connection-BgU_q3q-.js";
import ExcelJS from "exceljs";
//#region electron/services/importService.ts
var arabicMonths = [
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
/**
* Safely convert a cell value to a number.
*/
function toNum(val) {
	if (val === null || val === void 0 || val === "") return 0;
	const n = Number(val);
	return isNaN(n) ? 0 : n;
}
/**
* Safely convert a cell value to a string.
*/
function toStr(val) {
	if (val === null || val === void 0) return "";
	return String(val).trim();
}
/**
* Main import function.
*/
async function importFromWorkbook(filePath) {
	const db = getDb();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(filePath);
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
		sheets: workbook.worksheets.map((ws) => ws.name)
	};
	const now = (/* @__PURE__ */ new Date()).toISOString();
	for (const ws of workbook.worksheets) {
		const sheetName = ws.name.trim();
		const monthMatch = arabicMonths.find((m) => sheetName.includes(m));
		const yearMatch = sheetName.match(/\d{4}/);
		if (!monthMatch || !yearMatch) continue;
		const month = monthMatch;
		const year = parseInt(yearMatch[0]);
		ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
			if (rowNum < 2) return;
			const name = toStr(row.getCell(1).value);
			const service = toStr(row.getCell(2).value);
			const totalFee = toNum(row.getCell(3).value);
			const paid = toNum(row.getCell(4).value);
			if (!name) return;
			let child = db.prepare("SELECT id FROM children WHERE name = ?").get(name);
			if (!child) {
				const result = db.prepare(`
          INSERT OR IGNORE INTO children (name, service, monthly_fee, join_date, created_at, synced)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(name, service || "حضانة", totalFee, now, now);
				if (result.changes > 0) {
					summary.children.imported++;
					child = { id: result.lastInsertRowid };
				} else {
					summary.children.skipped++;
					child = db.prepare("SELECT id FROM children WHERE name = ?").get(name);
				}
			}
			if (!child) return;
			const balance = totalFee - paid;
			const status = paid >= totalFee ? "paid" : paid > 0 ? "partial" : "unpaid";
			if (!db.prepare("SELECT id FROM payments WHERE child_id = ? AND month = ? AND year = ? AND service = ?").get(child.id, month, year, service || "حضانة")) {
				db.prepare(`
          INSERT INTO payments (child_id, service, month, year, total, paid, balance, status, created_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(child.id, service || "حضانة", month, year, totalFee, paid, balance, status, now);
				summary.payments.imported++;
			} else summary.payments.skipped++;
		});
	}
	const salarySheet = workbook.worksheets.find((ws) => ws.name.includes("راتب") || ws.name.includes("موظف") || ws.name.toLowerCase().includes("salary"));
	if (salarySheet) {
		let month = arabicMonths[(/* @__PURE__ */ new Date()).getMonth()];
		let year = (/* @__PURE__ */ new Date()).getFullYear();
		const headerMonthCell = toStr(salarySheet.getCell("A1").value) || toStr(salarySheet.getCell("B1").value);
		const headerMonthMatch = arabicMonths.find((m) => headerMonthCell.includes(m));
		if (headerMonthMatch) month = headerMonthMatch;
		const headerYearMatch = headerMonthCell.match(/\d{4}/);
		if (headerYearMatch) year = parseInt(headerYearMatch[0]);
		salarySheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
			if (rowNum < 2) return;
			const name = toStr(row.getCell(1).value);
			const baseSalary = toNum(row.getCell(2).value);
			const housing = toNum(row.getCell(3).value);
			const transport = toNum(row.getCell(4).value);
			const bonus = toNum(row.getCell(5).value);
			const deduction = toNum(row.getCell(6).value);
			const actualPaid = toNum(row.getCell(7).value);
			if (!name || !baseSalary && !actualPaid) return;
			let emp = db.prepare("SELECT id FROM employees WHERE name = ?").get(name);
			if (!emp) {
				const result = db.prepare(`
          INSERT OR IGNORE INTO employees (name, base_salary, housing_allowance, transport_allowance, is_active, created_at, synced)
          VALUES (?, ?, ?, ?, 1, ?, 0)
        `).run(name, baseSalary, housing, transport, now);
				if (result.changes > 0) {
					summary.employees.imported++;
					emp = { id: result.lastInsertRowid };
				} else {
					summary.employees.skipped++;
					emp = db.prepare("SELECT id FROM employees WHERE name = ?").get(name);
				}
			}
			if (!emp) return;
			if (!db.prepare("SELECT id FROM salary_payments WHERE employee_id = ? AND month = ? AND year = ?").get(emp.id, month, year)) {
				db.prepare(`
          INSERT INTO salary_payments (employee_id, month, year, bonus, deduction, actual_paid, pay_date, created_at, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(emp.id, month, year, bonus, deduction, actualPaid || baseSalary, now.slice(0, 10), now);
				summary.salaryPayments.imported++;
			} else summary.salaryPayments.skipped++;
		});
	}
	const expensesSheet = workbook.worksheets.find((ws) => ws.name.includes("مصروف") || ws.name.toLowerCase().includes("expense"));
	if (expensesSheet) {
		const year = (/* @__PURE__ */ new Date()).getFullYear();
		expensesSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
			if (rowNum < 2) return;
			const item = toStr(row.getCell(1).value);
			if (!item) return;
			arabicMonths.forEach((month, idx) => {
				const amount = toNum(row.getCell(idx + 2).value);
				if (amount === 0) return;
				db.prepare(`
          INSERT INTO expenses (item, month, year, amount, category, notes, created_at, synced)
          VALUES (?, ?, ?, ?, NULL, NULL, ?, 0)
          ON CONFLICT(item, month, year) DO NOTHING
        `).run(item, month, year, amount, now);
				summary.expenses.imported++;
			});
		});
	}
	return summary;
}
//#endregion
export { importFromWorkbook };

//# sourceMappingURL=importService-DPGzyLSB.js.map