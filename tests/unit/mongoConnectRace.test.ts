import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Reproduces the startup race that produced:
 *   "Can't call `openUri()` on an active connection with different connection strings"
 *
 * main.ts fires connectMongo() without awaiting it, then auto-sync starts and calls
 * connectMongo() again before the first attempt has resolved. Mongoose only permits one
 * default connection, so the second call must join the first rather than opening its own.
 */

let connectCalls: { uri: string; dbName?: string }[] = []
let activeUri: string | null = null

vi.mock('mongoose', () => {
  const connection = { on: () => {}, db: null }
  const mongoose = {
    connection,
    models: {},
    model: () => ({}),
    Schema: class { constructor() { /* noop */ } },
    async connect(uri: string, opts: any = {}) {
      // Mirror mongoose's real guard.
      if (activeUri !== null && activeUri !== uri) {
        throw new Error("Can't call `openUri()` on an active connection with different connection strings.")
      }
      connectCalls.push({ uri, dbName: opts.dbName })
      // Simulate network latency so overlapping callers genuinely overlap.
      await new Promise((r) => setTimeout(r, 25))
      activeUri = uri
    },
    async disconnect() { activeUri = null },
  }
  return { default: mongoose, ...mongoose }
})

// Each SRV resolution can legitimately return the hosts in a different order, which is
// what made the two concurrent calls disagree about the connection string.
let resolveCount = 0
vi.mock('dns', () => ({
  promises: {
    Resolver: class {
      async resolveSrv() {
        resolveCount++
        const hosts = [
          { name: 'a.mongodb.net', port: 27017 },
          { name: 'b.mongodb.net', port: 27017 },
        ]
        return resolveCount % 2 === 0 ? hosts.reverse() : hosts
      }
      async resolveTxt() { return [['replicaSet=rs0']] }
    },
  },
}))

const URI = 'mongodb+srv://user:pass@cluster0.mongodb.net/?appName=Cluster0'

beforeEach(() => {
  connectCalls = []
  activeUri = null
  resolveCount = 0
  vi.resetModules()
})

describe('connectMongo concurrency', () => {
  it('two overlapping calls open only one connection', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')

    // Exactly the startup sequence: fire-and-forget, then auto-sync connects too.
    const first = connectMongo(URI)
    const second = connectMongo(URI)

    await expect(Promise.all([first, second])).resolves.toBeDefined()
    expect(connectCalls).toHaveLength(1)
  })

  it('a burst of callers still opens only one connection', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')

    await Promise.all(Array.from({ length: 5 }, () => connectMongo(URI)))

    expect(connectCalls).toHaveLength(1)
  })

  it('reports connected once the shared attempt resolves', async () => {
    const { connectMongo, getConnectionStatus } = await import('../../electron/services/mongoSync.js')

    await Promise.all([connectMongo(URI), connectMongo(URI)])

    expect(getConnectionStatus().connected).toBe(true)
  })

  it('routes into its own database when the URI names none', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')

    await connectMongo(URI)

    expect(connectCalls[0].dbName).toBe('germanzone')
  })

  it('respects a database named in the URI', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')

    await connectMongo('mongodb://localhost:27017/my_own_db')

    expect(connectCalls[0].dbName).toBeUndefined()
  })

  it('switching to a different URI disconnects the old connection first', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')

    await connectMongo(URI)
    await connectMongo('mongodb://localhost:27017/other')

    expect(connectCalls).toHaveLength(2)
  })

  it('a failed attempt does not poison later retries', async () => {
    const { connectMongo } = await import('../../electron/services/mongoSync.js')
    const mongoose: any = (await import('mongoose')).default

    const realConnect = mongoose.connect
    mongoose.connect = async () => { throw new Error('network down') }
    await expect(connectMongo(URI)).rejects.toThrow()

    mongoose.connect = realConnect
    await expect(connectMongo(URI)).resolves.toBeUndefined()
  })
})
