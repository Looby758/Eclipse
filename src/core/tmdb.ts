import type { Trait } from './types'
import type { PosterOption } from './posters'
import type { CollectionDetails, Credits, Episode, MediaType, NextEpisode, PartEpisodes, PersonDetails, PersonRef, PersonResult, Provider, SearchResult, Season, SeasonDetails, TitleDetails, TitleRef, TmdbListDetails, WatchProviders } from './types'
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
/** Episode pictures. */
export type StillSize = 'w300'

export function imageUrl(path: string | null | undefined, size: PosterSize | BackdropSize | StillSize = 'w342'): string | null {
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
  /** People whose name matches, most popular first. */
  searchPeople(query: string): Promise<PersonResult[]>
  details(type: MediaType, id: number): Promise<TitleDetails>
  /** This week's trending films and shows (two pages, about 40), for the poster wall. */
  trending(): Promise<SearchResult[]>
  /** One season of a show, with every episode's title, date, length and rating. */
  season(tvId: number, season: number): Promise<SeasonDetails>
  /** Where a film or show can be streamed, rented or bought in `region` (data from JustWatch). */
  providers(type: MediaType, id: number, region: string): Promise<WatchProviders>
  /** Every streaming service in `region`, for picking your own. */
  services(region: string): Promise<Provider[]>
  /** Who directed it and the main cast. */
  credits(type: MediaType, id: number): Promise<Credits>
  /** A person and their films and shows. */
  person(id: number): Promise<PersonDetails>
  /** The episodes (or seasons) one part in a show covers, by TMDB's credit id. */
  credit(creditId: string): Promise<PartEpisodes>
  /** A film series (TMDB collection), e.g. "The Dark Knight Collection". */
  collection(id: number): Promise<CollectionDetails>
  /** A public list on TMDB, by its number. */
  list(id: number): Promise<TmdbListDetails>
  /** TMDB's "if you liked this" titles for a film or show. */
  recommendations(type: MediaType, id: number): Promise<SearchResult[]>
  /** TMDB's "similar" titles (same keywords and genres), a second source of candidates. */
  similar(type: MediaType, id: number): Promise<SearchResult[]>
  /** What recommendations learn from: its creators, network, main cast and keywords. */
  traits(type: MediaType, id: number): Promise<Trait[]>
  /** Every poster TMDB has for a title in English or with no text (phase 55: choose your own). */
  posters(type: MediaType, id: number): Promise<PosterOption[]>
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

    async searchPeople(query) {
      const q = query.trim()
      if (!q) return []
      const body = await get<{ results?: RawPersonResult[] }>('/search/person', { query: q, include_adult: 'false', language, page: '1' })
      return parsePeopleSearch(body.results ?? [])
    },

    async trending() {
      const pages = await Promise.all(['1', '2'].map((page) => get<{ results?: RawSearchItem[] }>('/trending/all/week', { language, page })))
      const seen = new Set<string>()
      return parseSearch(pages.flatMap((p) => p.results ?? [])).filter((r) => r.posterPath && !seen.has(r.key) && seen.add(r.key))
    },

    async recommendations(type, id) {
      const body = await get<{ results?: RawSearchItem[] }>(`/${type}/${id}/recommendations`, { language, page: '1' })
      // Recommendations usually say what they are; when one doesn't, it's the same kind as the title.
      return parseSearch((body.results ?? []).map((r) => ({ ...r, media_type: r.media_type ?? type })))
    },

    async similar(type, id) {
      const body = await get<{ results?: RawSearchItem[] }>(`/${type}/${id}/similar`, { language, page: '1' })
      return parseSearch((body.results ?? []).map((r) => ({ ...r, media_type: r.media_type ?? type })))
    },

    async traits(type, id) {
      const credits = type === 'tv' ? 'aggregate_credits' : 'credits'
      const raw = await get<RawTraits>(`/${type}/${id}`, { language, append_to_response: `keywords,${credits}` })
      return parseTraits(type, raw)
    },

    async season(tvId, n) {
      const raw = await get<RawSeason>(`/tv/${tvId}/season/${n}`, { language })
      return parseSeason(tvId, raw)
    },

    async providers(type, id, region) {
      const raw = await get<{ results?: Record<string, RawRegionProviders> }>(`/${type}/${id}/watch/providers`)
      return parseProviders(region, raw.results?.[region])
    },

    async services(region) {
      const lists = await Promise.all(
        (['movie', 'tv'] as const).map((t) => get<{ results?: RawProvider[] }>(`/watch/providers/${t}`, { watch_region: region, language }))
      )
      return mergeServices(lists.flatMap((l) => l.results ?? []))
    },

    async credits(type, id) {
      // Shows: everyone across all seasons, so the main cast isn't just the latest season's.
      const raw = await get<RawCredits>(type === 'tv' ? `/tv/${id}/aggregate_credits` : `/movie/${id}/credits`, { language })
      return parseCredits(raw)
    },

    async person(id) {
      const raw = await get<RawPerson>(`/person/${id}`, { language, append_to_response: 'movie_credits,tv_credits' })
      return parsePerson(raw)
    },

    async credit(creditId) {
      return parseCreditEpisodes(await get<RawCredit>(`/credit/${encodeURIComponent(creditId)}`))
    },

    async collection(id) {
      const raw = await get<RawCollection>(`/collection/${id}`, { language })
      return {
        id: raw.id,
        name: raw.name ?? 'Collection',
        overview: raw.overview ?? '',
        posterPath: raw.poster_path ?? null,
        parts: (raw.parts ?? []).map((p) => refFromRaw(p, 'movie')).filter((r): r is TitleRef => !!r)
      }
    },

    async list(id) {
      const raw = await get<RawList>(`/list/${id}`, { language })
      return {
        id: Number(raw.id ?? id),
        name: raw.name ?? `TMDB list ${id}`,
        description: raw.description ?? '',
        posterPath: raw.poster_path ?? null,
        items: (raw.items ?? []).map((p) => refFromRaw(p)).filter((r): r is TitleRef => !!r)
      }
    },

    async posters(type, id) {
      const raw = await get<{ posters?: RawImage[] }>(`/${type}/${id}/images`, { include_image_language: 'en,null' })
      return parsePosters(raw.posters ?? [])
    },

    async details(type, id) {
      // Keywords say whether a film has a scene during or after the credits; videos give its trailer; images its logo.
      const raw = await get<RawDetails>(`/${type}/${id}`, { language, append_to_response: type === 'movie' ? 'keywords,videos,release_dates,images' : 'keywords,videos,images', include_video_language: 'en,null', include_image_language: 'en,null' })
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

interface RawPersonResult {
  id: number
  name?: string
  profile_path?: string | null
  known_for_department?: string
  popularity?: number
  known_for?: { title?: string; name?: string }[]
}

/** People from a search, best known first (TMDB's own order); nameless rows dropped. */
export function parsePeopleSearch(items: RawPersonResult[]): PersonResult[] {
  return items
    .filter((r) => r.id && r.name)
    .map((r) => ({
      id: r.id,
      name: r.name!,
      profilePath: r.profile_path ?? null,
      knownFor: r.known_for_department ?? '',
      knownTitles: (r.known_for ?? []).map((t) => t.title ?? t.name ?? '').filter(Boolean).slice(0, 3)
    }))
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
  /** Films: { keywords: [] }; shows: { results: [] }. */
  keywords?: { keywords?: { id: number; name: string }[]; results?: { id: number; name: string }[] }
  release_dates?: { results?: { iso_3166_1?: string; release_dates?: { type?: number; release_date?: string }[] }[] }
  videos?: { results?: { site?: string; type?: string; key?: string; official?: boolean; iso_639_1?: string | null }[] }
  images?: { logos?: { file_path?: string; iso_639_1?: string | null; vote_average?: number }[] }
}

/** The best logo: English first, then one with no text language, highest voted within each. */
interface RawImage {
  file_path?: string
  iso_639_1?: string | null
  vote_average?: number
  vote_count?: number
  width?: number
  height?: number
}

export function parsePosters(raw: RawImage[]): PosterOption[] {
  return raw
    .filter((p): p is RawImage & { file_path: string } => typeof p.file_path === 'string' && !p.file_path.endsWith('.svg'))
    .map((p) => ({ path: p.file_path, language: p.iso_639_1 || null, votes: (p.vote_average ?? 0) * Math.min(1, (p.vote_count ?? 0) / 3 + 0.25), width: p.width ?? 0, height: p.height ?? 0 }))
}

export function pickLogo(images: RawDetails['images']): string | null {
  const logos = (images?.logos ?? []).filter((l) => l.file_path && !l.file_path.endsWith('.svg'))
  const best = (lang: string | null): string | null =>
    logos
      .filter((l) => (l.iso_639_1 ?? null) === lang)
      .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))[0]?.file_path ?? null
  return best('en') ?? best(null)
}

/** TMDB's keywords for a scene during the credits and one after them. */
const DURING_CREDITS = 179431
const AFTER_CREDITS = 179430

/** The best YouTube trailer: official ones first, then any trailer, then a teaser. */
export function pickTrailer(videos: RawDetails['videos']): string | null {
  const yt = (videos?.results ?? []).filter((v) => v.site === 'YouTube' && v.key)
  const rank = (v: (typeof yt)[number]): number => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 2 : 4) + (v.official ? 0 : 1)
  const best = yt.filter((v) => v.type === 'Trailer' || v.type === 'Teaser').sort((a, b) => rank(a) - rank(b))[0]
  return best?.key ?? null
}

/** A show's usual episode length: TMDB's list (often empty these days), else the latest episode's. */
function episodeRuntime(raw: RawDetails): number | null {
  const times = (raw.episode_run_time ?? []).filter((n) => n > 0)
  if (times.length) return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  return raw.last_episode_to_air?.runtime || null
}

function stingersOf(words: { id: number; name: string }[]): { during: boolean; after: boolean } {
  const has = (id: number, name: string): boolean => words.some((w) => w.id === id || w.name === name)
  return { during: has(DURING_CREDITS, 'duringcreditsstinger'), after: has(AFTER_CREDITS, 'aftercreditsstinger') }
}

/** Each country's first cinema release (TMDB types 2 and 3) and first release of any kind, as days. */
export function releasesOf(raw: NonNullable<RawDetails['release_dates']>): Record<string, { cinema: string | null; any: string }> {
  const out: Record<string, { cinema: string | null; any: string }> = {}
  for (const c of raw.results ?? []) {
    if (!c.iso_3166_1) continue
    const days = (c.release_dates ?? []).filter((r) => r.release_date && /^\d{4}-\d{2}-\d{2}/.test(r.release_date)).map((r) => ({ type: r.type ?? 0, day: r.release_date!.slice(0, 10) }))
    if (!days.length) continue
    const first = (list: typeof days): string | null => list.map((r) => r.day).sort()[0] ?? null
    out[c.iso_3166_1] = { cinema: first(days.filter((r) => r.type === 2 || r.type === 3)), any: first(days)! }
  }
  return out
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
    collection: movie && raw.belongs_to_collection ? { id: raw.belongs_to_collection.id, name: raw.belongs_to_collection.name } : null,
    stingers: movie && raw.keywords ? stingersOf(raw.keywords.keywords ?? raw.keywords.results ?? []) : null,
    trailer: raw.videos ? pickTrailer(raw.videos) : null,
    logoPath: raw.images ? pickLogo(raw.images) : null,
    keywords: (raw.keywords?.keywords ?? raw.keywords?.results ?? []).map((k) => k.name.toLowerCase()),
    ...(movie && raw.release_dates ? { releases: releasesOf(raw.release_dates) } : {})
  }
}

interface RawSeason {
  name?: string
  season_number?: number
  episodes?: {
    season_number: number
    episode_number: number
    name?: string
    air_date?: string | null
    runtime?: number | null
    overview?: string
    vote_average?: number
    vote_count?: number
    still_path?: string | null
    guest_stars?: { id: number }[]
  }[]
}

export function parseSeason(tvId: number, raw: RawSeason): SeasonDetails {
  const episodes: Episode[] = (raw.episodes ?? [])
    .map((e) => ({
      season: e.season_number,
      number: e.episode_number,
      name: e.name ?? `Episode ${e.episode_number}`,
      airDate: e.air_date || null,
      runtime: e.runtime || null,
      overview: e.overview ?? '',
      voteAverage: e.vote_count ? (e.vote_average ?? null) : null,
      voteCount: e.vote_count ?? 0,
      stillPath: e.still_path ?? null,
      ...(e.guest_stars?.length ? { guestStars: e.guest_stars.map((g) => g.id) } : {})
    }))
    .sort((a, b) => a.number - b.number)
  return { tvId, number: raw.season_number ?? episodes[0]?.season ?? 0, name: raw.name ?? '', episodes }
}

interface RawProvider {
  provider_id: number
  provider_name: string
  logo_path?: string | null
  display_priority?: number
  display_priorities?: Record<string, number>
}

interface RawRegionProviders {
  link?: string
  flatrate?: RawProvider[]
  free?: RawProvider[]
  ads?: RawProvider[]
  rent?: RawProvider[]
  buy?: RawProvider[]
}

const toProvider = (p: RawProvider): Provider => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null })

function uniqueProviders(list: RawProvider[] | undefined): Provider[] {
  const seen = new Set<number>()
  return [...(list ?? [])]
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
    .map(toProvider)
}

export function parseProviders(region: string, raw: RawRegionProviders | undefined): WatchProviders {
  return {
    region,
    link: raw?.link ?? null,
    stream: uniqueProviders(raw?.flatrate),
    // "Free" and "with ads" are both free to watch.
    free: uniqueProviders([...(raw?.free ?? []), ...(raw?.ads ?? [])]),
    rent: uniqueProviders(raw?.rent),
    buy: uniqueProviders(raw?.buy)
  }
}

/** Films' and shows' service lists merged, most popular first. */
export function mergeServices(list: RawProvider[]): Provider[] {
  return uniqueProviders(list)
}

// ---- People, collections and lists ----

interface RawTitleCredit {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  genre_ids?: number[]
  character?: string
  credit_id?: string
  job?: string
  episode_count?: number
  order?: number
  video?: boolean
}

/** A film or show from any TMDB list-like answer, or null for people and broken rows. */
export function refFromRaw(raw: RawTitleCredit, fallback?: MediaType): TitleRef | null {
  const type = raw.media_type === 'movie' || raw.media_type === 'tv' ? raw.media_type : raw.media_type ? null : (fallback ?? (raw.title !== undefined ? 'movie' : raw.name !== undefined ? 'tv' : null))
  if (!type || !raw.id) return null
  const date = (type === 'movie' ? raw.release_date : raw.first_air_date) || null
  return { key: titleKey(type, raw.id), type, id: raw.id, name: (type === 'movie' ? raw.title : raw.name) ?? 'Untitled', year: yearOf(date), posterPath: raw.poster_path ?? null, date }
}

interface RawTraits {
  created_by?: { id: number; name: string }[]
  networks?: { id: number; name: string }[]
  production_companies?: { id: number; name: string }[]
  keywords?: { keywords?: { id: number; name: string }[]; results?: { id: number; name: string }[] }
  credits?: RawCredits
  aggregate_credits?: RawCredits
}

/** Writing and directing jobs that say who a film is by. */
const MAKERS = new Set(['Director', 'Screenplay', 'Writer', 'Creator'])

/**
 * The traits recommendations learn from (phase 43): a show's creators and network, or a film's
 * directors and writers and its first studios; the main cast (top 6); and TMDB's keywords (up to 25).
 */
export function parseTraits(type: MediaType, raw: RawTraits): Trait[] {
  const out: Trait[] = []
  const add = (kind: string, id: number | undefined, name: string | undefined): void => {
    if (typeof id === 'number' && name && !out.some((t) => t.id === `${kind}:${id}`)) out.push({ id: `${kind}:${id}`, name })
  }
  const credits = (type === 'tv' ? raw.aggregate_credits : raw.credits) ?? raw.credits ?? raw.aggregate_credits
  if (type === 'tv') for (const c of raw.created_by ?? []) add('creator', c.id, c.name)
  for (const c of credits?.crew ?? []) {
    const jobs = c.jobs ? c.jobs.map((j) => j.job) : [c.job]
    if (type === 'movie' && jobs.some((j) => j && MAKERS.has(j))) add('creator', c.id, c.name)
  }
  for (const n of type === 'tv' ? (raw.networks ?? []).slice(0, 2) : (raw.production_companies ?? []).slice(0, 2)) add('network', n.id, n.name)
  for (const c of parseCredits(credits ?? {}).cast.slice(0, 6)) add('cast', c.id, c.name)
  for (const k of (raw.keywords?.keywords ?? raw.keywords?.results ?? []).slice(0, 25)) add('keyword', k.id, k.name)
  return out
}

interface RawCredits {
  cast?: { id: number; name: string; profile_path?: string | null; character?: string; credit_id?: string; roles?: { character?: string; episode_count?: number; credit_id?: string }[]; total_episode_count?: number; order?: number }[]
  crew?: { id: number; name: string; profile_path?: string | null; job?: string; jobs?: { job?: string }[] }[]
}

export function parseCredits(raw: RawCredits): Credits {
  const directors: PersonRef[] = []
  for (const c of raw.crew ?? []) {
    const jobs = c.jobs ? c.jobs.map((j) => j.job) : [c.job]
    if (jobs.includes('Director') && !directors.some((d) => d.id === c.id)) directors.push({ id: c.id, name: c.name, profilePath: c.profile_path ?? null, role: 'Director' })
  }
  const seen = new Set<number>()
  const fullCast = [...(raw.cast ?? [])]
    .sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0) || (a.order ?? 999) - (b.order ?? 999))
    .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
    .map((c) => {
      // Shows list each part separately; the one with the most episodes comes first.
      const roles = [...(c.roles ?? [])].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0))
      const role = c.character || roles.map((r) => r.character?.trim() ?? '').filter(Boolean).join(' / ')
      const creditIds = [c.credit_id, ...roles.map((r) => r.credit_id)].filter((x): x is string => !!x)
      return { id: c.id, name: c.name, profilePath: c.profile_path ?? null, role, ...(c.total_episode_count ? { episodes: c.total_episode_count } : {}), ...(creditIds.length ? { creditIds } : {}) }
    })
  return { directors, cast: fullCast.slice(0, 12), fullCast }
}

/** TMDB genre ids for talk, news and reality TV, which don't count as acting work. */
const NOT_ACTING_GENRES = [10763, 10764, 10767]
const AS_THEMSELVES = /\b(self|himself|herself|themselves)\b|\(uncredited\)|\(archive footage\)/i

interface RawPerson {
  id: number
  name?: string
  profile_path?: string | null
  known_for_department?: string
  movie_credits?: { cast?: RawTitleCredit[]; crew?: RawTitleCredit[] }
  tv_credits?: { cast?: RawTitleCredit[] }
}

export function parsePerson(raw: RawPerson): PersonDetails {
  const unique = (refs: (TitleRef | null)[]): TitleRef[] => {
    const seen = new Set<string>()
    return refs.filter((r): r is TitleRef => !!r && !seen.has(r.key) && !!seen.add(r.key))
  }
  const directed = unique((raw.movie_credits?.crew ?? []).filter((c) => c.job === 'Director' && !c.video).map((c) => refFromRaw(c, 'movie')))
  const acting = (c: RawTitleCredit): boolean => !AS_THEMSELVES.test(c.character ?? '') && !(c.genre_ids ?? []).some((g) => NOT_ACTING_GENRES.includes(g))
  const credits = [
    ...(raw.movie_credits?.cast ?? []).filter((c) => acting(c) && !c.video).map((c) => ({ c, type: 'movie' as const })),
    // Shows: only regular parts (3 or more episodes), not one-off guest spots.
    ...(raw.tv_credits?.cast ?? []).filter((c) => acting(c) && (c.episode_count ?? 0) >= 3).map((c) => ({ c, type: 'tv' as const }))
  ]
  // Who they played in each; someone with two parts in one title gets both ("Ellie / Abby").
  const parts = new Map<string, { names: string[]; episodes: number; creditIds: string[] }>()
  for (const { c, type } of credits) {
    const key = titleKey(type, c.id)
    const part = parts.get(key) ?? { names: [], episodes: 0, creditIds: [] }
    const character = (c.character ?? '').trim()
    if (character && !part.names.includes(character)) part.names.push(character)
    if (type === 'tv') part.episodes += c.episode_count ?? 0
    if (type === 'tv' && c.credit_id) part.creditIds.push(c.credit_id)
    parts.set(key, part)
  }
  const acted = unique(credits.map(({ c, type }) => refFromRaw(c, type))).map((r) => {
    const part = parts.get(r.key)
    if (!part) return r
    return { ...r, ...(part.names.length ? { role: part.names.join(' / ') } : {}), ...(part.episodes ? { roleEpisodes: part.episodes } : {}), ...(part.creditIds.length ? { creditIds: part.creditIds } : {}) }
  })
  return { id: raw.id, name: raw.name ?? 'Unknown', profilePath: raw.profile_path ?? null, knownFor: raw.known_for_department ?? '', directed, acted }
}

interface RawCredit {
  media?: {
    episodes?: { season_number?: number; episode_number?: number; name?: string; air_date?: string | null }[]
    seasons?: { season_number?: number }[]
  }
}

/** The episodes a part covers, in order (or just its seasons when TMDB doesn't list episodes). */
export function parseCreditEpisodes(raw: RawCredit): PartEpisodes {
  const episodes = (raw.media?.episodes ?? [])
    .filter((e) => e.season_number != null && e.episode_number != null)
    .map((e) => ({ season: e.season_number!, number: e.episode_number!, name: e.name || `Episode ${e.episode_number}`, airDate: e.air_date || null }))
    .sort((a, b) => a.season - b.season || a.number - b.number)
  const seasons = [...new Set((raw.media?.seasons ?? []).map((s) => s.season_number).filter((n): n is number => n != null))].sort((a, b) => a - b)
  return { episodes, seasons }
}

interface RawCollection {
  id: number
  name?: string
  overview?: string
  poster_path?: string | null
  parts?: RawTitleCredit[]
}

interface RawList {
  id?: number | string
  name?: string
  description?: string
  poster_path?: string | null
  items?: RawTitleCredit[]
}
