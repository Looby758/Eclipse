import type { MediaType, NextEpisode, SearchResult, Season, TitleDetails } from './types'
import { titleKey } from './types'

/**
 * A small client for TMDB's free API (https://developer.themoviedb.org). It takes the key and a
 * fetch function from whoever uses it, so it holds no secrets and runs anywhere (tests included).
 */

export const TMDB_API = 'https://api.themoviedb.org/3'
export const TMDB_IMAGES = 'https://image.tmdb.org/t/p'
export const TMDB_SITE = 'https://www.themoviedb.org'

export type PosterSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'original'
export type BackdropSize = 'w780' | 'w1280' | 'original'

export function imageUrl(path: string | null | undefined, size: PosterSize | BackdropSize = 'w342'): string | null {
  return path ? `${TMDB_IMAGES}/${size}${path}` : null
}

export const tmdbPageUrl = (type: MediaType, id: number): string => `${TMDB_SITE}/${type}/${id}`

export type TmdbErrorKind = 'auth' | 'notFound' | 'network' | 'rateLimit' | 'other'

export class TmdbError extends Error {
  constructor(
    readonly kind: TmdbErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'TmdbError'
  }
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/**
 * TMDB gives out two kinds of key: the short "API Key" (v3) and the long "API Read Access Token"
 * (starts with "eyJ"). Either works; the token goes in a header, the key in the address.
 */
export function isReadAccessToken(key: string): boolean {
  return key.startsWith('eyJ') && key.split('.').length === 3
}

export interface TmdbOptions {
  key: string
  fetch: Fetch
  /** Language for titles and overviews. */
  language?: string
}

export interface Tmdb {
  /** Checks the key works (throws a TmdbError if not). */
  check(): Promise<void>
  search(query: string): Promise<SearchResult[]>
  details(type: MediaType, id: number): Promise<TitleDetails>
}

export function createTmdb({ key, fetch, language = 'en-GB' }: TmdbOptions): Tmdb {
  const token = isReadAccessToken(key)

  async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({ ...params, ...(token ? {} : { api_key: key }) })
    const url = `${TMDB_API}${path}${query.size ? `?${query}` : ''}`
    let res: Awaited<ReturnType<Fetch>>
    try {
      res = await fetch(url, { headers: { accept: 'application/json', ...(token ? { Authorization: `Bearer ${key}` } : {}) } })
    } catch {
      throw new TmdbError('network', 'Couldn’t reach TMDB. Check your internet connection.')
    }
    if (res.status === 401) throw new TmdbError('auth', 'TMDB didn’t accept the API key. Check it in Settings.')
    if (res.status === 404) throw new TmdbError('notFound', 'TMDB doesn’t have that title.')
    if (res.status === 429) throw new TmdbError('rateLimit', 'TMDB is busy. Try again in a few seconds.')
    if (!res.ok) throw new TmdbError('other', `TMDB answered with an error (${res.status}).`)
    return (await res.json()) as T
  }

  return {
    async check() {
      await get('/configuration')
    },

    async search(query) {
      const q = query.trim()
      if (!q) return []
      const body = await get<{ results?: RawSearchItem[] }>('/search/multi', { query: q, include_adult: 'false', language, page: '1' })
      return parseSearch(body.results ?? [])
    },

    async details(type, id) {
      const raw = await get<RawDetails>(`/${type}/${id}`, { language })
      return parseDetails(type, raw)
    }
  }
}

// ---- Turning TMDB's answers into our shapes (exported for tests) ----

interface RawSearchItem {
  id: number
  media_type: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
  popularity?: number
}

export function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : null
}

export function parseSearch(items: RawSearchItem[]): SearchResult[] {
  return items
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => {
      const type = r.media_type as MediaType
      return {
        key: titleKey(type, r.id),
        type,
        id: r.id,
        name: (type === 'movie' ? r.title : r.name) ?? r.title ?? r.name ?? 'Untitled',
        year: yearOf(type === 'movie' ? r.release_date : r.first_air_date),
        posterPath: r.poster_path ?? null,
        overview: r.overview ?? '',
        popularity: r.popularity ?? 0
      }
    })
}

interface RawDetails {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  last_air_date?: string | null
  tagline?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: { name: string }[]
  runtime?: number | null
  episode_run_time?: number[]
  last_episode_to_air?: { runtime?: number | null } | null
  status?: string
  vote_average?: number
  vote_count?: number
  seasons?: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }[]
  number_of_seasons?: number
  number_of_episodes?: number
  next_episode_to_air?: { season_number: number; episode_number: number; name: string; air_date: string | null } | null
  belongs_to_collection?: { id: number; name: string } | null
}

/** A show's usual episode length: TMDB's list (often empty these days), else the latest episode's. */
function episodeRuntime(raw: RawDetails): number | null {
  const times = (raw.episode_run_time ?? []).filter((n) => n > 0)
  if (times.length) return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  return raw.last_episode_to_air?.runtime || null
}

export function parseDetails(type: MediaType, raw: RawDetails): TitleDetails {
  const movie = type === 'movie'
  const name = (movie ? raw.title : raw.name) ?? 'Untitled'
  const original = (movie ? raw.original_title : raw.original_name) ?? null
  const date = (movie ? raw.release_date : raw.first_air_date) || null
  const seasons: Season[] = (raw.seasons ?? [])
    .map((s) => ({ number: s.season_number, name: s.name, episodeCount: s.episode_count, airDate: s.air_date || null, posterPath: s.poster_path ?? null }))
    // Specials (season 0) go last.
    .sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number))
  const next: NextEpisode | null = raw.next_episode_to_air
    ? { season: raw.next_episode_to_air.season_number, episode: raw.next_episode_to_air.episode_number, name: raw.next_episode_to_air.name, airDate: raw.next_episode_to_air.air_date || null }
    : null
  return {
    key: titleKey(type, raw.id),
    type,
    id: raw.id,
    name,
    originalName: original && original !== name ? original : null,
    year: yearOf(date),
    date,
    tagline: raw.tagline ?? '',
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    runtime: movie ? raw.runtime || null : episodeRuntime(raw),
    status: raw.status ?? '',
    voteAverage: raw.vote_count ? (raw.vote_average ?? null) : null,
    voteCount: raw.vote_count ?? 0,
    seasons: movie ? [] : seasons,
    numberOfSeasons: movie ? null : (raw.number_of_seasons ?? null),
    numberOfEpisodes: movie ? null : (raw.number_of_episodes ?? null),
    nextEpisode: movie ? null : next,
    lastAirDate: movie ? null : raw.last_air_date || null,
    collection: movie && raw.belongs_to_collection ? { id: raw.belongs_to_collection.id, name: raw.belongs_to_collection.name } : null
  }
}
