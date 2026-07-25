import { getCurrentUser as _getCurrentUser } from './authIPC.js'

export { _getCurrentUser as getCurrentUser }

export function requireAdmin(): void {
  const user = _getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
  if (user.role !== 'admin') {
    throw new Error('FORBIDDEN: غير مسموح بالوصول لغير المسؤولين / Forbidden')
  }
}

export function checkAuth(): void {
  const user = _getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED: يجب تسجيل الدخول أولاً / Unauthorized')
  }
}
