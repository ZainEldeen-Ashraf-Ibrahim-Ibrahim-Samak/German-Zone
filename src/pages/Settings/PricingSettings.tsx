import * as React from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '../../components/ui/Card.js'
import { Input } from '../../components/ui/Input.js'
import { Button } from '../../components/ui/Button.js'
import { Alert } from '../../components/ui/Alert.js'

// Service pricing (nursery/hosting/session rates) lives exclusively in service_definitions,
// managed on the Settings → Services tab — this tab only holds the Targets & Capacity
// settings, which are not service-specific and have no equivalent there.
type SettingsKey =
  | 'target_profit_pct'
  | 'max_capacity'
  | 'work_days'
  | 'work_hours'

type SettingsState = Record<SettingsKey, string>
type FieldErrors = Partial<Record<SettingsKey, string>>

const PRICING_KEYS: SettingsKey[] = [
  'target_profit_pct',
  'max_capacity',
  'work_days',
  'work_hours',
]

const DEFAULT_SETTINGS: SettingsState = {
  target_profit_pct: '0.20',
  max_capacity: '50',
  work_days: '22',
  work_hours: '8',
}

export default function PricingSettings() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

  // Human-readable field labels for validation messages
  const fieldLabels: Record<SettingsKey, string> = {
    target_profit_pct: isAr ? 'نسبة الربح المستهدفة' : 'Target Profit Rate',
    max_capacity: isAr ? 'القدرة الاستيعابية' : 'Max Capacity',
    work_days: isAr ? 'أيام العمل / الشهر' : 'Work Days / Month',
    work_hours: isAr ? 'ساعات العمل / اليوم' : 'Work Hours / Day',
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true)
        const data = await window.api.settings.get()
        if (data) {
          setSettings((prev) => {
            const updated = { ...prev }
            for (const key of PRICING_KEYS) {
              if (data[key] !== undefined && data[key] !== null) {
                // Coerce value to string
                updated[key] = String(data[key])
              }
            }
            return updated
          })
        }
      } catch (err: any) {
        console.error('Failed to load pricing settings:', err)
        setMessage({
          type: 'danger',
          text: isAr ? 'فشل تحميل الإعدادات' : 'Failed to load settings',
        })
      } finally {
        setIsLoading(false)
      }
    }
    loadSettings()
  }, [isAr])

  const handleChange = (key: SettingsKey, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    // Clear per-field error when user starts typing
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const validateField = (key: SettingsKey, val: string): string | null => {
    const trimmed = val.trim()
    // Empty field is treated as 0 (valid)
    if (trimmed === '') return null
    const num = Number(trimmed)
    if (isNaN(num)) {
      return isAr ? 'يجب أن يكون رقماً صحيحاً' : 'Must be a valid number'
    }
    if (num < 0) {
      return isAr ? 'يجب أن تكون القيمة موجبة' : 'Must be a positive value'
    }
    if (key === 'target_profit_pct' && num > 1) {
      return isAr ? 'يجب أن تكون النسبة بين 0 و 1 (مثال: 0.20)' : 'Must be between 0 and 1 (e.g. 0.20)'
    }
    return null
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    // Validate all fields and collect errors
    const errors: FieldErrors = {}
    for (const key of PRICING_KEYS) {
      const err = validateField(key, settings[key])
      if (err) errors[key] = err
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstErrorLabel = fieldLabels[Object.keys(errors)[0] as SettingsKey]
      setMessage({
        type: 'danger',
        text: isAr
          ? `يوجد خطأ في حقل: ${firstErrorLabel} — يرجى مراجعة الحقول المُميَّزة بالأحمر أدناه`
          : `Invalid value in: ${firstErrorLabel} — Please review the fields highlighted in red below`,
      })
      return
    }

    setFieldErrors({})
    setIsSaving(true)

    // Normalize empty strings to '0' before saving
    const toSave: Record<string, string> = {}
    for (const key of PRICING_KEYS) {
      toSave[key] = settings[key].trim() === '' ? '0' : settings[key].trim()
    }

    try {
      const result = await window.api.settings.update(toSave)
      if (result && result.ok) {
        setMessage({
          type: 'success',
          text: isAr ? 'تم حفظ الإعدادات بنجاح ✓' : 'Settings saved successfully ✓',
        })
        // Refresh to confirm persisted values
        setSettings((prev) => ({ ...prev, ...toSave }))
      }
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      let msg: string = err.message || ''
      // Strip Electron IPC wrapper
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setMessage({
        type: 'danger',
        text: msg || (isAr ? 'فشل حفظ الإعدادات' : 'Failed to save settings'),
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6" noValidate>
      {message && (
        <Alert
          variant={message.type}
          title={message.type === 'success' ? (isAr ? '✓ تم الحفظ' : '✓ Saved') : (isAr ? '⚠ خطأ في التحقق' : '⚠ Validation Error')}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
            <span className="text-primary">📈</span>{' '}
            {isAr ? 'الأهداف والقدرة الاستيعابية' : 'Targets & Capacity'}
          </h2>
          <div className="space-y-3">
            <Input
              label={isAr ? 'نسبة الربح المستهدفة (0.20 = 20%)' : 'Target Profit Rate (0.20 = 20%)'}
              type="number"
              step="0.01"
              value={settings.target_profit_pct}
              onChange={(e) => handleChange('target_profit_pct', e.target.value)}
              min={0}
              max={1}
              error={fieldErrors.target_profit_pct}
            />
            <Input
              label={isAr ? 'القدرة الاستيعابية القصوى (طفل)' : 'Maximum Capacity (Children)'}
              type="number"
              value={settings.max_capacity}
              onChange={(e) => handleChange('max_capacity', e.target.value)}
              min={1}
              error={fieldErrors.max_capacity}
            />
            <Input
              label={isAr ? 'أيام العمل في الشهر' : 'Working Days in Month'}
              type="number"
              value={settings.work_days}
              onChange={(e) => handleChange('work_days', e.target.value)}
              min={1}
              max={31}
              error={fieldErrors.work_days}
            />
            <Input
              label={isAr ? 'ساعات العمل اليومية' : 'Daily Working Hours'}
              type="number"
              value={settings.work_hours}
              onChange={(e) => handleChange('work_hours', e.target.value)}
              min={1}
              max={24}
              error={fieldErrors.work_hours}
            />
          </div>
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        {isAr
          ? '💡 أسعار الخدمات (الحضانة، الإيواء، الجلسات) تُدار من تبويب «الخدمات».'
          : '💡 Service pricing (nursery, hosting, sessions) is managed on the "Services" tab.'}
      </p>

      <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
        {isSaving && (
          <span className="text-sm text-slate-500 animate-pulse">
            {isAr ? 'جارٍ الحفظ...' : 'Saving...'}
          </span>
        )}
        <Button type="submit" variant="primary" isLoading={isSaving} disabled={isSaving}>
          {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
        </Button>
      </div>
    </form>
  )
}
