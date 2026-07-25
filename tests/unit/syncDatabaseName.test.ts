import { describe, it, expect } from 'vitest'

/**
 * German Zone installs alongside the old nursery app and shares collection names with
 * it (sync_payments, sync_users, …). It must therefore land in its own Mongo database
 * unless the admin's connection string names one explicitly.
 *
 * Mirrors uriNamesDatabase() in electron/services/mongoSync.ts.
 */
function uriNamesDatabase(uri: string): boolean {
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '')
  const afterHost = afterScheme.slice(afterScheme.indexOf('/') + 1)
  if (!afterScheme.includes('/')) return false
  return afterHost.split('?')[0].length > 0
}

describe('sync database selection', () => {
  it('claims its own database when the URI has no path at all', () => {
    expect(uriNamesDatabase('mongodb+srv://user:pass@cluster0.mongodb.net')).toBe(false)
  })

  it('claims its own database for the shipped default URI', () => {
    expect(uriNamesDatabase('mongodb+srv://nursery:nursery@cluster0.ile4s29.mongodb.net/?appName=Cluster0')).toBe(false)
  })

  it('claims its own database for a trailing slash with no database', () => {
    expect(uriNamesDatabase('mongodb+srv://user:pass@cluster0.mongodb.net/')).toBe(false)
  })

  it('respects a database named in the URI', () => {
    expect(uriNamesDatabase('mongodb+srv://user:pass@cluster0.mongodb.net/germanzone_db')).toBe(true)
  })

  it('respects a database named alongside query options', () => {
    expect(uriNamesDatabase('mongodb+srv://user:pass@cluster0.mongodb.net/mydb?retryWrites=true')).toBe(true)
  })

  it('handles non-srv connection strings', () => {
    expect(uriNamesDatabase('mongodb://localhost:27017')).toBe(false)
    expect(uriNamesDatabase('mongodb://localhost:27017/')).toBe(false)
    expect(uriNamesDatabase('mongodb://localhost:27017/germanzone')).toBe(true)
  })

  it('is not fooled by a password containing a slash-like escape', () => {
    // Credentials are percent-encoded in a valid URI, so the first '/' after the
    // scheme still separates host from database.
    expect(uriNamesDatabase('mongodb+srv://user:p%2Fss@cluster0.mongodb.net/?appName=x')).toBe(false)
  })
})
