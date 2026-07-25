import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function useExport() {
  const { i18n } = useTranslation()
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async (
    type: 'full' | 'month' | 'child' | 'salaries' | 'expenses' | 'employees',
    params: any
  ) => {
    setIsExporting(true)
    setError(null)
    try {
      const exportParams = {
        ...params,
        lang: i18n.language,
      }
      
      let result = null
      if (type === 'full') {
        result = await window.api.export.full(exportParams)
      } else if (type === 'month') {
        result = await window.api.export.month(exportParams)
      } else if (type === 'child') {
        result = await window.api.export.child(exportParams)
      } else if (type === 'salaries') {
        result = await window.api.export.salaries(exportParams)
      } else if (type === 'expenses') {
        result = await window.api.export.expenses(exportParams)
      } else if (type === 'employees') {
        result = await window.api.export.employees(exportParams)
      }
      
      return result
    } catch (err: any) {
      console.error(`Export ${type} failed:`, err)
      let msg = err.message || 'Export failed'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+':\s*/, '')
      }
      setError(msg)
      throw new Error(msg)
    } finally {
      setIsExporting(false)
    }
  }

  return {
    isExporting,
    error,
    exportFull: (year: number, format: 'xlsx' | 'pdf') => handleExport('full', { year, format }),
    exportMonth: (month: string, year: number, format: 'xlsx' | 'pdf' | 'csv', paymentIds?: number[]) =>
      handleExport('month', { month, year, format, paymentIds }),
    exportChild: (childId: number, format: 'xlsx' | 'pdf' | 'csv') => handleExport('child', { childId, format }),
    exportSalaries: (month: string, year: number, format: 'xlsx' | 'pdf') => handleExport('salaries', { month, year, format }),
    exportExpenses: (year: number, format: 'xlsx' | 'pdf' | 'csv') => handleExport('expenses', { year, format }),
    exportEmployees: (format: 'xlsx' | 'pdf') => handleExport('employees', { format }),
    clearError: () => setError(null),
  }
}
