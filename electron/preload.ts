import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Auth & Users
  auth: {
    login: (args: any) => ipcRenderer.invoke('auth:login', args),
    logout: () => ipcRenderer.invoke('auth:logout'),
    current: () => ipcRenderer.invoke('auth:current'),
    restore: (args: { token: string }) => ipcRenderer.invoke('auth:restore', args),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (args: any) => ipcRenderer.invoke('users:create', args),
    update: (args: any) => ipcRenderer.invoke('users:update', args),
    deactivate: (args: any) => ipcRenderer.invoke('users:deactivate', args),
    delete: (args: any) => ipcRenderer.invoke('users:delete', args),
  },
  
  // Students
  students: {
    get: (args: any) => ipcRenderer.invoke('students:get', args),
    add: (args: any) => ipcRenderer.invoke('students:add', args),
    update: (args: any) => ipcRenderer.invoke('students:update', args),
    deactivate: (args: any) => ipcRenderer.invoke('students:deactivate', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('students:delete', args),
    statement: (args: { studentId: number }) => ipcRenderer.invoke('students:statement', args),
  },
  studentServices: {
    list: (args: { studentId: number }) => ipcRenderer.invoke('studentServices:list', args),
    add: (args: any) => ipcRenderer.invoke('studentServices:add', args),
    update: (args: any) => ipcRenderer.invoke('studentServices:update', args),
    remove: (args: { id: number }) => ipcRenderer.invoke('studentServices:remove', args),
    previewTeacherCost: (teacher_id: number, lesson_days: number[], teacher_session_rate?: number | null) =>
      ipcRenderer.invoke('studentServices:previewTeacherCost', { teacher_id, lesson_days, teacher_session_rate }) as Promise<{ remaining_sessions: number; expected_cost: number; teacher_session_rate: number }>,
    getTimetable: (student_id: number) => ipcRenderer.invoke('studentServices:getTimetable', { student_id }),
  },

  // Service Teachers
  serviceTeachers: {
    list: (service_id: number) => ipcRenderer.invoke('serviceTeachers:list', { service_id }),
    set: (service_id: number, employee_ids: number[]) => ipcRenderer.invoke('serviceTeachers:set', { service_id, employee_ids }),
  },

  // Teacher Payments
  teacherPayments: {
    list: (filters: { teacher_id?: number; student_id?: number; month?: number; year?: number }) =>
      ipcRenderer.invoke('teacherPayments:list', filters),
    markPaid: (ids: number[]) => ipcRenderer.invoke('teacherPayments:markPaid', { ids }) as Promise<{ ok: boolean; updated: number }>,
  },

  // Payroll
  payroll: {
    report: (month: number, year: number) => ipcRenderer.invoke('payroll:report', { month, year }),
  },
  teachers: {
    list: (args?: { role?: string }) => ipcRenderer.invoke('teachers:list', args),
  },

  // Payments
  payments: {
    get: (args: any) => ipcRenderer.invoke('payments:get', args),
    generate: (args: any) => ipcRenderer.invoke('payments:generate', args),
    update: (args: any) => ipcRenderer.invoke('payments:update', args),
    bulkPay: (args: any) => ipcRenderer.invoke('payments:bulkPay', args),
    listTransactions: (payment_id: number) => ipcRenderer.invoke('payments:listTransactions', { payment_id }),
    addTransaction: (args: { payment_id: number; amount: number; payment_method_id?: number | null; paid_date?: string | null; notes?: string | null }) => ipcRenderer.invoke('payments:addTransaction', args),
    deleteTransaction: (id: number) => ipcRenderer.invoke('payments:deleteTransaction', { id }),
    deleteForStudent: (args: { student_id: number; month: string; year: number }) => ipcRenderer.invoke('payments:deleteForStudent', args),
    deleteBulk: (ids: number[]) => ipcRenderer.invoke('payments:deleteBulk', { ids }) as Promise<{ ok: boolean; deleted: number }>,
    deleteAll: (args: { month: string; year: number }) => ipcRenderer.invoke('payments:deleteAll', args) as Promise<{ ok: boolean; deleted: number }>,
  },

  // Transactions (feature 009 — replaces Daily Billing)
  transactions: {
    list: (args: { range: 'day' | 'week' | 'month' | 'custom'; date?: string; from?: string; to?: string; studentId?: number }) =>
      ipcRenderer.invoke('transactions:list', args),
  },

  // Student illness cases + activity/media diary (feature 009)
  studentIllnessCases: {
    getOpen: (student_id: number) => ipcRenderer.invoke('studentIllnessCases:getOpen', { student_id }),
    list: (student_id: number) => ipcRenderer.invoke('studentIllnessCases:list', { student_id }),
    create: (args: { student_id: number; description?: string; opened_at?: string }) => ipcRenderer.invoke('studentIllnessCases:create', args),
    resolve: (args: { id: number; resolved_at?: string }) => ipcRenderer.invoke('studentIllnessCases:resolve', args),
  },
  studentActivities: {
    list: (student_id: number) => ipcRenderer.invoke('studentActivities:list', { student_id }),
    create: (args: { student_id: number; activity_date?: string; note?: string; media_data_url?: string; media_type?: 'photo' | 'video' | 'file' }) =>
      ipcRenderer.invoke('studentActivities:create', args),
    delete: (id: number) => ipcRenderer.invoke('studentActivities:delete', { id }),
  },

  // Instalment plans — "pays over N instalments", spread month by month
  installments: {
    plan: (args: { student_id: number; count: number; total: number; start_date: string; service_id?: number | null }) =>
      ipcRenderer.invoke('installments:plan', args),
    list: (args?: { student_id?: number; month?: string; year?: number; from?: string; to?: string; status?: string; branch_id?: number }) =>
      ipcRenderer.invoke('installments:list', args ?? {}),
    calendar: (args: { year: number; student_id?: number | null; branch_id?: number }) =>
      ipcRenderer.invoke('installments:calendar', args),
    listTransactions: (args: { installment_id: number }) => ipcRenderer.invoke('installments:listTransactions', args),
    deleteTransaction: (args: { id: number }) => ipcRenderer.invoke('installments:deleteTransaction', args),
    preview: (args: { count: number; total?: number; start_date: string; student_id?: number }) =>
      ipcRenderer.invoke('installments:preview', args) as Promise<
        { seq: number; due_date: string; month: string; year: number; amount: number }[]
      >,
    /** The fee a plan would be built from — the price of the student's enrolled services. */
    enrolledFee: (args: { student_id: number }) =>
      ipcRenderer.invoke('installments:enrolledFee', args) as Promise<{
        total: number
        services: { id: number; service: string; unit: string; price: number }[]
      }>,
    pay: (args: { id: number; amount: number; payment_method_id?: number | null; paid_date?: string | null; notes?: string | null }) =>
      ipcRenderer.invoke('installments:pay', args),
    update: (args: { id: number; patch: { amount?: number; due_date?: string; notes?: string | null } }) =>
      ipcRenderer.invoke('installments:update', args),
    clear: (args: { student_id: number }) => ipcRenderer.invoke('installments:clear', args),
  },

  // Branches — physical / online, and how each user is attached to them
  branches: {
    list: (args?: { activeOnly?: boolean; kind?: 'physical' | 'online' }) => ipcRenderer.invoke('branches:list', args ?? {}),
    mine: () => ipcRenderer.invoke('branches:mine'),
    add: (args: any) => ipcRenderer.invoke('branches:add', args),
    update: (args: { id: number; patch: any }) => ipcRenderer.invoke('branches:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('branches:delete', args),
    setManager: (args: { branch_id: number; user_id: number | null }) => ipcRenderer.invoke('branches:setManager', args),
    assignUser: (args: { user_id: number; mode: 'branch' | 'online' | 'mixed'; branch_ids?: number[]; primary_branch_id?: number | null }) =>
      ipcRenderer.invoke('branches:assignUser', args),
    userAssignments: () => ipcRenderer.invoke('branches:userAssignments'),
  },

  // Halls & their weekly opening hours (several intervals per day allowed)
  halls: {
    list: (args?: { activeOnly?: boolean; branch_id?: number }) => ipcRenderer.invoke('halls:list', args ?? {}),
    get: (args: { id: number }) => ipcRenderer.invoke('halls:get', args),
    add: (args: any) => ipcRenderer.invoke('halls:add', args),
    update: (args: { id: number; patch: any }) => ipcRenderer.invoke('halls:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('halls:delete', args),
    timetable: (args?: { branch_id?: number; hall_id?: number }) => ipcRenderer.invoke('halls:timetable', args ?? {}),
  },

  // Shared Calendar page (feature 009)
  calendar: {
    getMonth: (year: number, month: number) => ipcRenderer.invoke('calendar:getMonth', { year, month }),
    getDay: (date: string) => ipcRenderer.invoke('calendar:getDay', { date }),
  },

  // Salaries
  employees: {
    get: () => ipcRenderer.invoke('employees:get'),
    add: (args: any) => ipcRenderer.invoke('employees:add', args),
    update: (args: any) => ipcRenderer.invoke('employees:update', args),
    deactivate: (args: any) => ipcRenderer.invoke('employees:deactivate', args),
  },
  salary: {
    get: (args: any) => ipcRenderer.invoke('salary:get', args),
    update: (args: any) => ipcRenderer.invoke('salary:update', args),
    getExpected: (args: { employee_id: number; month: string; year: number }) =>
      ipcRenderer.invoke('salary:getExpected', args) as Promise<{ actual_to_date: number; projected_remaining: number; expected_total: number; salary_type_mode: string | null }>,
  },

  // Expenses
  expenses: {
    get: (args: any) => ipcRenderer.invoke('expenses:get', args),
    update: (args: any) => ipcRenderer.invoke('expenses:update', args),
    addItem: (args: any) => ipcRenderer.invoke('expenses:addItem', args),
    removeItem: (args: any) => ipcRenderer.invoke('expenses:removeItem', args),
  },

  // Dashboard / Target
  dashboard: {
    get: (args: any) => ipcRenderer.invoke('dashboard:get', args),
  },
  target: {
    get: (args: any) => ipcRenderer.invoke('target:get', args),
    calc: (args: any) => ipcRenderer.invoke('target:calc', args),
    capacityPlan: (args: any) => ipcRenderer.invoke('target:capacity-plan', args),
  },

  // Settings & Branding
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (args: any) => ipcRenderer.invoke('settings:update', args),
  },
  branding: {
    get: () => ipcRenderer.invoke('branding:get'),
    save: (args: any) => ipcRenderer.invoke('branding:save', args),
    uploadLogo: () => ipcRenderer.invoke('branding:upload-logo'),
    uploadIcon: () => ipcRenderer.invoke('branding:upload-icon'),
    reset: () => ipcRenderer.invoke('branding:reset'),
  },

  // Export
  export: {
    full: (args: any) => ipcRenderer.invoke('export:full', args),
    month: (args: any) => ipcRenderer.invoke('export:month', args),
    student: (args: any) => ipcRenderer.invoke('export:student', args),
    salaries: (args: any) => ipcRenderer.invoke('export:salaries', args),
    expenses: (args: any) => ipcRenderer.invoke('export:expenses', args),
    employees: (args: any) => ipcRenderer.invoke('export:employees', args),
    payrollReport: (args: { month: number; year: number; format: 'xlsx' | 'pdf' | 'csv'; lang: string }) =>
      ipcRenderer.invoke('export:payrollReport', args),
    studentReport: (args: { studentId: number; format: 'xlsx' | 'pdf' | 'csv'; lang: string }) =>
      ipcRenderer.invoke('export:studentReport', args),
  },

  // Print (feature 007) — branded HTML print preview, handed to window.print()
  print: {
    preview: (args: { reportType: 'payroll' | 'expenses' | 'student' | 'studentReport' | 'month'; [key: string]: any }) => ipcRenderer.invoke('print:preview', args) as Promise<{ html: string }>,
  },

  // Storage
  storage: {
    stats: () => ipcRenderer.invoke('storage:stats'),
    backup: () => ipcRenderer.invoke('storage:backup'),
    restore: (args: any) => ipcRenderer.invoke('storage:restore', args),
    import: (args: any) => ipcRenderer.invoke('storage:import', args),
    clear: (args: any) => ipcRenderer.invoke('storage:clear', args),
    audit: () => ipcRenderer.invoke('storage:audit'),
    uploadPhoto: (args: { dataUrl: string; folder?: string }) =>
      ipcRenderer.invoke('storage:uploadPhoto', args),
  },

  // Sync
  sync: {
    connect: (args: { uri: string }) => ipcRenderer.invoke('sync:connect', args),
    reconnect: () => ipcRenderer.invoke('sync:reconnect'),
    disconnect: () => ipcRenderer.invoke('sync:disconnect'),
    push: (force?: boolean) => ipcRenderer.invoke('sync:push', { force: force === true }),
    pull: (force?: boolean) => ipcRenderer.invoke('sync:pull', { force: force === true }),
    status: () => ipcRenderer.invoke('sync:status'),
    autoSync: (args: { enabled: boolean; intervalMinutes?: number }) =>
      ipcRenderer.invoke('sync:auto-sync', args),
    autoSyncStatus: () => ipcRenderer.invoke('sync:auto-status:get'),
    onAutoSyncStatus: (
      callback: (payload: { state: 'connecting' | 'pushing' | 'pulling' | 'done' | 'error' }) => void
    ) => {
      const handler = (_e: unknown, payload: any) => callback(payload)
      ipcRenderer.on('sync:auto-status', handler)
      return () => ipcRenderer.removeListener('sync:auto-status', handler)
    },
  },

  // Roles
  roles: {
    list: () => ipcRenderer.invoke('roles:list'),
    add: (args: { name: string; salary_type_id?: number | null }) => ipcRenderer.invoke('roles:add', args),
    update: (args: { id: number; patch: { name?: string; salary_type_id?: number | null } }) => ipcRenderer.invoke('roles:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('roles:delete', args),
  },

  // Salary Types
  salaryTypes: {
    list: () => ipcRenderer.invoke('salaryTypes:list'),
    add: (args: any) => ipcRenderer.invoke('salaryTypes:add', args),
    update: (args: { id: number; patch: any }) => ipcRenderer.invoke('salaryTypes:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('salaryTypes:delete', args),
  },

  // Service Definitions
  serviceDefinitions: {
    list: () => ipcRenderer.invoke('serviceDefinitions:list'),
    add: (args: any) => ipcRenderer.invoke('serviceDefinitions:add', args),
    update: (args: { id: number; patch: any }) => ipcRenderer.invoke('serviceDefinitions:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('serviceDefinitions:delete', args),
  },

  // Sessions
  sessions: {
    list: (args?: { from?: string; to?: string }) => ipcRenderer.invoke('sessions:list', args),
    add: (args: any) => ipcRenderer.invoke('sessions:add', args),
    update: (id: number, patch: any) => ipcRenderer.invoke('sessions:update', { id, patch }),
    delete: (id: number) => ipcRenderer.invoke('sessions:delete', { id }),
    assignTeachers: (session_id: number, employee_ids: number[]) => ipcRenderer.invoke('sessions:assignTeachers', { session_id, employee_ids }),
    salaryCredit: (session_id: number) => ipcRenderer.invoke('sessions:salaryCredit', { session_id }) as Promise<{ payable: boolean; hasTeachers: boolean; credits: { employee_id: number; name: string; amount: number }[] }>,
    proRateCalc: (args: { reg_date: string; price_per_session: number }) => ipcRenderer.invoke('sessions:proRateCalc', args),
    studentsForDay: (day_of_week: number) => ipcRenderer.invoke('sessions:studentsForDay', { day_of_week }),
  },

  // Session timers — hourly pay is clocked by starting/stopping a timer on the session
  sessionTimers: {
    start: (args: { employee_id: number; session_id?: number | null; notes?: string | null }) =>
      ipcRenderer.invoke('sessionTimers:start', args),
    stop: (args: { id?: number; employee_id?: number }) => ipcRenderer.invoke('sessionTimers:stop', args),
    list: (args?: { employee_id?: number; session_id?: number; from?: string; to?: string; status?: string }) =>
      ipcRenderer.invoke('sessionTimers:list', args ?? {}),
    active: (args?: { employee_id?: number }) => ipcRenderer.invoke('sessionTimers:active', args ?? {}),
    logManual: (args: { employee_id: number; session_id?: number | null; work_date?: string; started_at?: string | null; ended_at?: string | null; duration_minutes?: number | null; notes?: string | null }) =>
      ipcRenderer.invoke('sessionTimers:logManual', args),
    void: (args: { id: number }) => ipcRenderer.invoke('sessionTimers:void', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('sessionTimers:delete', args),
    hourlyEmployees: () => ipcRenderer.invoke('sessionTimers:hourlyEmployees') as Promise<
      { id: number; name: string; role: string; effective_hourly_rate: number | null }[]
    >,
  },

  // Attendance
  attendance: {
    getSheet: (sessionId: number) => ipcRenderer.invoke('attendance:getSheet', { session_id: sessionId }),
    record: (sessionId: number, records: any[]) => ipcRenderer.invoke('attendance:record', { session_id: sessionId, records }),
    delete: (sessionId: number, student_ids: (number | { student_id: number; teacher_id: number | null })[], reason?: string) =>
      ipcRenderer.invoke('attendance:delete', { session_id: sessionId, student_ids, reason }) as Promise<{ ok: boolean; deleted: number; requested: number }>,
    getConflicts: () => ipcRenderer.invoke('attendance:getConflicts'),
    resolveConflict: (conflict_id: number, final_status: string) => ipcRenderer.invoke('attendance:resolveConflict', { conflict_id, final_status }),
    getSummary: (employee_id: number, month: string, year: number) => ipcRenderer.invoke('attendance:getSummary', { employee_id, month, year }),
    getStudentHistory: (student_id: number) => ipcRenderer.invoke('attendance:getStudentHistory', { student_id }),
    requestEdit: (args: { attendance_record_id: number; requested_status: string; requested_excuse_notes?: string | null; requested_teacher_status?: string | null; reason: string }) =>
      ipcRenderer.invoke('attendance:requestEdit', args),
    listEditRequests: (args?: { status?: string; student_id?: number; teacher_id?: number }) =>
      ipcRenderer.invoke('attendance:listEditRequests', args ?? {}),
    decideEditRequest: (args: { id: number; decision: 'approve' | 'reject'; decision_notes?: string | null }) =>
      ipcRenderer.invoke('attendance:decideEditRequest', args),
    getAuditLog: (attendance_record_id: number) => ipcRenderer.invoke('attendance:getAuditLog', { attendance_record_id }),
  },

  // Notifications
  notifications: {
    list: (args?: { unreadOnly?: boolean }) => ipcRenderer.invoke('notifications:list', args ?? {}),
    markRead: (args: { id?: number; all?: boolean }) => ipcRenderer.invoke('notifications:markRead', args),
  },

  // Employee Deductions
  deductions: {
    list: (args: { employee_id: number; month: string; year: number }) => ipcRenderer.invoke('deductions:list', args),
    add: (args: { employee_id: number; month: string; year: number; reason: string; amount: number }) => ipcRenderer.invoke('deductions:add', args),
    remove: (args: { id: number }) => ipcRenderer.invoke('deductions:remove', args),
  },

  // Payment Methods
  paymentMethods: {
    list: () => ipcRenderer.invoke('paymentMethods:list'),
    add: (args: { name: string }) => ipcRenderer.invoke('paymentMethods:add', args),
    update: (args: { id: number; patch: any }) => ipcRenderer.invoke('paymentMethods:update', args),
    delete: (args: { id: number }) => ipcRenderer.invoke('paymentMethods:delete', args),
  },

  // Auto-Updater
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    openReleasePage: () => ipcRenderer.invoke('updater:open-release-page'),
    onStatusChange: (
      callback: (payload: {
        event: 'checking-for-update' | 'update-available' | 'update-not-available' | 'error' | 'download-progress' | 'update-downloaded'
        info?: any
        error?: string
        errorCode?: 'rate_limit' | 'network' | 'unknown'
        progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
      }) => void
    ) => {
      const handler = (_e: unknown, payload: any) => callback(payload)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  },

  /**
   * Subscribe to long-running operation progress (push/pull/import/backup/restore).
   * Returns an unsubscribe function. Payload: { op, phase, current, total, percent }.
   */
  onProgress: (
    callback: (payload: {
      op: 'push' | 'pull' | 'import' | 'backup' | 'restore'
      phase: string
      current: number
      total: number
      percent: number
    }) => void
  ) => {
    const handler = (_e: unknown, payload: any) => callback(payload)
    ipcRenderer.on('progress:update', handler)
    return () => ipcRenderer.removeListener('progress:update', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type WindowApi = typeof api
