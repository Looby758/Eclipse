import { net, safeStorage } from 'electron'
import { cached, CACHE_TTL } from '@core/cache'
import { createTmdb, TmdbError, type Tmdb } from '@core/tmdb'
import type { MediaType, SearchResult, TitleDetails } from '@core/types'
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
