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

/** One film or show search result (people are searched separately, see PersonResult). */
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
  /** Films: release dates by country ("GB"): the first in cinemas, and the first of any kind. Missing in old saved copies. */
  releases?: Record<string, { cinema: string | null; any: string }>
  /** The title's own logo artwork (English or no text), for the Spotlight title page. Missing in old saved copies. */
  logoPath?: string | null
  /** TMDB's keywords, lower case (finds franchises like Star Wars for "the same universe"). Missing in old saved copies. */
  keywords?: string[]
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
  /** Phase 47: how each episode of your first watch hit you, by episodeKey (only ticked ones). */
  reactions?: Record<string, Reaction>
  /** Watched before you used Eclipse (or Sequel), with no date. */
  seenBefore?: boolean
  /** Times you've watched it again, oldest first. The last one may still be going (no finishedOn). */
  rewatches?: Rewatch[]
  /** Shows: the day you want to have finished it by (YYYY-MM-DD), for "Finish it by Friday". */
  finishBy?: string
  /** Don't nudge about it ("keep going or stop?", "season 4 is out") before this day (YYYY-MM-DD). */
  snoozedUntil?: string
  /** Moments you bookmarked while watching (Phase 30). */
  moments?: import('./watching').Moment[]
  /** Where you watch it, learnt from your browser (Phase 31): the show's page and the last episode played. */
  links?: import('./watching').PlayLinks
  title: TitleSnapshot
}

/** One time you watched something again. Shaped so a watch with someone else can be added later. */
export interface Rewatch {
  startedOn: string
  /** Missing while you're still rewatching. */
  finishedOn?: string
  /** Shows: this rewatch's own episode ticks, by episodeKey, each with its day. */
  episodes?: Record<string, string>
  /** Phase 47: how each episode hit you this time, by episodeKey (only ticked ones). */
  reactions?: Record<string, Reaction>
  /** Watching with someone ("Sam"): kept apart from your own progress, and several can run at once. */
  with?: string
  /** Watching with someone: the next time you've arranged, and whether it's the same time every week. */
  planned?: PlannedTime
}

/** A time arranged with someone: local "YYYY-MM-DDTHH:MM". */
export interface PlannedTime {
  at: string
  weekly?: boolean
}

/** A milestone's id (phase 53): its measure and step, e.g. "episodes:1000", "hours:tv:1402:100", "genre:Drama:25". */
export const MILESTONE_ID = /^[a-z]+(:[^:\n]{1,80}){0,2}:\d+$/
/**
 * Phase 47, "My own heatmap": the one-tap answer to how an episode hit you.
 * 😭 wrecked, 🔥 brilliant, 😂 funny, 😴 dragged, 🤯 mind-blown.
 */
export type Reaction = 'cry' | 'fire' | 'laugh' | 'sleep' | 'wow'

export const REACTION_LIST: Reaction[] = ['cry', 'fire', 'laugh', 'sleep', 'wow']

export const REACTIONS: Record<Reaction, { emoji: string; label: string }> = {
  cry: { emoji: '😭', label: 'Wrecked me' },
  fire: { emoji: '🔥', label: 'Brilliant' },
  laugh: { emoji: '😂', label: 'Made me laugh' },
  sleep: { emoji: '😴', label: 'Dragged' },
  wow: { emoji: '🤯', label: 'Mind-blown' }
}

/** An episode ticked as seen with no date (watched before Eclipse). */
export const UNDATED = 'seen'

/** "S1E3": how an episode is named in your library file. */
export const episodeKey = (season: number, episode: number): string => `S${season}E${episode}`

export function parseEpisodeKey(key: string): { season: number; episode: number } | null {
  const m = /^S(\d+)E(\d+)$/.exec(key)
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null
}

/** A stretch of watching on one day, "HH:MM" to "HH:MM" (an end before the start is after midnight). */
export interface WatchSlot {
  start: string
  end: string
}

/** One evening that's different from the usual. */
export interface JustTonight {
  /** The evening it applies to, "YYYY-MM-DD". */
  day: string
  off?: boolean
  /** Starting later than usual, "HH:MM". */
  start?: string
  /** A different bedtime, "HH:MM". */
  bedtime?: string
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
  /**
   * Your week (phase 35): for each day, 0 Sunday … 6 Saturday, the times you watch (none = not
   * watching). startTime, bedtime and watchDays above are kept in step with it as "your usual evening".
   */
  schedule: WatchSlot[][]
  /** A change to one evening only ("Not watching tonight", "Starting late", "Later bedtime tonight"). */
  justTonight?: JustTonight | null
  /** Minutes between episodes. */
  gapMinutes: number
  /** Minutes before bed with nothing on. */
  windDownMinutes: number
  /** About how much to watch a week, in minutes (0: no budget). */
  weeklyBudgetMinutes: number
  /** The day of the month each of your services renews, by provider id (optional). */
  renewals: Record<string, number>
  /** Release calendar: every new episode, not just new seasons, finales and films. */
  calendarEpisodes: boolean
  /** Ask "keep going or stop?" about a show you haven't watched in this many days. */
  stalledDays: number
  /** Catch up before the sequel: skip anything you watched within this many days (0 never skips). */
  catchUpSkipDays: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  region: 'GB',
  services: [],
  startTime: '20:00',
  bedtime: '23:00',
  watchDays: [1, 2, 3, 4, 5],
  schedule: [0, 1, 2, 3, 4, 5, 6].map((d) => (d >= 1 && d <= 5 ? [{ start: '20:00', end: '23:00' }] : [])),
  gapMinutes: 0,
  windDownMinutes: 0,
  weeklyBudgetMinutes: 0,
  renewals: {},
  calendarEpisodes: false,
  stalledDays: 60,
  catchUpSkipDays: 365
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
  /** Titles dropped while clearing out the watchlist, newest first (the last 30), so they can come back. */
  dropped?: Dropped[]
  /** Repair old dates: batches you chose to leave as they are ("tv:1396@2023-03-04"), so they aren't offered again. */
  repairLeft?: string[]
  /** Catch up before the sequel: ones you said "Not now" to ("movie:438631>movie:1170608"). */
  catchUpDismissed?: string[]
  /** Recommendations you said "Not for me" to, by title key. */
  recsHidden?: string[]
  /** What recommendations have learnt from your Interested and Not for me answers (phase 43). */
  recsTaste?: Taste
  /** Eclipse on your phone (Phase 45): ids of the phone's changes already folded in (the phone then tidies them away). */
  phoneApplied?: string[]
  /** Posters you chose yourself (phase 55), by title key: TMDB's file path ("/abc.jpg"), used everywhere instead of the default. */
  posters?: Record<string, string>
  /** Backgrounds you chose for a title's page, by title key (same shape as posters). */
  backdrops?: Record<string, string>
  /** Your favourites wall (phase 58): your all-time top films and shows, in your order. */
  favourites?: TitleRef[]
  /** Milestones already shown (phase 53), e.g. "episodes:1000" or "hours:tv:1402:100", so each shows only once. */
  milestones?: string[]
  /** Countdowns on Home: films and shows you're waiting for, in the order you added them. */
  countdowns?: TitleRef[]
}

/**
 * Something a film or show has that recommendations can learn from: who made it, where it was on,
 * who's in it and TMDB's keywords. Its id says which ("creator:1222", "network:174", "cast:17419",
 * "keyword:12554").
 */
export interface Trait {
  id: string
  name: string
}

/** Learnt weights by trait id (above 0: you've said yes to things with it; below 0: no). */
export interface Taste {
  weights: Record<string, { w: number; name: string }>
  /** How many Interested and Not for me answers it has learnt from. */
  yes: number
  no: number
}

/** A title taken off your library while clearing out the watchlist, kept whole so it can be put back. */
export interface Dropped {
  entry: LibraryEntry
  droppedAt: string
  /** It was on Watch soon too. */
  soon?: boolean
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
  /** On an actor's list: the part they played (e.g. "Kim Wexler"). */
  role?: string
  /** On an actor's list (shows): how many episodes they were in, and TMDB's ids for the part. */
  roleEpisodes?: number
  creditIds?: string[]
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
  /** Shows: how many episodes they were in. */
  episodes?: number
  /** TMDB's ids for their part(s), to look up which episodes they were in. */
  creditIds?: string[]
}

/** Which episodes of a show someone was in, from TMDB. */
export interface PartEpisodes {
  episodes: { season: number; number: number; name: string; airDate: string | null }[]
  /** When TMDB only knows the seasons (usual for the main cast). */
  seasons: number[]
}

export interface Credits {
  directors: PersonRef[]
  /** The main cast (the first 12). */
  cast: PersonRef[]
  /** Everyone who was ever in it, main cast first (for "Full cast"). */
  fullCast?: PersonRef[]
}

/** A person found by search. */
export interface PersonResult {
  id: number
  name: string
  profilePath: string | null
  /** e.g. "Acting" or "Directing". */
  knownFor: string
  /** A few titles they're best known for, e.g. ["The Walking Dead", "The Mitchells vs. the Machines"]. */
  knownTitles: string[]
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
  /** TMDB ids of the guest stars in it (to find which episodes someone was in). */
  guestStars?: number[]
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
/** On your services, free (BBC iPlayer, ITVX, Channel 4, My5…), streaming elsewhere, rent or buy only, or nowhere. */
export type Availability = 'mine' | 'free' | 'stream' | 'rentbuy' | 'none'
