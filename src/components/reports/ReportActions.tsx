import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button.js'

interface ReportActionsProps {
  onPrint: () => void | Promise<void>
  onExportPdf: () => void | Promise<void>
  onExportExcel: () => void | Promise<void>
  onExportCsv?: () => void | Promise<void>
  disabled?: boolean
}

/**
 * Shared Print / Export PDF / Export Excel / Export CSV button group (feature 007) used by every
 * report screen — one component so all four reports look and behave the same, instead of each
 * page hand-rolling its own export buttons.
 */
export const ReportActions: React.FC<ReportActionsProps> = ({ onPrint, onExportPdf, onExportExcel, onExportCsv, disabled }) => {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [busy, setBusy] = useState<'print' | 'pdf' | 'excel' | 'csv' | null>(null)

  const run = async (key: 'print' | 'pdf' | 'excel' | 'csv', fn: () => void | Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" disabled={disabled} isLoading={busy === 'print'} onClick={() => run('print', onPrint)}>
        🖨️ {isAr ? 'طباعة' : 'Print'}
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} isLoading={busy === 'pdf'} onClick={() => run('pdf', onExportPdf)}>
        📄 {isAr ? 'تصدير PDF' : 'Export PDF'}
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} isLoading={busy === 'excel'} onClick={() => run('excel', onExportExcel)}>
        📊 {isAr ? 'تصدير Excel' : 'Export Excel'}
      </Button>
      {onExportCsv && (
        <Button variant="outline" size="sm" disabled={disabled} isLoading={busy === 'csv'} onClick={() => run('csv', onExportCsv)}>
          📃 {isAr ? 'تصدير CSV' : 'Export CSV'}
        </Button>
      )}
    </div>
  )
}
