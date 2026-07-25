/**
 * Cleans up a raw error thrown across the Electron IPC boundary into a message safe to show
 * directly to a user, e.g.:
 *   "Error invoking remote method 'sessions:delete': Error: FORBIDDEN: غير مسموح.. / Forbidden"
 *   → "غير مسموح.. / Forbidden"
 * Strips the IPC wrapper text and any leading machine-readable error code (FORBIDDEN:,
 * UNAUTHORIZED:, etc.) that main-process guards (_guard.ts) prefix their messages with.
 */
export function friendlyError(err: unknown, fallback = 'حدث خطأ غير متوقع / An unexpected error occurred'): string {
  let msg = (err instanceof Error ? err.message : String(err ?? '')).trim()
  if (!msg) return fallback

  // Strip the Electron IPC wrapper, however many times it's nested.
  const ipcWrapper = /^Error invoking remote method '[^']+':\s*/
  while (ipcWrapper.test(msg)) {
    msg = msg.replace(ipcWrapper, '').trim()
  }
  // A bare leading "Error: " (from the underlying thrown Error's own toString) survives the
  // above if the wrapper regex didn't match it directly.
  msg = msg.replace(/^Error:\s*/, '').trim()

  // Strip a leading machine-readable code the backend guards prefix onto auth errors, e.g.
  // "FORBIDDEN: غير مسموح.. / Forbidden" → "غير مسموح.. / Forbidden".
  msg = msg.replace(/^[A-Z][A-Z0-9_]*:\s*/, '').trim()

  return msg || fallback
}
