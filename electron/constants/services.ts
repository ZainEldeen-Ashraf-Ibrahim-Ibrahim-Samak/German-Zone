/**
 * Built-in German Zone services (main-process copy of src/utils/services.ts).
 *
 * `service_definitions` remains the runtime source of truth — admins add and price
 * services in Settings → Services — so this list is only for defaults, seeding and
 * the fixed reporting breakdowns that previously hard-coded the nursery services.
 */

export const A1 = 'A1'
export const A2 = 'A2'
export const B1 = 'B1'
export const B2 = 'B2'
export const SPEAKING = 'جلسات محادثة'

export const SERVICE_NAMES: string[] = [A1, A2, B1, B2, SPEAKING]

/** The per-session billing *unit*, distinct from the speaking-sessions service. */
export const SESSION_UNIT = 'جلسة'

/** True when a service is billed per session rather than per month. */
export function isSessionService(serviceName: string): boolean {
  return serviceName === SPEAKING
}

/**
 * Share of total capacity each service gets in the "recommended mix" target
 * scenario. Weighted towards the entry levels, which carry the most enrolments.
 * Must sum to 1.
 */
export const RECOMMENDED_MIX_WEIGHTS: [string, number][] = [
  [A1, 0.30],
  [A2, 0.25],
  [B1, 0.20],
  [B2, 0.15],
  [SPEAKING, 0.10],
]
