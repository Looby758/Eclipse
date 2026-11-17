import { describe, expect, it, vi } from 'vitest'
import { cached, cacheFileName, isFresh, type CacheEntry, type CacheStore } from './cache'

function memoryStore(): CacheStore & { map: Map<string, CacheEntry<unknown>> } {
  const map = new Map<string, CacheEntry<unknown>>()
  return {
    map,
    read: async <T>(k: string) => (map.get(k) as CacheEntry<T>) ?? null,
    write: async (k, e) => void map.set(k, e)
  }
}

describe('cache', () => {
  it('uses a fresh copy without asking again', async () => {
    const store = memoryStore()
    let t = 1000
    const fetcher = vi.fn(async () => 'answer')
    expect((await cached(store, 'a', 100, fetcher, { now: () => t })).source).toBe('network')
    t = 1050
    expect(await cached(store, 'a', 100, fetcher, { now: () => t })).toMatchObject({ data: 'answer', source: 'cache' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('asks again once it is old, or when forced', async () => {
    const store = memoryStore()
    const fetcher = vi.fn(async () => 'x')
    await cached(store, 'a', 100, fetcher, { now: () => 0 })
    await cached(store, 'a', 100, fetcher, { now: () => 200 })
    await cached(store, 'a', 100, fetcher, { now: () => 201, force: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('falls back to an old copy when offline, but not for a bad key', async () => {
    const store = memoryStore()
    await cached(store, 'a', 100, async () => 'old', { now: () => 0 })
    const offline = await cached(store, 'a', 100, async () => Promise.reject(new Error('offline')), { now: () => 500 })
    expect(offline).toMatchObject({ data: 'old', source: 'stale' })
    await expect(cached(store, 'a', 100, async () => Promise.reject(new Error('bad key')), { now: () => 500, shouldServeStale: () => false })).rejects.toThrow('bad key')
    await expect(cached(memoryStore(), 'b', 100, async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline')
  })

  it('treats a copy from the future (clock changed) as old', () => {
    expect(isFresh({ savedAt: 500 }, 100, 450)).toBe(false)
    expect(isFresh(null, 100, 0)).toBe(false)
  })

  it('makes safe file names', () => {
    expect(cacheFileName('details:tv:1396')).toBe('details_tv_1396')
    const s = cacheFileName('search:Star Wars: Andor / ../..')
    expect(s).toMatch(/^[a-z0-9_]+$/i)
    expect(s).not.toBe(cacheFileName('search:star wars andor'))
  })
})
