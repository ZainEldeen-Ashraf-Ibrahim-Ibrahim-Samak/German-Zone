import type { ServiceType } from '../types/index.js'

/**
 * The services German Zone ships with. Service definitions live in the
 * `service_definitions` table and admins can add their own in Settings → Services,
 * so treat this as the built-in set for labelling and colouring — never as an
 * exhaustive list of what a student can be enrolled in.
 *
 * `name` is the value stored on students/payments/student_services rows.
 */
export const BUILT_IN_SERVICES: {
  name: ServiceType
  labelAr: string
  labelEn: string
  /** Tailwind background class, for legends and status pills. */
  swatch: string
  /** Hex, for SVG charts that cannot use Tailwind classes. */
  color: string
}[] = [
  { name: 'A1',            labelAr: 'A1',            labelEn: 'A1',                swatch: 'bg-teal-500',    color: '#0d9488' },
  { name: 'A2',            labelAr: 'A2',            labelEn: 'A2',                swatch: 'bg-amber-500',   color: '#f59e0b' },
  { name: 'B1',            labelAr: 'B1',            labelEn: 'B1',                swatch: 'bg-sky-500',     color: '#0ea5e9' },
  { name: 'B2',            labelAr: 'B2',            labelEn: 'B2',                swatch: 'bg-violet-500',  color: '#8b5cf6' },
  { name: 'جلسات محادثة',  labelAr: 'جلسات محادثة',  labelEn: 'Speaking Sessions', swatch: 'bg-emerald-500', color: '#10b981' },
]

export const SERVICE_NAMES: string[] = BUILT_IN_SERVICES.map((s) => s.name)

/** The per-session billing *unit*, distinct from the speaking-sessions service. */
export const SESSION_UNIT = 'جلسة'

/** True when a service is billed per session rather than per month. */
export function isSessionService(serviceName: string): boolean {
  return serviceName === 'جلسات محادثة'
}

/**
 * Display label for a stored service name. Falls back to the stored value so
 * admin-created services still render sensibly.
 */
export function serviceLabel(serviceName: string, language: string): string {
  const svc = BUILT_IN_SERVICES.find((s) => s.name === serviceName)
  if (!svc) return serviceName
  return language === 'ar' ? svc.labelAr : svc.labelEn
}

/** Tailwind swatch class for a stored service name; neutral grey when unknown. */
export function serviceSwatch(serviceName: string): string {
  return BUILT_IN_SERVICES.find((s) => s.name === serviceName)?.swatch ?? 'bg-slate-400'
}

/** Chart colour for a stored service name; neutral grey when unknown. */
export function serviceColor(serviceName: string): string {
  return BUILT_IN_SERVICES.find((s) => s.name === serviceName)?.color ?? '#cbd5e1'
}
