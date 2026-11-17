/**
 * Caching TMDB answers, so the app is quick and still shows things offline. Where the answers are
 * kept is up to the caller (the app keeps them as files in its own data folder); this only decides
 * when an answer is fresh enough and what to do when TMDB can't be reached.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** How long each kind of answer is trusted before asking TMDB again. */
export const CACHE_TTL = {
  search: DAY,
  /** Trending titles for the poster wall: daily. */
  trending: DAY,
  /** Film and show details (incl. next episode dates): weekly, as the plan says for episode data. */
  details: 7 * DAY,
  /** Where to watch (Phase 2): daily. */
  providers: DAY
} as const

export interface CacheEntry<T> {
  savedAt: number
  data: T
}

export interface CacheStore {
  read<T>(key: string): Promise<CacheEntry<T> | null>
  write<T>(key: string, entry: CacheEntry<T>): Promise<void>
}

export interface CachedResult<T> {
  data: T
  /** Where it came from: TMDB just now, a fresh saved copy, or an old copy because TMDB couldn't be reached. */
  source: 'network' | 'cache' | 'stale'
  savedAt: number
}

export function isFresh(entry: { savedAt: number } | null | undefined, ttl: number, now: number): boolean {
  return !!entry && now - entry.savedAt >= 0 && now - entry.savedAt < ttl
}

/**
 * Returns the saved copy while it's fresh, otherwise asks `fetcher` and saves the answer. If asking
 * fails and there is an old copy, the old copy is returned instead (marked "stale"), except when
 * the error says the key is wrong (`shouldServeStale` decides).
 */
export async function cached<T>(
  store: CacheStore,
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  options: { force?: boolean; now?: () => number; shouldServeStale?: (err: unknown) => boolean } = {}
): Promise<CachedResult<T>> {
  const now = options.now ?? Date.now
  const saved = await store.read<T>(key).catch(() => null)
  if (!options.force && saved && isFresh(saved, ttl, now())) return { data: saved.data, source: 'cache', savedAt: saved.savedAt }
  try {
    const data = await fetcher()
    const entry = { savedAt: now(), data }
    await store.write(key, entry).catch(() => undefined)
    return { data, source: 'network', savedAt: entry.savedAt }
  } catch (err) {
    if (saved && (options.shouldServeStale ?? (() => true))(err)) return { data: saved.data, source: 'stale', savedAt: saved.savedAt }
    throw err
  }
}

/** A safe file name for a cache key ("details:tv:1396" → "details_tv_1396"; searches are hashed). */
export function cacheFileName(key: string): string {
  const plain = key.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')
  if (plain.length <= 80 && /^[a-z0-9_]+$/i.test(plain) && !key.startsWith('search:')) return plain
  return `${plain.slice(0, 40)}_${hash(key)}`
}

/** A short, stable hash (FNV-1a), only for file names. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
