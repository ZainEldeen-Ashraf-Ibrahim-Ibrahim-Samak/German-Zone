import { create } from 'zustand'
import { friendlyError } from '../utils/errors.js'
import type { Student } from '../types/index.js'

interface StudentsFilters {
  search: string
  service: string
  activeOnly: boolean
}

interface StudentsState {
  students: Student[]
  isLoading: boolean
  error: string | null
  filters: StudentsFilters
  setFilters: (filters: Partial<StudentsFilters>) => void
  resetFilters: () => void
  fetchStudents: () => Promise<void>
  addStudent: (studentInput: Omit<Student, 'id' | 'created_at' | 'updated_at' | 'synced' | 'is_active'>) => Promise<Student | null>
  updateStudent: (id: number, patch: Partial<Omit<Student, 'id' | 'created_at' | 'updated_at' | 'synced'>>) => Promise<Student | null>
  deactivateStudent: (id: number) => Promise<boolean>
  deleteStudent: (id: number) => Promise<boolean>
  clearError: () => void
}

const initialFilters: StudentsFilters = {
  search: '',
  service: '',
  activeOnly: true,
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  students: [],
  isLoading: false,
  error: null,
  filters: { ...initialFilters },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }))
    get().fetchStudents()
  },

  resetFilters: () => {
    set({ filters: { ...initialFilters } })
    get().fetchStudents()
  },

  fetchStudents: async () => {
    set({ isLoading: true, error: null })
    try {
      const { search, service, activeOnly } = get().filters
      const results = await window.api.students.get({
        search,
        service: service || undefined,
        activeOnly,
      })
      set({ students: results, isLoading: false })
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to fetch students')
      set({ error: errorMsg, isLoading: false })
    }
  },

  addStudent: async (studentInput) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.students.add(studentInput)
      set((state) => ({
        students: [...state.students, result].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to add student')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  updateStudent: async (id, patch) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.api.students.update({ id, patch })
      set((state) => ({
        students: state.students.map((student) => (student.id === id ? result : student)),
        isLoading: false,
      }))
      return result
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to update student')
      set({ error: errorMsg, isLoading: false })
      return null
    }
  },

  deactivateStudent: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.students.deactivate({ id })
      // Refresh list or update status locally
      const { activeOnly } = get().filters
      if (activeOnly) {
        set((state) => ({
          students: state.students.filter((student) => student.id !== id),
          isLoading: false,
        }))
      } else {
        set((state) => ({
          students: state.students.map((student) =>
            student.id === id ? { ...student, is_active: 0 } : student
          ),
          isLoading: false,
        }))
      }
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to deactivate student')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  deleteStudent: async (id) => {
    set({ isLoading: true, error: null })
    try {
      await window.api.students.delete({ id })
      set((state) => ({
        students: state.students.filter((student) => student.id !== id),
        isLoading: false,
      }))
      return true
    } catch (err: any) {
      const errorMsg = friendlyError(err, 'Failed to delete student')
      set({ error: errorMsg, isLoading: false })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))
