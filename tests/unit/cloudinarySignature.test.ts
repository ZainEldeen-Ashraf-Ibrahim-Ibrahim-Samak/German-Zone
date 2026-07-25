import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { signParams } from '../../electron/services/cloudinaryService.js'

/**
 * Cloudinary upload signature (feature 004, R2). The signature is the SHA1 of
 * the request params sorted by key and joined as `k=v&...`, followed by the API
 * secret. No network involved.
 */
describe('cloudinary signParams', () => {
  it('computes sha1 of sorted params + secret', () => {
    const params = { folder: 'nursery/children', timestamp: 1700000000 }
    const secret = 'test_secret'
    const expected = crypto
      .createHash('sha1')
      .update('folder=nursery/children&timestamp=1700000000' + secret)
      .digest('hex')
    expect(signParams(params, secret)).toBe(expected)
  })

  it('sorts params by key regardless of input order', () => {
    const a = signParams({ timestamp: 5, folder: 'x' }, 's')
    const b = signParams({ folder: 'x', timestamp: 5 }, 's')
    expect(a).toBe(b)
  })

  it('changes when the secret changes', () => {
    const params = { folder: 'x', timestamp: 1 }
    expect(signParams(params, 'secret-a')).not.toBe(signParams(params, 'secret-b'))
  })
})
