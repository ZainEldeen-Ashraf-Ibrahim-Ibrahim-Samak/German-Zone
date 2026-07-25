import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Employee, SalaryPayment } from '../types/index.js'

interface SalariesState {
  employees: Employee[]
  salaryPayments: SalaryPayment[]
  isLoading: boolean
  error: string | null
  currentMonth: string
  currentYear: number

  setPeriod: (month: string, year: number) => void
  fetchEmployees: () => Promise<void>
  addEmployee: (input: {
    name: string
    role: string
    base_salary: number
    housing?: number
    transport?: number
  }) => Promise<Employee | null>
  updateEmployee: (
    id: number,
    patch: {
      name?: string
      role?: string
      base_salary?: number
      housing?: number
      transport?: number
    }
  ) => Promise<Employee | null>
  deactivateEmployee: (id: number) => Promise<boolean>
  fetchSalaryPayments: () => Promise<void>
  updateSalaryPayment: (args: {
    employee_id: number
    month: string
    year: number
    bonus: number
    deductions: number
    paid_date?: string | null
    notes?: string | null
  }) => Promise<SalaryPayment | null>
  clearError: () => void
}

const arabicMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

const now = new Date()
const defaultMonth = arabicMonths[now.getMonth()]
const defaultYear = now.getFullYear()

export const useSalariesStore = create<SalariesState>((set, get) => ({
  employees: [],
  salaryPayments: [],
  isLoading: false,
  error: null,
  currentMonth: defaultMonth,
  currentYear: defaultYear,

  setPeriod: (month, year) => {
    set({ currentMonth: month, currentYear: year })
    get().fetchSalaryPayments()
  },

  fetchEmployees: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.employees.get()
      set({ employees: result, isLoading: false })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch employees')
      set({ error: errorMsg, isLoading: false })
    }
  },

  addEmployee: async (input) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.employees.add(input)
      set((state) => ({
        employees: [...state.employees, result].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to add employee')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  updateEmployee: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.employees.update({ id, patch })
      set((state) => ({
        employees: state.employees.map((e) => (e.id === id ? result : e)),
        isLoading: false
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update employee')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  deactivateEmployee: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.employees.deactivate({ id })
      set((state) => ({
        employees: state.employees.map((e) => (e.id === id ? { ...e, is_active: 0 } : e)),
        isLoading: false
      }))
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to deactivate employee')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  fetchSalaryPayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const month = get().currentMonth
      const year = get().currentYear
      const result = await window.api.salary.get({ month, year })
      set({ salaryPayments: result, isLoading: false })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch salary payments')
      set({ error: errorMsg, isLoading: false })
    }
  },

  updateSalaryPayment: async (args) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.salary.update(args)
      set((state) => {
        // Update payment row in state directly if it exists, otherwise it will be refreshed anyway
        const exists = state.salaryPayments.some((s) => s.employee_id === args.employee_id)
        let updated
        if (exists) {
          updated = state.salaryPayments.map((s) => (s.employee_id === args.employee_id ? result : s))
        } else {
          updated = [...state.salaryPayments, result]
        }
        return {
          salaryPayments: updated,
          isLoading: false
        }
      })
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update salary payment')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  clearError: () => set({ error: null })
}))
