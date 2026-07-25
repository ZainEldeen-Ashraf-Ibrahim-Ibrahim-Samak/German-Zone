import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'mock-user-data',
    get isPackaged() {
      return false
    }
  },
  ipcMain: { handle: vi.fn() }
}))

const SECRET = 'test-jwt-secret-for-unit-tests'

const PAYLOAD = { id: 1, username: 'admin', role: 'admin' as const }

describe('JWT token lifecycle', () => {
  it('sign + verify round-trip returns original payload', () => {
    const token = jwt.sign(PAYLOAD, SECRET, { expiresIn: '1h' })
    const decoded = jwt.verify(token, SECRET) as any
    expect(decoded.id).toBe(PAYLOAD.id)
    expect(decoded.username).toBe(PAYLOAD.username)
    expect(decoded.role).toBe(PAYLOAD.role)
  })

  it('verify throws when token is signed with a different secret', () => {
    const token = jwt.sign(PAYLOAD, SECRET)
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow()
  })

  it('verify throws for an expired token', () => {
    const token = jwt.sign(PAYLOAD, SECRET, { expiresIn: '-1s' })
    expect(() => jwt.verify(token, SECRET)).toThrow(/expired/)
  })

  it('verify throws for a tampered token body', () => {
    const token = jwt.sign(PAYLOAD, SECRET)
    const [header, , sig] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ ...PAYLOAD, role: 'superadmin' })).toString('base64url')
    const tampered = `${header}.${tamperedPayload}.${sig}`
    expect(() => jwt.verify(tampered, SECRET)).toThrow()
  })

  it('decoded token contains iat and exp claims', () => {
    const token = jwt.sign(PAYLOAD, SECRET, { expiresIn: '30d' })
    const decoded = jwt.verify(token, SECRET) as any
    expect(decoded.iat).toBeDefined()
    expect(decoded.exp).toBeDefined()
    expect(decoded.exp).toBeGreaterThan(decoded.iat)
  })

  it('token for employee role contains correct role claim', () => {
    const empPayload = { id: 2, username: 'emp1', role: 'employee' as const }
    const token = jwt.sign(empPayload, SECRET, { expiresIn: '1h' })
    const decoded = jwt.verify(token, SECRET) as any
    expect(decoded.role).toBe('employee')
  })

  it('jwt.decode works without verification (for UI display only)', () => {
    const token = jwt.sign(PAYLOAD, SECRET)
    const decoded = jwt.decode(token) as any
    expect(decoded.username).toBe('admin')
  })

  it('two tokens signed at different times have different values', () => {
    const t1 = jwt.sign({ ...PAYLOAD, iat: 1000 }, SECRET)
    const t2 = jwt.sign({ ...PAYLOAD, iat: 2000 }, SECRET)
    expect(t1).not.toBe(t2)
  })
})
