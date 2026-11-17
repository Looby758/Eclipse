import { net, safeStorage } from 'electron'
import { cached, CACHE_TTL } from '@core/cache'
import { createTmdb, TmdbError, type Tmdb } from '@core/tmdb'
import type { CollectionDetails, Credits, MediaType, PersonDetails, Provider, SearchResult, SeasonDetails, TitleDetails, TitleRef, TmdbListDetails, WatchProviders } from '@core/types'
import { expandGuide, guideById, guideRefs, type Guide, type GuideTitleInfo } from '@core/guides'
import { releaseOrder, sourceOf, findList } from '@core/lists'
import type { Library } from '@core/types'
import { parseTitleKey } from '@core/types'
import type { Fetched, ListView } from '@shared/api'
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

async function keep<T>(key: string, ttl: number, job: () => Promise<T>, refresh = false): Promise<Fetched<T>> {
  const r = await cached(fileCache, key, ttl, job, { force: refresh, shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export const credits = (type: MediaType, id: number): Promise<Fetched<Credits>> => keep(`credits:${type}:${id}`, CACHE_TTL.credits, () => tmdb().credits(type, id))
export const person = (id: number, refresh = false): Promise<Fetched<PersonDetails>> => keep(`person:${id}`, CACHE_TTL.person, () => tmdb().person(id), refresh)
export const collection = (id: number, refresh = false): Promise<Fetched<CollectionDetails>> => keep(`collection:${id}`, CACHE_TTL.collection, () => tmdb().collection(id), refresh)
export const tmdbList = (id: number, refresh = false): Promise<Fetched<TmdbListDetails>> => keep(`list:${id}`, CACHE_TTL.list, () => tmdb().list(id), refresh)

/** A hand-made guide laid out season by season, with posters and air dates from TMDB. */
async function guideItems(g: Guide): Promise<TitleRef[]> {
  const found = await detailsMany(guideRefs(g).map((r) => r.key))
  const info: Record<string, GuideTitleInfo> = {}
  for (const [key, d] of Object.entries(found)) info[key] = { name: d.name, year: d.year, date: d.date, posterPath: d.posterPath, seasons: d.type === 'tv' ? d.seasons : [] }
  return expandGuide(g, info)
}

/** Everything in a list, wherever it comes from. */
export async function openList(id: string, library: Library, refresh = false): Promise<ListView> {
  const source = sourceOf(id)
  if (!source) throw new Error('That list doesn’t exist.')
  switch (source.kind) {
    case 'person': {
      const p = (await person(source.personId, refresh)).data
      const directing = source.role === 'director'
      return {
        id,
        name: p.name,
        description: directing ? `Films directed by ${p.name}.` : `Films and shows with ${p.name} in a regular part.`,
        imagePath: p.profilePath,
        items: releaseOrder(directing ? p.directed : p.acted)
      }
    }
    case 'collection': {
      const c = (await collection(source.collectionId, refresh)).data
      return { id, name: c.name, description: c.overview, imagePath: c.posterPath, items: releaseOrder(c.parts) }
    }
    case 'tmdbList': {
      const l = (await tmdbList(source.listId, refresh)).data
      return { id, name: l.name, description: l.description, imagePath: l.posterPath, items: l.items }
    }
    case 'guide': {
      const g = guideById(source.guideId)
      if (!g) throw new Error('That guide doesn’t exist.')
      const items = await guideItems(g)
      return { id, name: g.name, description: g.description, imagePath: null, items, releaseItems: releaseOrder(items) }
    }
    case 'custom': {
      const l = findList(library, id)
      if (!l) throw new Error('That list has been deleted.')
      return { id, name: l.name, description: '', imagePath: null, items: l.items ?? [] }
    }
  }
}
