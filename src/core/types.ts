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
  title: TitleSnapshot
}

/** Your library file (library.json in your data folder). */
export interface Library {
  version: 1
  entries: Record<string, LibraryEntry>
}
