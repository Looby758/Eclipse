/**
 * Shapes shared by the whole app. Everything in src/core is plain TypeScript with no Electron or
 * UI code, so this folder could be dropped into Orbit (or tested on its own) as it is.
 */

export type MediaType = 'movie' | 'tv'

/** How a title is named everywhere (library file, cache, routes): e.g. "movie:157336" or "tv:1396". */
export type TitleKey = `${MediaType}:${number}`

export const titleKey = (type: MediaType, id: number): TitleKey => `${type}:${id}`

export function parseTitleKey(key: string): { type: MediaType; id: number } | null {
  const m = /^(movie|tv):(\d+)$/.exec(key)
  return m ? { type: m[1] as MediaType, id: Number(m[2]) } : null
}

/** One search result (people are left out: Phase 1 only searches films and shows). */
export interface SearchResult {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  year: number | null
  posterPath: string | null
  overview: string
  popularity: number
}

export interface Season {
  number: number
  name: string
  episodeCount: number
  airDate: string | null
  posterPath: string | null
}

export interface NextEpisode {
  season: number
  episode: number
  name: string
  airDate: string | null
}

/** Everything the title page shows about a film or show. */
export interface TitleDetails {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  originalName: string | null
  year: number | null
  /** Release date (films) or first air date (shows), YYYY-MM-DD. */
  date: string | null
  tagline: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  genres: string[]
  /** Minutes: the film's length, or a typical episode's for a show. */
  runtime: number | null
  /** TMDB's own status, e.g. "Released", "Returning Series", "Ended". */
  status: string
  voteAverage: number | null
  voteCount: number
  /** Shows only (empty for films). Specials (season 0) are included and listed last. */
  seasons: Season[]
  numberOfSeasons: number | null
  numberOfEpisodes: number | null
  nextEpisode: NextEpisode | null
  lastAirDate: string | null
  /** Films only: the TMDB collection (franchise) it belongs to. */
  collection: { id: number; name: string } | null
  /** Films: whether TMDB tags a scene during the credits and one after them (null for shows; missing in old saved copies). */
  stingers?: { during: boolean; after: boolean } | null
  /** The YouTube key of its trailer, if TMDB lists one. */
  trailer?: string | null
}

export type WatchStatus = 'want' | 'watching' | 'watched' | 'stopped'

export const WATCH_STATUSES: WatchStatus[] = ['want', 'watching', 'watched', 'stopped']

export const STATUS_LABELS: Record<WatchStatus, string> = {
  want: 'Want to watch',
  watching: 'Watching',
  watched: 'Watched',
  stopped: 'Stopped'
}

/** Enough about a title to list it without asking TMDB (so the library works offline). */
export interface TitleSnapshot {
  name: string
  year: number | null
  posterPath: string | null
}

export interface LibraryEntry {
  key: TitleKey
  type: MediaType
  id: number
  status: WatchStatus
  /** ISO timestamps. */
  addedAt: string
  updatedAt: string
  /** The day it was marked Watched (YYYY-MM-DD, your local date). Kept if the status changes later. */
  watchedOn?: string
  /** A one-line note, e.g. "watched with Dad at Christmas". */
  note?: string
  /** Who (or what) recommended it: "Sam", "a podcast", "the trailer before Dune". */
  from?: string
  /** Your own rating out of 10, if you gave one (e.g. brought over from Sequel). */
  rating?: number
  /** Shows: the episodes you've seen, by episodeKey ("S1E3"), each with the day you ticked it ("seen" when there's no date). */
  episodes?: Record<string, string>
  /** Watched before you used Eclipse (or Sequel), with no date. */
  seenBefore?: boolean
  /** Times you've watched it again, oldest first. The last one may still be going (no finishedOn). */
  rewatches?: Rewatch[]
  /** Shows: the day you want to have finished it by (YYYY-MM-DD), for "Finish it by Friday". */
  finishBy?: string
  title: TitleSnapshot
}

/** One time you watched something again. Shaped so a watch with someone else can be added later. */
export interface Rewatch {
  startedOn: string
  /** Missing while you're still rewatching. */
  finishedOn?: string
  /** Shows: this rewatch's own episode ticks, by episodeKey, each with its day. */
  episodes?: Record<string, string>
  /** Watching with someone ("Sam"): kept apart from your own progress, and several can run at once. */
  with?: string
}

/** An episode ticked as seen with no date (watched before Eclipse). */
export const UNDATED = 'seen'

/** "S1E3": how an episode is named in your library file. */
export const episodeKey = (season: number, episode: number): string => `S${season}E${episode}`

export function parseEpisodeKey(key: string): { season: number; episode: number } | null {
  const m = /^S(\d+)E(\d+)$/.exec(key)
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null
}

/** Your choices that follow you between computers (kept in library.json). */
export interface Preferences {
  /** Two-letter country for where-to-watch, e.g. "GB". */
  region: string
  /** The streaming services you pay for, by TMDB provider id (e.g. 337 Disney+, 39 NOW TV). */
  services: number[]
  /** When your evening's watching usually starts, "HH:MM". */
  startTime: string
  /** When you go to bed, "HH:MM" (after midnight is fine, e.g. "00:30"). */
  bedtime: string
  /** The nights you usually watch: 0 Sunday … 6 Saturday. */
  watchDays: number[]
  /** The day of the month each of your services renews, by provider id (optional). */
  renewals: Record<string, number>
  /** Release calendar: every new episode, not just new seasons, finales and films. */
  calendarEpisodes: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  region: 'GB',
  services: [],
  startTime: '20:00',
  bedtime: '23:00',
  watchDays: [1, 2, 3, 4, 5],
  renewals: {},
  calendarEpisodes: false
}

/** Your library file (library.json in your data folder). */
export interface Library {
  version: 1
  entries: Record<string, LibraryEntry>
  preferences?: Preferences
  /** Lists you're following or made: people, collections, guides, TMDB lists and your own. */
  lists?: SavedList[]
  /** Watch soon: the few films and shows you want to get to next, in your order. */
  watchSoon?: TitleRef[]
}

// ---- Lists, completion and watch orders ----

/** Enough about a title to list it (and order it by release). */
export interface TitleRef {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  year: number | null
  posterPath: string | null
  /** Release or first air date, YYYY-MM-DD, when known (a season's own air date for a season). */
  date?: string | null
  /** Watch orders go season by season: this row is just this season of the show. */
  season?: number
  /** How many episodes the season has, so it counts as seen once they're all ticked. */
  episodes?: number
  /** Watch orders: the parts of the order it belongs to (e.g. "The Defenders"). */
  sections?: string[]
}

export type ListSource =
  | { kind: 'person'; personId: number; role: 'director' | 'actor' }
  | { kind: 'collection'; collectionId: number }
  | { kind: 'tmdbList'; listId: number }
  | { kind: 'guide'; guideId: string }
  | { kind: 'custom' }
  /** Everything in your library recommended by one person or place ("from Sam"). Not saved; made from your library. */
  | { kind: 'from'; name: string }

/** A list in your library. Only your own lists keep their titles here; the rest come from TMDB or the guides. */
export interface SavedList {
  /** e.g. "person:525:director", "collection:263", "tmdblist:8", "guide:marvel", "custom:x7k2". */
  id: string
  name: string
  source: ListSource
  addedAt: string
  /** Your own lists: the titles, in your order. */
  items?: TitleRef[]
  /** A picture for the list (a person's photo or a collection's poster). */
  imagePath?: string | null
}

export interface PersonRef {
  id: number
  name: string
  profilePath: string | null
  /** e.g. "Director" or the character played. */
  role: string
}

export interface Credits {
  directors: PersonRef[]
  cast: PersonRef[]
}

export interface PersonDetails {
  id: number
  name: string
  profilePath: string | null
  knownFor: string
  /** Films they directed. */
  directed: TitleRef[]
  /** Films and shows they acted in (appearances as themselves and one-off TV guest spots left out). */
  acted: TitleRef[]
}

export interface CollectionDetails {
  id: number
  name: string
  overview: string
  posterPath: string | null
  parts: TitleRef[]
}

export interface TmdbListDetails {
  id: number
  name: string
  description: string
  posterPath: string | null
  items: TitleRef[]
}

// ---- Episodes and where to watch (from TMDB) ----

export interface Episode {
  season: number
  number: number
  name: string
  airDate: string | null
  runtime: number | null
  overview: string
  voteAverage: number | null
  voteCount: number
  stillPath: string | null
}

export interface SeasonDetails {
  tvId: number
  number: number
  name: string
  episodes: Episode[]
}

export interface Provider {
  id: number
  name: string
  logoPath: string | null
}

/** Where a title can be watched in one country (TMDB's data comes from JustWatch). */
export interface WatchProviders {
  region: string
  /** TMDB's page listing every option, with links through to each service. */
  link: string | null
  stream: Provider[]
  free: Provider[]
  rent: Provider[]
  buy: Provider[]
}

/** How you can watch something, for the filters. */
export type Availability = 'mine' | 'stream' | 'rentbuy' | 'none'
