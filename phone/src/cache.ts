import { useEffect, useState } from 'react'
import { parseTitleKey, type MediaType, type SearchResult, type SeasonDetails, type TitleDetails, type Trait, type WatchProviders } from '@core/types'
import { usePhone } from './store'

/**
 * TMDB answers saved on the phone for a while, so the page is quick and still shows something with
 * no signal. Kept in localStorage under one key per answer; if the phone runs out of room, the
 * oldest half is cleared.
 */

const PREFIX = 'eclipse.phone.tmdb:'
const HOUR = 3_600_000
export const TTL = { details: 7 * 24 * HOUR, season: 3 * 24 * HOUR, providers: 24 * HOUR, recs: 3 * 24 * HOUR, traits: 7 * 24 * HOUR }

const memory = new Map<string, { at: number; data: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()

function read(key: string): { at: number; data: unknown } | null {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const v = JSON.parse(raw) as { at: number; data: unknown }
    memory.set(key, v)
    return v
  } catch {
    return null
  }
}

function write(key: string, data: unknown): void {
  const v = { at: Date.now(), data }
  memory.set(key, v)
  const text = JSON.stringify(v)
  try {
    localStorage.setItem(PREFIX + key, text)
  } catch {
    tidy()
    try {
      localStorage.setItem(PREFIX + key, text)
    } catch {
      // Still no room: kept in memory for this visit.
    }
  }
}

function tidy(): void {
  const all: { k: string; at: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    try {
      all.push({ k, at: (JSON.parse(localStorage.getItem(k) ?? '{}') as { at?: number }).at ?? 0 })
    } catch {
      all.push({ k, at: 0 })
    }
  }
  all.sort((a, b) => a.at - b.at)
  for (const { k } of all.slice(0, Math.ceil(all.length / 2))) localStorage.removeItem(k)
}

/** A saved answer if it's fresh enough; otherwise asks TMDB (falling back to the old answer when offline). */
export async function cached<T>(key: string, ttl: number, job: () => Promise<T>): Promise<T> {
  const hit = read(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  const running = inFlight.get(key)
  if (running) return running as Promise<T>
  const p = job()
    .then((data) => {
      write(key, data)
      return data
    })
    .catch((err) => {
      if (hit) return hit.data as T
      throw err
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/** Asks TMDB at most a few things at once, so a long list doesn't trip its rate limit. */
let active = 0
const waiting: (() => void)[] = []
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 6) await new Promise<void>((r) => waiting.push(r))
  active++
  try {
    return await job()
  } finally {
    active--
    waiting.shift()?.()
  }
}

const tmdb = () => {
  const t = usePhone.getState().tmdb
  if (!t) throw new Error('Add your TMDB key first.')
  return t
}

export const getDetails = (type: MediaType, id: number): Promise<TitleDetails> => cached(`details:${type}:${id}`, TTL.details, () => slot(() => tmdb().details(type, id)))
export const getSeason = (tvId: number, n: number): Promise<SeasonDetails> => cached(`season:${tvId}:${n}`, TTL.season, () => slot(() => tmdb().season(tvId, n)))
export const getProviders = (type: MediaType, id: number, region: string): Promise<WatchProviders> =>
  cached(`providers:${region}:${type}:${id}`, TTL.providers, () => slot(() => tmdb().providers(type, id, region)))
export const getRecs = (type: MediaType, id: number): Promise<SearchResult[]> => cached(`recs:${type}:${id}`, TTL.recs, () => slot(() => tmdb().recommendations(type, id)))
export const getSimilar = (type: MediaType, id: number): Promise<SearchResult[]> => cached(`similar:${type}:${id}`, TTL.recs, () => slot(() => tmdb().similar(type, id)))
export const getTraits = (type: MediaType, id: number): Promise<Trait[]> => cached(`traits:${type}:${id}`, TTL.traits, () => slot(() => tmdb().traits(type, id)))

/** The same TMDB answers, by title key, for the shared recommendation ranking in core/recommend.ts. */
const byKey =
  <T>(get: (type: MediaType, id: number) => Promise<T>) =>
  (key: string): Promise<T> => {
    const t = parseTitleKey(key)
    if (!t) return Promise.reject(new Error(`Not a title: ${key}`))
    return get(t.type, t.id)
  }
export const recSources = { recommendations: byKey(getRecs), similar: byKey(getSimilar), traits: byKey(getTraits) }

/** Loads something for a screen: { data, error } with data null while it loads. */
export function useLoad<T>(job: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let live = true
    setState({ data: null, error: null })
    job().then(
      (data) => live && setState({ data, error: null }),
      (err) => live && setState({ data: null, error: err instanceof Error ? err.message : String(err) })
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
