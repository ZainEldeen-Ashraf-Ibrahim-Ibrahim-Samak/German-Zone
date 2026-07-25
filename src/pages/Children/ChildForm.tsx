import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useChildrenStore } from '../../store/useChildrenStore.js'
import { useServiceDefinitionsStore } from '../../store/useServiceDefinitionsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Card } from '../../components/ui/Card.js'
import { Alert } from '../../components/ui/Alert.js'
import PhotoCapture from '../../components/PhotoCapture.js'
import type { ServiceType, UnitType, Teacher } from '../../types/index.js'


interface ServiceRow {
  id?: number // child_services.id (present in edit mode)
  service: ServiceType
  unit: UnitType
  price: number
  teacher_id: string
  lesson_days: number[]
  extra_lessons: number
  session_price: number
  // Per-child override of the teacher's per-session pay rate ("salary type per child"). Falls
  // back to the teacher's own rate, then their salary type's rate, when left blank.
  teacher_session_rate: number | ''
}

// Egyptian mobile: starts with 01, optionally prefixed by 2 or +2 (feature 004, FR-001).
const GUARDIAN_PHONE_RE = /^(?:\+?2)?01[0-9]{9}$/
// Weekday keys in JS getDay() order (0 = Sunday … 6 = Saturday).
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/**
 * Live, read-only preview of the remaining scheduled sessions and expected charge for this
 * service row, using the row's selected unit price (FR-002/FR-003). Monthly units are a flat
 * subscription, so the monthly price is shown as-is; per-day/hour/session units multiply the
 * unit price by the scheduled occurrences of the lesson days from today (inclusive) through the
 * end of the current calendar month.
 */
function ServiceCostPreview({ lessonDays, unit, price, isAr }: { lessonDays: number[]; unit: UnitType; price: number; isAr: boolean }) {
  if (lessonDays.length === 0) return null

  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let total = 0
  for (let d = today.getDate(); d <= daysInMonth; d++) {
    if (lessonDays.includes(new Date(year, month, d).getDay())) total++
  }

  const unitPrice = Number(price) || 0
  const isMonthly = unit === 'شهر'
  const expected = isMonthly ? unitPrice : Number((total * unitPrice).toFixed(2))

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
      <span>
        {isAr
          ? `الجلسات المتبقية هذا الشهر: ${total}${isMonthly ? '' : ` × ${unitPrice} ج.م`}`
          : `Remaining sessions this month: ${total}${isMonthly ? '' : ` × ${unitPrice} EGP`}`}
      </span>
      <span className="font-bold text-slate-800">
        {isAr ? `التكلفة المتوقعة: ${expected} ج.م` : `Expected cost: ${expected} EGP`}
      </span>
    </div>
  )
}

/**
 * Teacher dropdown scoped to the service's configured teacher roster (FR-006/FR-007), falling
 * back to the full teacher list when the service has no `service_teachers` rows configured yet
 * (preserves existing behavior for legacy/unrestricted services).
 */
function ScopedTeacherSelect({
  serviceId, allTeachers, value, onChange, noTeacherLabel
}: { serviceId: number | undefined; allTeachers: Teacher[]; value: string; onChange: (v: string) => void; noTeacherLabel: string }) {
  // Roster is keyed by the service it was fetched for, so switching services (or clearing the
  // selection) invalidates it by derivation — no synchronous setState reset inside the effect.
  const [roster, setRoster] = useState<{ serviceId: number; list: Teacher[] } | null>(null)

  useEffect(() => {
    if (!serviceId) return
    let cancelled = false
    window.api.serviceTeachers.list(serviceId).then((list: Teacher[]) => {
      if (!cancelled) setRoster({ serviceId, list: list ?? [] })
    }).catch(() => { if (!cancelled) setRoster({ serviceId, list: [] }) })
    return () => { cancelled = true }
  }, [serviceId])

  const scoped = serviceId && roster?.serviceId === serviceId && roster.list.length > 0 ? roster.list : null
  const options = scoped ?? allTeachers

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: '', label: noTeacherLabel },
        ...options.map((tch) => ({ value: String(tch.id), label: tch.name })),
      ]}
    />
  )
}

export default function ChildForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const { addChild, updateChild, fetchChildren, error, clearError } = useChildrenStore()
  const { fetchServices, services: serviceDefs } = useServiceDefinitionsStore()

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    guardian: '',
    guardian_phone: '',
    child_phone: '',
    national_id: '',
    reg_date: new Date().toISOString().split('T')[0],
    notes: '',
    services: [{ service: 'حضانة' as ServiceType, unit: 'شهر' as UnitType, price: 0, teacher_id: '', lesson_days: [] as number[], extra_lessons: 0, session_price: 0, teacher_session_rate: '' as number | '' }] as ServiceRow[],
  })

  // Photo (data URL for new/changed photo; existing URL otherwise)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [teachers, setTeachers] = useState<Teacher[]>([])

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  // Starts true in edit mode so the load effect never has to set it synchronously.
  const [isLoadingChild, setIsLoadingChild] = useState(isEdit)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStep, setSubmitStep] = useState<'idle' | 'uploading' | 'saving'>('idle')
  const [photoNotice, setPhotoNotice] = useState<string | null>(null)
  const [proRateResult, setProRateResult] = useState<{ remaining_sessions: number; total_sessions: number; prorated_amount: number; days_remaining: number; days_in_month: number } | null>(null)

  // Fetch service definitions (Settings → Services — the single source of truth for pricing),
  // then auto-apply prices to service rows still at price=0. Done in the fetch callback rather
  // than a serviceDefs-watching effect so no setState runs synchronously inside an effect body.
  useEffect(() => {
    fetchServices().then(() => {
      const defs = useServiceDefinitionsStore.getState().services
      if (defs.length === 0) return
      setFormData(prev => ({
        ...prev,
        services: prev.services.map(row => {
          if (row.price > 0) return row
          const svcDef = defs.find(d =>
            d.name === row.service || d.name.toLowerCase() === (row.service as string).toLowerCase()
          )
          let resolved = 0
          if (svcDef) {
            if (row.unit === 'شهر' && svcDef.price_monthly != null) resolved = svcDef.price_monthly
            else if (row.unit === 'يوم' && svcDef.price_daily != null) resolved = svcDef.price_daily
            else if ((row.unit === 'ساعة' || row.unit === 'جلسة') && svcDef.price_hourly != null) resolved = svcDef.price_hourly
          }
          return resolved > 0 ? { ...row, price: resolved } : row
        })
      }))
    })
  }, [fetchServices])

  // Pro-rate calculation — uses first service row's session_price, re-runs when date/services
  // change. Applicability is derived at render time so the effect only ever sets state from the
  // IPC callback (never synchronously), and stale results are masked by derivation instead of a
  // reset-to-null inside the effect.
  const proRatePricePerSession = formData.services.reduce((acc: number, r) => acc || Number(r.session_price), 0)
  const proRateApplicable = !isEdit && !!formData.reg_date && proRatePricePerSession > 0
    && new Date(formData.reg_date).getDate() !== 1
  useEffect(() => {
    if (!proRateApplicable) return
    let cancelled = false
    window.api.sessions.proRateCalc({ reg_date: formData.reg_date, price_per_session: proRatePricePerSession })
      .then((r: any) => { if (!cancelled) setProRateResult(r) })
      .catch(() => { if (!cancelled) setProRateResult(null) })
    return () => { cancelled = true }
  }, [proRateApplicable, formData.reg_date, proRatePricePerSession])
  const proRate = proRateApplicable ? proRateResult : null

  // Pro-rate session baseline (kept for pro-rate notice display; per-row session_price drives actual fees)
  const sessionsBaseline = proRate?.total_sessions && proRate.total_sessions > 0 ? proRate.total_sessions : 8

  // Load the teacher options (from the Employees list, feature 004)
  useEffect(() => {
    async function loadTeachers() {
      try {
        const list = await window.api.teachers.list()
        setTeachers(list || [])
      } catch (err) {
        console.error('Failed to load teachers:', err)
      }
    }
    loadTeachers()
  }, [])

  // If in edit mode, load the child record
  useEffect(() => {
    if (isEdit) {
      const loadChild = async () => {
        // Read from the store snapshot at call time (not a subscribed `children` prop) so this
        // effect doesn't need `children` as a dependency — re-running it on every store refresh
        // would clobber in-progress form edits.
        let child = useChildrenStore.getState().children.find((c) => c.id === Number(id))
        if (!child) {
          await fetchChildren()
          const currentStore = useChildrenStore.getState()
          child = currentStore.children.find((c) => c.id === Number(id))
        }

        if (child) {
          const loadedServices: ServiceRow[] = child.services && child.services.length > 0
            ? child.services.map((s: any) => {
                let days: number[] = []
                if (Array.isArray(s.lesson_days)) days = s.lesson_days as number[]
                else if (typeof s.lesson_days === 'string' && s.lesson_days) {
                  try { days = JSON.parse(s.lesson_days) } catch { days = [] }
                }
                return {
                  id: s.id,
                  service: s.service,
                  unit: s.unit,
                  price: s.price,
                  teacher_id: s.teacher_id != null ? String(s.teacher_id) : '',
                  lesson_days: days,
                  extra_lessons: s.extra_lessons ?? 0,
                  session_price: s.session_price ?? 0,
                  teacher_session_rate: s.teacher_session_rate ?? '',
                }
              })
            : [{
                id: undefined,
                service: child.service,
                unit: child.unit,
                price: child.price,
                teacher_id: child.teacher_id != null ? String(child.teacher_id) : '',
                lesson_days: (() => {
                  if (Array.isArray(child.lesson_days)) return child.lesson_days as number[]
                  if (typeof child.lesson_days === 'string' && child.lesson_days) {
                    try { return JSON.parse(child.lesson_days) } catch { return [] }
                  }
                  return []
                })(),
                extra_lessons: child.extra_lessons ?? 0,
                session_price: child.session_price ?? 0,
                teacher_session_rate: '',
              }]

          setFormData({
            name: child.name,
            guardian: child.guardian,
            guardian_phone: child.guardian_phone,
            child_phone: child.child_phone || '',
            national_id: child.national_id || '',
            reg_date: child.reg_date,
            notes: child.notes || '',
            services: loadedServices,
          })
          setPhoto(child.photo_url || null)
          setPhotoChanged(false)
        }
        setIsLoadingChild(false)
      }
      loadChild()
    }
  }, [id, isEdit, fetchChildren])

  // A session-type service ("جلسة") should default to its per-session (hourly) price, not
  // whichever other price field (monthly/daily) also happens to be set on its
  // service_definitions row — those get seeded together (migration 015) and are not mutually
  // exclusive, but a service literally named "session" isn't meant to be billed monthly by
  // default.
  const isSessionService = (serviceName: string) => serviceName === 'جلسة' || serviceName === 'جلسه'

  // Returns available unit options for a given service name based on which prices are defined
  // on that service's definition (Settings → Services) — exactly one unit per configured price
  // field (month/day/hour), read directly from there. No separate "session" unit is added on
  // top of "hour": they would just duplicate the same price_hourly value under two labels.
  // Ordered so the FIRST option matches that service's natural billing unit — this order also
  // drives the default selection in handleAddService/handleServiceChange below, so it must stay
  // in sync with those.
  const getUnitOptions = (serviceName: string) => {
    const svcDef = serviceDefs.find(d => d.name === serviceName)
    if (!svcDef) return []
    const opts: { value: UnitType; label: string }[] = []
    const pushMonthly = () => { if (svcDef.price_monthly != null) opts.push({ value: 'شهر', label: t('units.month') }) }
    const pushDaily = () => { if (svcDef.price_daily != null) opts.push({ value: 'يوم', label: t('units.day') }) }
    const pushHourly = () => { if (svcDef.price_hourly != null) opts.push({ value: 'ساعة', label: t('units.hour') }) }
    if (isSessionService(serviceName)) {
      // Hourly-priced first (the per-session rate), then the less-specific monthly/daily
      // fallbacks — never a separate "session" unit duplicating the same price field.
      pushHourly(); pushMonthly(); pushDaily()
    } else {
      pushMonthly(); pushDaily(); pushHourly()
    }
    return opts
  }

  const handleAddService = () => {
    const svcName = serviceDefs[0]?.name as ServiceType | undefined
    if (!svcName) return
    const unitOpts = getUnitOptions(svcName)
    const defaultUnit = unitOpts[0]?.value ?? 'شهر'
    setFormData(prev => ({
      ...prev,
      services: [...prev.services, { service: svcName, unit: defaultUnit, price: 0, teacher_id: '', lesson_days: [] as number[], extra_lessons: 0, session_price: 0, teacher_session_rate: '' as number | '' }]
    }))
  }

  const handleRemoveService = (index: number) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }))
  }

  const handleServiceChange = (index: number, field: keyof ServiceRow, value: any) => {
    setFormData(prev => {
      const newServices = [...prev.services]
      const row = { ...newServices[index], [field]: value }

      // Auto-reset unit to that service's natural default when service changes — must match
      // getUnitOptions' ordering above, or the selected unit/price won't match what admins
      // actually configured for that service in Settings → Services.
      if (field === 'service') {
        const opts = getUnitOptions(value)
        if (opts[0]) row.unit = opts[0].value
      }

      // Auto-price if service or unit changes
      if (field === 'service' || field === 'unit') {
        // First try service_definitions table (dynamic, admin-managed)
        const currentServiceDefs = useServiceDefinitionsStore.getState().services
        const svcDef = currentServiceDefs.find((d) =>
          d.name === row.service || d.name.toLowerCase() === (row.service as string).toLowerCase()
        )
        let resolved = 0
        if (svcDef) {
          if (row.unit === 'شهر' && svcDef.price_monthly != null) resolved = svcDef.price_monthly
          else if (row.unit === 'يوم' && svcDef.price_daily != null) resolved = svcDef.price_daily
          else if ((row.unit === 'ساعة' || row.unit === 'جلسة') && svcDef.price_hourly != null) resolved = svcDef.price_hourly
        }
        if (resolved > 0) row.price = resolved
      }

      newServices[index] = row
      return { ...prev, services: newServices }
    })
  }

  const toggleServiceLessonDay = (index: number, day: number) => {
    setFormData(prev => {
      const newServices = [...prev.services]
      const row = { ...newServices[index] }
      row.lesson_days = row.lesson_days.includes(day)
        ? row.lesson_days.filter(d => d !== day)
        : [...row.lesson_days, day].sort((a, b) => a - b)
      newServices[index] = row
      return { ...prev, services: newServices }
    })
  }

  // Form Validation
  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) errors.name = i18n.language === 'ar' ? 'اسم الطفل مطلوب' : 'Child name is required'
    if (!formData.guardian.trim()) errors.guardian = i18n.language === 'ar' ? 'اسم ولي الأمر مطلوب' : 'Guardian name is required'
    if (!formData.guardian_phone.trim()) {
      errors.guardian_phone = i18n.language === 'ar' ? 'رقم هاتف ولي الأمر مطلوب' : 'Guardian phone is required'
    } else if (!GUARDIAN_PHONE_RE.test(formData.guardian_phone.trim())) {
      errors.guardian_phone = i18n.language === 'ar'
        ? 'رقم هاتف غير صالح (مثال: 01012345678 أو +201012345678)'
        : 'Invalid phone format (e.g., 01012345678 or +201012345678)'
    }
    if (formData.child_phone.trim() && !GUARDIAN_PHONE_RE.test(formData.child_phone.trim())) {
      errors.child_phone = i18n.language === 'ar'
        ? 'رقم هاتف غير صالح (مثال: 01012345678 أو +201012345678)'
        : 'Invalid phone format (e.g., 01012345678 or +201012345678)'
    }

    if (formData.national_id.trim() && !/^[0-9]{14}$/.test(formData.national_id)) {
      errors.national_id = i18n.language === 'ar' ? 'الرقم القومي يجب أن يتكون من 14 رقماً' : 'National ID must be exactly 14 digits'
    }
    if (!formData.reg_date) {
      errors.reg_date = i18n.language === 'ar' ? 'تاريخ التسجيل مطلوب' : 'Registration date is required'
    }

    if (formData.services.length === 0) {
      errors.services = i18n.language === 'ar' ? 'يجب اختيار خدمة واحدة على الأقل' : 'At least one service is required'
    } else {
      let invalidPrice = false
      for (const s of formData.services) {
        if (s.price < 0) invalidPrice = true
      }
      if (invalidPrice) errors.services = i18n.language === 'ar' ? 'السعر لا يمكن أن يكون سالباً' : 'Price cannot be negative'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Allow digits and '+' at the start, up to 13 chars total
  const handleGuardianPhoneChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d+]/g, '')
    const startsWithPlus = cleaned.startsWith('+')
    const digitsOnly = cleaned.replace(/\+/g, '')
    const finalVal = (startsWithPlus ? '+' : '') + digitsOnly.slice(0, 12)
    setFormData((prev) => ({ ...prev, guardian_phone: finalVal.slice(0, 13) }))
  }

  const handleChildPhoneChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d+]/g, '')
    const startsWithPlus = cleaned.startsWith('+')
    const digitsOnly = cleaned.replace(/\+/g, '')
    const finalVal = (startsWithPlus ? '+' : '') + digitsOnly.slice(0, 12)
    setFormData((prev) => ({ ...prev, child_phone: finalVal.slice(0, 13) }))
  }

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setPhotoNotice(null)

    if (!validateForm()) return

    setIsSubmitting(true)
    let uploadFailed = false
    try {
      // Step 1: upload photo if changed
      let photo_url: string | null | undefined = undefined
      let photo_public_id: string | null | undefined = undefined
      if (photoChanged) {
        if (photo) {
          setSubmitStep('uploading')
          try {
            const uploaded = await window.api.storage.uploadPhoto({ dataUrl: photo })
            photo_url = uploaded.url
            photo_public_id = uploaded.publicId
          } catch (err) {
            console.warn('Photo upload failed, storing locally:', err)
            uploadFailed = true
            photo_url = photo
            photo_public_id = null
          }
        } else {
          photo_url = null
          photo_public_id = null
        }
      }

      // Step 2: save child record
      setSubmitStep('saving')
      const payload: any = {
        name: formData.name.trim(),
        guardian: formData.guardian.trim(),
        guardian_phone: formData.guardian_phone.trim(),
        child_phone: formData.child_phone.trim() || null,
        national_id: formData.national_id.trim() || null,
        reg_date: formData.reg_date,
        notes: formData.notes.trim() || null,
        services: formData.services.map(s => ({
          id: s.id,
          service: s.service,
          unit: s.unit,
          price: s.price,
          teacher_id: s.teacher_id || null,
          lesson_days: s.lesson_days,
          extra_lessons: Number(s.extra_lessons) || 0,
          session_price: Number(s.session_price) || 0,
          teacher_session_rate: s.teacher_session_rate !== '' ? Number(s.teacher_session_rate) : null,
        })),
        // Backward compat: set global fields from first row that has teacher/days
        teacher_id: formData.services.find(s => s.teacher_id)?.teacher_id || null,
        lesson_days: formData.services.find(s => s.lesson_days.length > 0)?.lesson_days || [],
        sessions_baseline: sessionsBaseline,
        extra_lessons: 0,
        session_price: formData.services.reduce((acc, s) => acc || s.session_price, 0) || 0,
      }
      if (photo_url !== undefined) {
        payload.photo_url = photo_url
        payload.photo_public_id = photo_public_id
      }

      let saved = false
      if (isEdit) {
        const result = await updateChild(Number(id), payload)
        if (result) saved = true
      } else {
        const result = await addChild(payload)
        if (result) saved = true
      }

      if (saved) {
        if (uploadFailed) {
          // Show notice briefly then navigate
          setPhotoNotice(i18n.language === 'ar' ? 'فشل رفع الصورة — تم الحفظ محلياً' : 'Photo upload failed — saved locally')
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        navigate('/children')
      }
    } catch (err) {
      console.error('Submit child failed:', err)
    } finally {
      setIsSubmitting(false)
      setSubmitStep('idle')
    }
  }

  if (isLoadingChild) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency', currency: 'EGP', maximumFractionDigits: 0,
    }).format(val)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">
          {isEdit ? t('edit_child') : t('add_child')}
        </h1>
        <Button variant="outline" onClick={() => navigate('/children')}>
          {t('back_to_list')}
        </Button>
      </div>

      {error && (
        <Alert variant="danger" title={t('error')} onClose={clearError}>
          {error}
        </Alert>
      )}

      {photoNotice && (
        <Alert variant="warning" title={t('photo')} onClose={() => setPhotoNotice(null)}>
          {photoNotice}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-6">
          {/* Photo */}
          <PhotoCapture
            value={photo}
            onChange={(d) => { setPhoto(d); setPhotoChanged(true) }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('child_name')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                error={formErrors.name}
                placeholder={i18n.language === 'ar' ? 'أدخل اسم الطفل كاملاً' : 'Enter child\'s full name'}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('guardian')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.guardian}
                onChange={(e) => setFormData((prev) => ({ ...prev, guardian: e.target.value }))}
                error={formErrors.guardian}
                placeholder={i18n.language === 'ar' ? 'أدخل اسم ولي الأمر' : 'Enter guardian\'s name'}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('guardian_phone')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.guardian_phone}
                onChange={(e) => handleGuardianPhoneChange(e.target.value)}
                error={formErrors.guardian_phone}
                inputMode="tel"
                maxLength={13}
                placeholder={t('guardian_phone_placeholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('child_phone')} <span className="text-xs text-slate-400 font-normal">({t('optional')})</span>
              </label>
              <Input
                value={formData.child_phone}
                onChange={(e) => handleChildPhoneChange(e.target.value)}
                error={formErrors.child_phone}
                inputMode="tel"
                maxLength={13}
                placeholder={t('child_phone_placeholder')}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('national_id')} <span className="text-xs text-slate-400 font-normal">({t('digits_optional')})</span>
              </label>
              <Input
                value={formData.national_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, national_id: e.target.value }))}
                error={formErrors.national_id}
                maxLength={14}
                placeholder={i18n.language === 'ar' ? 'الرقم القومي للطفل' : 'National ID'}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {t('reg_date')} <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={formData.reg_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, reg_date: e.target.value }))}
                error={formErrors.reg_date}
              />
            </div>
          </div>

          {/* Pro-rated first payment notice (US6) */}
          {!isEdit && proRate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <p className="font-semibold text-amber-800 mb-1">
                {i18n.language === 'ar' ? 'دفعة أول شهر (محسوبة تناسبياً)' : 'First Month — Pro-rated Payment'}
              </p>
              <p className="text-amber-700">
                {i18n.language === 'ar'
                  ? `الجلسات المتبقية في الشهر: ${proRate.remaining_sessions} من ${proRate.total_sessions}`
                  : `Remaining sessions this month: ${proRate.remaining_sessions} of ${proRate.total_sessions}`}
              </p>
              <p className="text-amber-900 font-bold mt-1">
                {i18n.language === 'ar' ? 'المبلغ المقترح: ' : 'Suggested amount: '}
                {new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(proRate.prorated_amount)}
              </p>
            </div>
          )}

          {/* Enrolled Services — each row includes service, unit, price, teacher & lesson days */}
          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between">
              <label className="text-lg font-bold text-slate-800">
                {t('enrolled_services')}
              </label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddService}>
                <span className="ml-1">➕</span>
                {t('add_service')}
              </Button>
            </div>

            {formErrors.services && (
              <p className="text-sm text-red-500 font-medium">{formErrors.services}</p>
            )}

            <div className="space-y-4">
              {formData.services.map((row, index) => {
                const unitOptions = getUnitOptions(row.service)
                const ar = i18n.language === 'ar'

                return (
                  <div key={index} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                        {ar ? `خدمة ${index + 1}` : `Service ${index + 1}`}
                      </span>
                      {formData.services.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto text-xs"
                          onClick={() => handleRemoveService(index)}
                        >
                          🗑️ {ar ? 'حذف' : 'Remove'}
                        </Button>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Row 1: Service / Unit / Price */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('service')}</label>
                          <Select
                            value={row.service}
                            onChange={(e) => handleServiceChange(index, 'service', e.target.value)}
                            options={serviceDefs.map(d => ({ value: d.name, label: d.name }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('unit')}</label>
                          <Select
                            value={row.unit}
                            onChange={(e) => handleServiceChange(index, 'unit', e.target.value)}
                            options={unitOptions}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('price')} (EGP)</label>
                          <Input
                            type="number"
                            min={0}
                            value={row.price}
                            onChange={(e) => handleServiceChange(index, 'price', Number(e.target.value))}
                          />
                        </div>
                      </div>

                      {/* Row 2: Teacher / Extra lessons / Session price */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('teacher')}</label>
                          <ScopedTeacherSelect
                            serviceId={serviceDefs.find(d => d.name === row.service)?.id}
                            allTeachers={teachers}
                            value={row.teacher_id}
                            onChange={(v) => handleServiceChange(index, 'teacher_id', v)}
                            noTeacherLabel={t('no_teacher')}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('extra_lessons')}</label>
                          <Input
                            type="number"
                            min={0}
                            value={row.extra_lessons}
                            onChange={(e) => handleServiceChange(index, 'extra_lessons', Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-500">{t('session_price')} (EGP)</label>
                          <Input
                            type="number"
                            min={0}
                            value={row.session_price}
                            onChange={(e) => handleServiceChange(index, 'session_price', Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                      </div>

                      {/* Row 2b: Salary type per child — overrides what THIS teacher earns for
                          THIS child specifically (separate from session_price, which is what the
                          family is billed). Only meaningful once a teacher is assigned. */}
                      {row.teacher_id && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">
                              {ar ? 'تكلفة الجلسة لهذا المعلم (اختياري)' : "Teacher's Rate For This Child (optional)"}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={row.teacher_session_rate}
                              placeholder={ar ? 'افتراضي: سعر جلسة المعلم' : "Default: teacher's own rate"}
                              onChange={(e) => handleServiceChange(index, 'teacher_session_rate', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                            />
                          </div>
                        </div>
                      )}

                      {/* Row 3: Lesson days */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">{t('lesson_days')}</label>
                        <div className="flex flex-wrap gap-1.5">
                          {DAY_KEYS.map((key, dayIdx) => {
                            const active = row.lesson_days.includes(dayIdx)
                            return (
                              <button
                                type="button"
                                key={key}
                                onClick={() => toggleServiceLessonDay(index, dayIdx)}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                                  active
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {t(`days.${key}`)}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Live remaining-sessions / expected service cost preview (FR-002/FR-003) */}
                      <ServiceCostPreview lessonDays={row.lesson_days} unit={row.unit} price={Number(row.price)} isAr={ar} />

                      {/* Session fee summary for this row (if session_price > 0) */}
                      {Number(row.session_price) > 0 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 flex items-center justify-between">
                          <span>
                            {ar
                              ? `${sessionsBaseline + Number(row.extra_lessons)} جلسة × ${row.session_price} ج.م`
                              : `${sessionsBaseline + Number(row.extra_lessons)} sessions × ${row.session_price} EGP`}
                          </span>
                          <span className="font-bold text-slate-800">
                            {formatCurrency((sessionsBaseline + Number(row.extra_lessons)) * Number(row.session_price))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>


          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">
              {t('notes')}
            </label>
            <textarea
              rows={4}
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              className="block w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-start text-sm shadow-sm transition-all"
              placeholder={i18n.language === 'ar' ? 'ملاحظات إضافية...' : 'Any additional notes...'}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3 items-center">
          {submitStep === 'uploading' && (
            <span className="text-sm text-slate-500 animate-pulse">
              {i18n.language === 'ar' ? 'جارٍ رفع الصورة...' : 'Uploading photo...'}
            </span>
          )}
          {submitStep === 'saving' && (
            <span className="text-sm text-slate-500 animate-pulse">
              {i18n.language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...'}
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => navigate('/children')} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
