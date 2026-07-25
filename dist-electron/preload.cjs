let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("api", {
	auth: {
		login: (args) => electron.ipcRenderer.invoke("auth:login", args),
		logout: () => electron.ipcRenderer.invoke("auth:logout"),
		current: () => electron.ipcRenderer.invoke("auth:current"),
		restore: (args) => electron.ipcRenderer.invoke("auth:restore", args)
	},
	users: {
		list: () => electron.ipcRenderer.invoke("users:list"),
		create: (args) => electron.ipcRenderer.invoke("users:create", args),
		update: (args) => electron.ipcRenderer.invoke("users:update", args),
		deactivate: (args) => electron.ipcRenderer.invoke("users:deactivate", args),
		delete: (args) => electron.ipcRenderer.invoke("users:delete", args)
	},
	children: {
		get: (args) => electron.ipcRenderer.invoke("children:get", args),
		add: (args) => electron.ipcRenderer.invoke("children:add", args),
		update: (args) => electron.ipcRenderer.invoke("children:update", args),
		deactivate: (args) => electron.ipcRenderer.invoke("children:deactivate", args),
		delete: (args) => electron.ipcRenderer.invoke("children:delete", args),
		statement: (args) => electron.ipcRenderer.invoke("children:statement", args)
	},
	childServices: {
		list: (args) => electron.ipcRenderer.invoke("childServices:list", args),
		add: (args) => electron.ipcRenderer.invoke("childServices:add", args),
		update: (args) => electron.ipcRenderer.invoke("childServices:update", args),
		remove: (args) => electron.ipcRenderer.invoke("childServices:remove", args),
		previewTeacherCost: (teacher_id, lesson_days, teacher_session_rate) => electron.ipcRenderer.invoke("childServices:previewTeacherCost", {
			teacher_id,
			lesson_days,
			teacher_session_rate
		}),
		getTimetable: (child_id) => electron.ipcRenderer.invoke("childServices:getTimetable", { child_id })
	},
	serviceTeachers: {
		list: (service_id) => electron.ipcRenderer.invoke("serviceTeachers:list", { service_id }),
		set: (service_id, employee_ids) => electron.ipcRenderer.invoke("serviceTeachers:set", {
			service_id,
			employee_ids
		})
	},
	teacherPayments: {
		list: (filters) => electron.ipcRenderer.invoke("teacherPayments:list", filters),
		markPaid: (ids) => electron.ipcRenderer.invoke("teacherPayments:markPaid", { ids })
	},
	payroll: { report: (month, year) => electron.ipcRenderer.invoke("payroll:report", {
		month,
		year
	}) },
	teachers: { list: (args) => electron.ipcRenderer.invoke("teachers:list", args) },
	payments: {
		get: (args) => electron.ipcRenderer.invoke("payments:get", args),
		generate: (args) => electron.ipcRenderer.invoke("payments:generate", args),
		update: (args) => electron.ipcRenderer.invoke("payments:update", args),
		bulkPay: (args) => electron.ipcRenderer.invoke("payments:bulkPay", args),
		listTransactions: (payment_id) => electron.ipcRenderer.invoke("payments:listTransactions", { payment_id }),
		addTransaction: (args) => electron.ipcRenderer.invoke("payments:addTransaction", args),
		deleteTransaction: (id) => electron.ipcRenderer.invoke("payments:deleteTransaction", { id }),
		deleteForChild: (args) => electron.ipcRenderer.invoke("payments:deleteForChild", args),
		deleteBulk: (ids) => electron.ipcRenderer.invoke("payments:deleteBulk", { ids }),
		deleteAll: (args) => electron.ipcRenderer.invoke("payments:deleteAll", args)
	},
	transactions: { list: (args) => electron.ipcRenderer.invoke("transactions:list", args) },
	childIllnessCases: {
		getOpen: (child_id) => electron.ipcRenderer.invoke("childIllnessCases:getOpen", { child_id }),
		list: (child_id) => electron.ipcRenderer.invoke("childIllnessCases:list", { child_id }),
		create: (args) => electron.ipcRenderer.invoke("childIllnessCases:create", args),
		resolve: (args) => electron.ipcRenderer.invoke("childIllnessCases:resolve", args)
	},
	childActivities: {
		list: (child_id) => electron.ipcRenderer.invoke("childActivities:list", { child_id }),
		create: (args) => electron.ipcRenderer.invoke("childActivities:create", args),
		delete: (id) => electron.ipcRenderer.invoke("childActivities:delete", { id })
	},
	calendar: {
		getMonth: (year, month) => electron.ipcRenderer.invoke("calendar:getMonth", {
			year,
			month
		}),
		getDay: (date) => electron.ipcRenderer.invoke("calendar:getDay", { date })
	},
	employees: {
		get: () => electron.ipcRenderer.invoke("employees:get"),
		add: (args) => electron.ipcRenderer.invoke("employees:add", args),
		update: (args) => electron.ipcRenderer.invoke("employees:update", args),
		deactivate: (args) => electron.ipcRenderer.invoke("employees:deactivate", args)
	},
	salary: {
		get: (args) => electron.ipcRenderer.invoke("salary:get", args),
		update: (args) => electron.ipcRenderer.invoke("salary:update", args),
		getExpected: (args) => electron.ipcRenderer.invoke("salary:getExpected", args)
	},
	expenses: {
		get: (args) => electron.ipcRenderer.invoke("expenses:get", args),
		update: (args) => electron.ipcRenderer.invoke("expenses:update", args),
		addItem: (args) => electron.ipcRenderer.invoke("expenses:addItem", args),
		removeItem: (args) => electron.ipcRenderer.invoke("expenses:removeItem", args)
	},
	dashboard: { get: (args) => electron.ipcRenderer.invoke("dashboard:get", args) },
	target: {
		get: (args) => electron.ipcRenderer.invoke("target:get", args),
		calc: (args) => electron.ipcRenderer.invoke("target:calc", args),
		capacityPlan: (args) => electron.ipcRenderer.invoke("target:capacity-plan", args)
	},
	settings: {
		get: () => electron.ipcRenderer.invoke("settings:get"),
		update: (args) => electron.ipcRenderer.invoke("settings:update", args)
	},
	branding: {
		get: () => electron.ipcRenderer.invoke("branding:get"),
		save: (args) => electron.ipcRenderer.invoke("branding:save", args),
		uploadLogo: () => electron.ipcRenderer.invoke("branding:upload-logo"),
		uploadIcon: () => electron.ipcRenderer.invoke("branding:upload-icon"),
		reset: () => electron.ipcRenderer.invoke("branding:reset")
	},
	export: {
		full: (args) => electron.ipcRenderer.invoke("export:full", args),
		month: (args) => electron.ipcRenderer.invoke("export:month", args),
		child: (args) => electron.ipcRenderer.invoke("export:child", args),
		salaries: (args) => electron.ipcRenderer.invoke("export:salaries", args),
		expenses: (args) => electron.ipcRenderer.invoke("export:expenses", args),
		employees: (args) => electron.ipcRenderer.invoke("export:employees", args),
		payrollReport: (args) => electron.ipcRenderer.invoke("export:payrollReport", args),
		childReport: (args) => electron.ipcRenderer.invoke("export:childReport", args)
	},
	print: { preview: (args) => electron.ipcRenderer.invoke("print:preview", args) },
	storage: {
		stats: () => electron.ipcRenderer.invoke("storage:stats"),
		backup: () => electron.ipcRenderer.invoke("storage:backup"),
		restore: (args) => electron.ipcRenderer.invoke("storage:restore", args),
		import: (args) => electron.ipcRenderer.invoke("storage:import", args),
		clear: (args) => electron.ipcRenderer.invoke("storage:clear", args),
		audit: () => electron.ipcRenderer.invoke("storage:audit"),
		uploadPhoto: (args) => electron.ipcRenderer.invoke("storage:uploadPhoto", args)
	},
	sync: {
		connect: (args) => electron.ipcRenderer.invoke("sync:connect", args),
		reconnect: () => electron.ipcRenderer.invoke("sync:reconnect"),
		disconnect: () => electron.ipcRenderer.invoke("sync:disconnect"),
		push: (force) => electron.ipcRenderer.invoke("sync:push", { force: force === true }),
		pull: (force) => electron.ipcRenderer.invoke("sync:pull", { force: force === true }),
		status: () => electron.ipcRenderer.invoke("sync:status"),
		autoSync: (args) => electron.ipcRenderer.invoke("sync:auto-sync", args),
		autoSyncStatus: () => electron.ipcRenderer.invoke("sync:auto-status:get"),
		onAutoSyncStatus: (callback) => {
			const handler = (_e, payload) => callback(payload);
			electron.ipcRenderer.on("sync:auto-status", handler);
			return () => electron.ipcRenderer.removeListener("sync:auto-status", handler);
		}
	},
	roles: {
		list: () => electron.ipcRenderer.invoke("roles:list"),
		add: (args) => electron.ipcRenderer.invoke("roles:add", args),
		update: (args) => electron.ipcRenderer.invoke("roles:update", args),
		delete: (args) => electron.ipcRenderer.invoke("roles:delete", args)
	},
	salaryTypes: {
		list: () => electron.ipcRenderer.invoke("salaryTypes:list"),
		add: (args) => electron.ipcRenderer.invoke("salaryTypes:add", args),
		update: (args) => electron.ipcRenderer.invoke("salaryTypes:update", args),
		delete: (args) => electron.ipcRenderer.invoke("salaryTypes:delete", args)
	},
	serviceDefinitions: {
		list: () => electron.ipcRenderer.invoke("serviceDefinitions:list"),
		add: (args) => electron.ipcRenderer.invoke("serviceDefinitions:add", args),
		update: (args) => electron.ipcRenderer.invoke("serviceDefinitions:update", args),
		delete: (args) => electron.ipcRenderer.invoke("serviceDefinitions:delete", args)
	},
	sessions: {
		list: (args) => electron.ipcRenderer.invoke("sessions:list", args),
		add: (args) => electron.ipcRenderer.invoke("sessions:add", args),
		update: (id, patch) => electron.ipcRenderer.invoke("sessions:update", {
			id,
			patch
		}),
		delete: (id) => electron.ipcRenderer.invoke("sessions:delete", { id }),
		assignTeachers: (session_id, employee_ids) => electron.ipcRenderer.invoke("sessions:assignTeachers", {
			session_id,
			employee_ids
		}),
		salaryCredit: (session_id) => electron.ipcRenderer.invoke("sessions:salaryCredit", { session_id }),
		proRateCalc: (args) => electron.ipcRenderer.invoke("sessions:proRateCalc", args),
		childrenForDay: (day_of_week) => electron.ipcRenderer.invoke("sessions:childrenForDay", { day_of_week })
	},
	attendance: {
		getSheet: (sessionId) => electron.ipcRenderer.invoke("attendance:getSheet", { session_id: sessionId }),
		record: (sessionId, records) => electron.ipcRenderer.invoke("attendance:record", {
			session_id: sessionId,
			records
		}),
		delete: (sessionId, child_ids, reason) => electron.ipcRenderer.invoke("attendance:delete", {
			session_id: sessionId,
			child_ids,
			reason
		}),
		getConflicts: () => electron.ipcRenderer.invoke("attendance:getConflicts"),
		resolveConflict: (conflict_id, final_status) => electron.ipcRenderer.invoke("attendance:resolveConflict", {
			conflict_id,
			final_status
		}),
		getSummary: (employee_id, month, year) => electron.ipcRenderer.invoke("attendance:getSummary", {
			employee_id,
			month,
			year
		}),
		getChildHistory: (child_id) => electron.ipcRenderer.invoke("attendance:getChildHistory", { child_id }),
		requestEdit: (args) => electron.ipcRenderer.invoke("attendance:requestEdit", args),
		listEditRequests: (args) => electron.ipcRenderer.invoke("attendance:listEditRequests", args ?? {}),
		decideEditRequest: (args) => electron.ipcRenderer.invoke("attendance:decideEditRequest", args),
		getAuditLog: (attendance_record_id) => electron.ipcRenderer.invoke("attendance:getAuditLog", { attendance_record_id })
	},
	notifications: {
		list: (args) => electron.ipcRenderer.invoke("notifications:list", args ?? {}),
		markRead: (args) => electron.ipcRenderer.invoke("notifications:markRead", args)
	},
	deductions: {
		list: (args) => electron.ipcRenderer.invoke("deductions:list", args),
		add: (args) => electron.ipcRenderer.invoke("deductions:add", args),
		remove: (args) => electron.ipcRenderer.invoke("deductions:remove", args)
	},
	paymentMethods: {
		list: () => electron.ipcRenderer.invoke("paymentMethods:list"),
		add: (args) => electron.ipcRenderer.invoke("paymentMethods:add", args),
		update: (args) => electron.ipcRenderer.invoke("paymentMethods:update", args),
		delete: (args) => electron.ipcRenderer.invoke("paymentMethods:delete", args)
	},
	updater: {
		check: () => electron.ipcRenderer.invoke("updater:check"),
		install: () => electron.ipcRenderer.invoke("updater:install"),
		openReleasePage: () => electron.ipcRenderer.invoke("updater:open-release-page"),
		onStatusChange: (callback) => {
			const handler = (_e, payload) => callback(payload);
			electron.ipcRenderer.on("updater:status", handler);
			return () => electron.ipcRenderer.removeListener("updater:status", handler);
		}
	},
	/**
	* Subscribe to long-running operation progress (push/pull/import/backup/restore).
	* Returns an unsubscribe function. Payload: { op, phase, current, total, percent }.
	*/
	onProgress: (callback) => {
		const handler = (_e, payload) => callback(payload);
		electron.ipcRenderer.on("progress:update", handler);
		return () => electron.ipcRenderer.removeListener("progress:update", handler);
	}
});
//#endregion

//# sourceMappingURL=preload.cjs.map