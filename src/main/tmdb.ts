import { net, safeStorage } from 'electron'
import { cached, CACHE_TTL } from '@core/cache'
import { createTmdb, TmdbError, type Tmdb } from '@core/tmdb'
import type { MediaType, Provider, SearchResult, SeasonDetails, TitleDetails, WatchProviders } from '@core/types'
import { parseTitleKey } from '@core/types'
import type { Fetched } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { fileCache } from './cacheStore'

/**
 * Your TMDB key and every call to TMDB. The key is stored encrypted with the system's own
 * protection (Windows' data protection or the Mac Keychain, via Electron's safeStorage), the same
 * way Orbit stores its keys. It never goes to the window and is never written in plain text.
 */

const encrypt = (text: string): string => safeStorage.encryptString(text).toString('base64')
const decrypt = (text: string): string => safeStorage.decryptString(Buffer.from(text, 'base64'))

const fetchWithElectron = (url: string, init?: { headers?: Record<string, string> }) => net.fetch(url, init)

export const canEncrypt = (): boolean => safeStorage.isEncryptionAvailable()
export const hasKey = (): boolean => !!loadSettings().tmdbKey

let client: Tmdb | null = null

function tmdb(): Tmdb {
  if (client) return client
  const stored = loadSettings().tmdbKey
  if (!stored) throw new TmdbError('auth', 'Add your TMDB API key in Settings first.')
  let key: string
  try {
    key = decrypt(stored)
  } catch {
    throw new TmdbError('auth', 'Your saved TMDB key couldn’t be read on this computer. Paste it again in Settings.')
  }
  client = createTmdb({ key, fetch: fetchWithElectron })
  return client
}

/** Checks the key with TMDB, then saves it encrypted. */
export async function setKey(raw: string): Promise<void> {
  const key = raw.trim()
  if (!key) throw new Error('Paste your TMDB API key first.')
  if (!canEncrypt()) throw new Error('This computer can’t store the key securely, so it wasn’t saved.')
  const test = createTmdb({ key, fetch: fetchWithElectron })
  try {
    await test.check()
  } catch (err) {
    if (err instanceof TmdbError && err.kind === 'auth') throw new Error('TMDB didn’t accept that key. Check you copied all of it.')
    throw err
  }
  saveSettings({ tmdbKey: encrypt(key) })
  client = test
}

export function clearKey(): void {
  saveSettings({ tmdbKey: undefined })
  client = null
}

// A wrong key shouldn't hide behind old saved answers: only fall back when TMDB can't be reached.
const serveStaleUnlessKeyProblem = (err: unknown): boolean => !(err instanceof TmdbError && err.kind === 'auth')

export async function search(query: string): Promise<Fetched<SearchResult[]>> {
  const q = query.trim().toLowerCase()
  const r = await cached(fileCache, `search:${q}`, CACHE_TTL.search, () => tmdb().search(q), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function details(type: MediaType, id: number, refresh = false): Promise<Fetched<TitleDetails>> {
  const r = await cached(fileCache, `details:${type}:${id}`, CACHE_TTL.details, () => tmdb().details(type, id), {
    force: refresh,
    shouldServeStale: serveStaleUnlessKeyProblem
  })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function trending(): Promise<Fetched<SearchResult[]>> {
  const r = await cached(fileCache, 'trending:week', CACHE_TTL.trending, () => tmdb().trending(), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function season(tvId: number, n: number, refresh = false): Promise<Fetched<SeasonDetails>> {
  const r = await cached(fileCache, `season:${tvId}:${n}`, CACHE_TTL.season, () => tmdb().season(tvId, n), { force: refresh, shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function providers(type: MediaType, id: number, region: string, refresh = false): Promise<Fetched<WatchProviders>> {
  const r = await cached(fileCache, `providers:${region}:${type}:${id}`, CACHE_TTL.providers, () => tmdb().providers(type, id, region), {
    force: refresh,
    shouldServeStale: serveStaleUnlessKeyProblem
  })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

/** Where to watch for many titles (the library filters): a few at a time, from the cache where fresh. */
export async function providersMany(keys: string[], region: string): Promise<Record<string, WatchProviders>> {
  const out: Record<string, WatchProviders> = {}
  const todo = [...new Set(keys)].filter((k) => parseTitleKey(k))
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (key) => {
        const { type, id } = parseTitleKey(key)!
        try {
          out[key] = (await providers(type, id, region)).data
        } catch {
          // Unknown for now; it simply won't match the filters until it can be checked.
        }
      })
    )
  }
  return out
}

/** Details for many titles at once, by title key (titles that couldn't be fetched are left out). */
export async function detailsMany(keys: string[]): Promise<Record<string, TitleDetails>> {
  const out: Record<string, TitleDetails> = {}
  const todo = [...new Set(keys)].filter((k) => parseTitleKey(k))
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (key) => {
        const { type, id } = parseTitleKey(key)!
        try {
          out[key] = (await details(type, id)).data
        } catch {
          // Left out; its time shows as unknown.
        }
      })
    )
  }
  return out
}

export async function services(region: string): Promise<Fetched<Provider[]>> {
  const r = await cached(fileCache, `services:${region}`, CACHE_TTL.services, () => tmdb().services(region), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}
