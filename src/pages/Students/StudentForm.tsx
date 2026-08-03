import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStudentsStore } from '../../store/useStudentsStore.js'
import { useServiceDefinitionsStore } from '../../store/useServiceDefinitionsStore.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Select } from '../../components/ui/Select.js'
import { Card } from '../../components/ui/Card.js'
import { Alert } from '../../components/ui/Alert.js'
import PhotoCapture from '../../components/PhotoCapture.js'
import type { ServiceType, UnitType, Teacher, Branch } from '../../types/index.js'
import { isSessionService } from '../../utils/services.js'


interface ServiceRow {
  id?: number // student_services.id (present in edit mode)
  service: ServiceType
  unit: UnitType
  price: number
  teacher_id: string
  lesson_days: number[]
  extra_lessons: number
  session_price: number
  // Per-student override of the teacher's per-session pay rate ("salary type per student"). Falls
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

export default function StudentForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const { addStudent, updateStudent, fetchStudents, error, clearError } = useStudentsStore()
  const { fetchServices, services: serviceDefs } = useServiceDefinitionsStore()

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    guardian: '',
    guardian_phone: '',
    student_phone: '',
    national_id: '',
    reg_date: new Date().toISOString().split('T')[0],
    notes: '',
    branch_id: '' as number | '',
    services: [{ service: 'A1' as ServiceType, unit: 'شهر' as UnitType, price: 0, teacher_id: '', lesson_days: [] as number[], extra_lessons: 0, session_price: 0, teacher_session_rate: '' as number | '' }] as ServiceRow[],
  })

  // Instalment plan — "how many payments will this family pay the fee over?". Left off entirely
  // when `installments_count` is blank, in which case billing stays purely month-by-month.
  //
  // The amount is NOT entered here: it is the price of the services enrolled above, so the plan
  // and the service price can never disagree. `override` exists only for the rare case where the
  // agreed figure differs from the list price.
  const [plan, setPlan] = useState<{ count: number | ''; override: number | ''; start_date: string }>({
    count: '',
    override: '',
    start_date: '',
  })
  const [planSchedule, setPlanSchedule] = useState<
    { seq: number; due_date: string; month: string; year: number; amount: number }[]
  >([])
  const [branches, setBranches] = useState<Branch[]>([])

  // Photo (data URL for new/changed photo; existing URL otherwise)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [teachers, setTeachers] = useState<Teacher[]>([])

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  // Starts true in edit mode so the load effect never has to set it synchronously.
  const [isLoadingStudent, setIsLoadingStudent] = useState(isEdit)
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

  // The fee the plan is built from: the price of the services enrolled on this form. Reading it
  // from the live form rows (rather than the saved record) keeps the plan in step while prices
  // are still being edited.
  const servicesFee = formData.services.reduce((sum, s) => sum + (Number(s.price) || 0), 0)
  const planTotal = plan.override !== '' && Number(plan.override) > 0 ? Number(plan.override) : servicesFee

  // Live preview of the instalment split. Computed in the main process by the same function
  // that writes the real plan, so what the admin sees here is exactly what gets saved.
  const planIsComplete = plan.count !== '' && Number(plan.count) > 0 && planTotal > 0 && !!plan.start_date
  useEffect(() => {
    if (!planIsComplete) return
    let cancelled = false
    window.api.installments
      .preview({ count: Number(plan.count), total: planTotal, start_date: plan.start_date })
      .then((rows) => { if (!cancelled) setPlanSchedule(rows) })
      .catch(() => { if (!cancelled) setPlanSchedule([]) })
    return () => { cancelled = true }
  }, [planIsComplete, plan.count, planTotal, plan.start_date])
  const schedule = planIsComplete ? planSchedule : []

  // Branch options for the "which branch is this student enrolled at" selector.
  useEffect(() => {
    window.api.branches.list().then((list: Branch[]) => setBranches(list || [])).catch(() => setBranches([]))
  }, [])

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

  // If in edit mode, load the student record
  useEffect(() => {
    if (isEdit) {
      const loadStudent = async () => {
        // Read from the store snapshot at call time (not a subscribed `students` prop) so this
        // effect doesn't need `students` as a dependency — re-running it on every store refresh
        // would clobber in-progress form edits.
        let student = useStudentsStore.getState().students.find((c) => c.id === Number(id))
        if (!student) {
          await fetchStudents()
          const currentStore = useStudentsStore.getState()
          student = currentStore.students.find((c) => c.id === Number(id))
        }

        if (student) {
          const loadedServices: ServiceRow[] = student.services && student.services.length > 0
            ? student.services.map((s: any) => {
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
              service: student.service,
              unit: student.unit,
              price: student.price,
              teacher_id: student.teacher_id != null ? String(student.teacher_id) : '',
              lesson_days: (() => {
                if (Array.isArray(student.lesson_days)) return student.lesson_days as number[]
                if (typeof student.lesson_days === 'string' && student.lesson_days) {
                  try { return JSON.parse(student.lesson_days) } catch { return [] }
                }
                return []
              })(),
              extra_lessons: student.extra_lessons ?? 0,
              session_price: student.session_price ?? 0,
              teacher_session_rate: '',
            }]

          setFormData({
            name: student.name,
            guardian: student.guardian,
            guardian_phone: student.guardian_phone,
            student_phone: student.student_phone || '',
            national_id: student.national_id || '',
            reg_date: student.reg_date,
            notes: student.notes || '',
            branch_id: student.branch_id ?? '',
            services: loadedServices,
          })
          // A stored total that differs from the enrolled service price was an explicit
          // override; one that matches is just the derived figure and stays derived.
          const enrolledFee = (student.services ?? []).reduce((sum: number, s: any) => sum + (Number(s.price) || 0), 0)
          const storedTotal = student.installment_total ?? null
          setPlan({
            count: student.installments_count ?? '',
            override: storedTotal != null && Math.abs(storedTotal - enrolledFee) > 0.009 ? storedTotal : '',
            start_date: student.installment_start_date || student.reg_date || '',
          })
          setPhoto(student.photo_url || null)
          setPhotoChanged(false)
        }
        setIsLoadingStudent(false)
      }
      loadStudent()
    }
  }, [id, isEdit, fetchStudents])

  // A session-type service ("جلسة") should default to its per-session (hourly) price, not
  // whichever other price field (monthly/daily) also happens to be set on its
  // service_definitions row — those get seeded together (migration 015) and are not mutually
  // exclusive, but a service literally named "session" isn't meant to be billed monthly by
  // default.

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

    if (!formData.name.trim()) errors.name = i18n.language === 'ar' ? 'اسم الطالب مطلوب' : 'Student name is required'
    if (!formData.guardian.trim()) errors.guardian = i18n.language === 'ar' ? 'اسم ولي الأمر مطلوب' : 'Guardian name is required'
    if (!formData.guardian_phone.trim()) {
      errors.guardian_phone = i18n.language === 'ar' ? 'رقم هاتف ولي الأمر مطلوب' : 'Guardian phone is required'
    } else if (!GUARDIAN_PHONE_RE.test(formData.guardian_phone.trim())) {
      errors.guardian_phone = i18n.language === 'ar'
        ? 'رقم هاتف غير صالح (مثال: 01012345678 أو +201012345678)'
        : 'Invalid phone format (e.g., 01012345678 or +201012345678)'
    }
    if (formData.student_phone.trim() && !GUARDIAN_PHONE_RE.test(formData.student_phone.trim())) {
      errors.student_phone = i18n.language === 'ar'
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

    // The plan is optional. Its amount comes from the enrolled services, so the only thing that
    // can be missing is a priced service to build it from.
    const hasCount = plan.count !== '' && Number(plan.count) > 0
    if (hasCount && planTotal <= 0) {
      errors.installments = i18n.language === 'ar'
        ? 'أضف خدمة لها سعر (أو أدخل مبلغاً مخصصاً) حتى يمكن تقسيم الرسوم على دفعات'
        : 'Add a priced service (or set a custom amount) so the fee can be split into instalments'
    }
    if (hasCount && (Number(plan.count) > 60 || !Number.isInteger(Number(plan.count)))) {
      errors.installments = i18n.language === 'ar'
        ? 'عدد الدفعات يجب أن يكون رقماً صحيحاً بين 1 و 60'
        : 'Number of instalments must be a whole number between 1 and 60'
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

  const handleStudentPhoneChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d+]/g, '')
    const startsWithPlus = cleaned.startsWith('+')
    const digitsOnly = cleaned.replace(/\+/g, '')
    const finalVal = (startsWithPlus ? '+' : '') + digitsOnly.slice(0, 12)
    setFormData((prev) => ({ ...prev, student_phone: finalVal.slice(0, 13) }))
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

      // Step 2: save student record
      setSubmitStep('saving')
      const payload: any = {
        name: formData.name.trim(),
        guardian: formData.guardian.trim(),
        guardian_phone: formData.guardian_phone.trim(),
        student_phone: formData.student_phone.trim() || null,
        national_id: formData.national_id.trim() || null,
        reg_date: formData.reg_date,
        notes: formData.notes.trim() || null,
        branch_id: formData.branch_id === '' ? null : Number(formData.branch_id),
        // A blank count means "no plan" — on edit that also clears any existing schedule.
        installments_count: plan.count === '' ? null : Number(plan.count),
        // The plan amount is the enrolled service fee unless explicitly overridden.
        installment_total: plan.count === '' ? null : planTotal,
        installment_start_date: plan.start_date || formData.reg_date,
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
        const result = await updateStudent(Number(id), payload)
        if (result) saved = true
      } else {
        const result = await addStudent(payload)
        if (result) saved = true
      }

      if (saved) {
        if (uploadFailed) {
          // Show notice briefly then navigate
          setPhotoNotice(i18n.language === 'ar' ? 'فشل رفع الصورة — تم الحفظ محلياً' : 'Photo upload failed — saved locally')
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        navigate('/students')
      }
    } catch (err) {
      console.error('Submit student failed:', err)
    } finally {
      setIsSubmitting(false)
      setSubmitStep('idle')
    }
  }

  if (isLoadingStudent) {
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
          {isEdit ? t('edit_student') : t('add_student')}
        </h1>
        <Button variant="outline" onClick={() => navigate('/students')}>
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
                {t('student_name')} <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                error={formErrors.name}
                placeholder={i18n.language === 'ar' ? 'أدخل اسم الطالب كاملاً' : 'Enter student\'s full name'}
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
                {t('student_phone')} <span className="text-xs text-slate-400 font-normal">({t('optional')})</span>
              </label>
              <Input
                value={formData.student_phone}
                onChange={(e) => handleStudentPhoneChange(e.target.value)}
                error={formErrors.student_phone}
                inputMode="tel"
                maxLength={13}
                placeholder={t('student_phone_placeholder')}
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
                placeholder={i18n.language === 'ar' ? 'الرقم القومي للطالب' : 'National ID'}
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

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">
                {i18n.language === 'ar' ? 'الفرع' : 'Branch'}
              </label>
              <Select
                value={formData.branch_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, branch_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                options={[
                  { value: '', label: i18n.language === 'ar' ? 'بدون فرع' : 'No branch' },
                  ...branches.map((b) => ({
                    value: b.id,
                    label: `${b.kind === 'online' ? '🌐' : '🏢'} ${b.name}`,
                  })),
                ]}
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

                      {/* Row 2b: Salary type per student — overrides what THIS teacher earns for
                          THIS student specifically (separate from session_price, which is what the
                          family is billed). Only meaningful once a teacher is assigned. */}
                      {row.teacher_id && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-500">
                              {ar ? 'تكلفة الجلسة لهذا المعلم (اختياري)' : "Teacher's Rate For This Student (optional)"}
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
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${active
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


          {/* Instalment plan — how many payments the fee is split into, and when each falls due.
              Each instalment carries its own due date, so a month only ever shows the amount
              actually due in it instead of the whole outstanding fee as one lump of arrears. */}
          <div className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between">
              <label className="text-lg font-bold text-slate-800">
                {i18n.language === 'ar' ? 'خطة الدفعات' : 'Instalment Plan'}
              </label>
              <span className="text-xs text-slate-400 font-semibold">
                {i18n.language === 'ar' ? 'اختياري' : 'Optional'}
              </span>
            </div>

            {formErrors.installments && (
              <p className="text-sm text-red-500 font-medium">{formErrors.installments}</p>
            )}

            {/* The amount is the enrolled service fee — shown, not typed, so the plan can never
                disagree with the price above and end up billing the family twice. */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">
                  {i18n.language === 'ar' ? 'الرسوم من الخدمات المسجّلة' : 'Fee from enrolled services'}
                </span>
                <span className="text-base font-bold text-slate-900">{formatCurrency(servicesFee)}</span>
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                {formData.services.map((s, i) => (
                  <span key={i}>
                    {i > 0 && ' + '}
                    {s.service} ({formatCurrency(Number(s.price) || 0)})
                  </span>
                ))}
              </div>
              {plan.count !== '' && (
                <p className="text-[11px] text-slate-500 border-t border-primary/15 pt-2">
                  {i18n.language === 'ar'
                    ? 'هذه الرسوم تُحصَّل عبر الدفعات فقط — لن تُضاف مرة أخرى كفاتورة شهرية للخدمة.'
                    : 'This fee is collected through the instalments only — it is not billed again as a monthly service charge.'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  {i18n.language === 'ar' ? 'عدد الدفعات' : 'Number of instalments'}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={plan.count}
                  placeholder={i18n.language === 'ar' ? 'مثال: 4' : 'e.g. 4'}
                  onChange={(e) => setPlan((prev) => ({
                    ...prev,
                    count: e.target.value === '' ? '' : Math.max(1, Number(e.target.value)),
                    // Default the first due date to the registration date the moment a plan starts.
                    start_date: prev.start_date || formData.reg_date,
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  {i18n.language === 'ar' ? 'تاريخ أول دفعة' : 'First instalment due'}
                </label>
                <Input
                  type="date"
                  value={plan.start_date || formData.reg_date}
                  onChange={(e) => setPlan((prev) => ({ ...prev, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  {i18n.language === 'ar' ? 'مبلغ مخصص (اختياري)' : 'Custom amount (optional)'}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={plan.override}
                  placeholder={formatCurrency(servicesFee)}
                  onChange={(e) => setPlan((prev) => ({ ...prev, override: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) }))}
                />
              </div>
            </div>

            {schedule.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center justify-between">
                  <span>
                    {i18n.language === 'ar'
                      ? `جدول السداد — ${schedule.length} دفعات`
                      : `Payment schedule — ${schedule.length} instalments`}
                  </span>
                  {plan.override !== '' && (
                    <span className="text-amber-600 normal-case font-semibold">
                      {i18n.language === 'ar' ? 'مبلغ مخصص' : 'Custom amount'}
                    </span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {schedule.map((row) => (
                    <div key={row.seq} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-slate-500 font-semibold w-10">#{row.seq}</span>
                      <span className="flex-1 text-slate-700">
                        {i18n.language === 'ar' ? `${row.month} ${row.year}` : `${row.month} ${row.year}`}
                      </span>
                      <span className="text-slate-400 text-xs w-28 text-center">{row.due_date}</span>
                      <span className="font-bold text-slate-800 w-28 text-end">{formatCurrency(row.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600">
                    {i18n.language === 'ar' ? 'الإجمالي' : 'Total'}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(schedule.reduce((sum, r) => sum + r.amount, 0))}
                  </span>
                </div>
              </div>
            )}
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
          <Button type="button" variant="outline" onClick={() => navigate('/students')} disabled={isSubmitting}>
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
