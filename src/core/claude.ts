import type { Library, LibraryEntry, MediaType, SearchResult, TitleDetails, TitleKey } from './types'
import { STATUS_LABELS, episodeKey, parseEpisodeKey, parseTitleKey } from './types'
import { activeEntry, currentRewatch, nextEpisodeFor, showProgress } from './library'
import { fold } from './find'

/**
 * Plain helpers for the Claude Desktop connection (main/claudeTools.ts): finding the film or show
 * Claude means by name, working out which episodes "up to season 2 episode 4" is, and writing
 * things out as text Claude reads. No Electron here, so it's all tested on its own.
 */

/**
 * "Dune (2021)" or "Dune" → the name and the year, if one was given. Only a year in brackets
 * counts, so "Blade Runner 2049" and "Wonder Woman 1984" keep their names.
 */
export function parseWant(raw: string): { name: string; year: number | null } {
  const text = raw.trim()
  const m = /^(.*?)\s*\(((?:18|19|20)\d{2})\)$/.exec(text)
  if (m && m[1].trim()) return { name: m[1].trim(), year: Number(m[2]) }
  return { name: text, year: null }
}

/** A title key Claude passed ("tv:1396"), or null when it passed a name. */
export const keyOf = (raw: string): TitleKey | null => {
  const t = raw.trim().toLowerCase()
  return parseTitleKey(t) ? (t as TitleKey) : null
}

/**
 * The library entries Claude could mean: the exact name (and year, if given) first; else every
 * entry whose name has all the words in. Several come back when it really is ambiguous.
 */
export function findInLibrary(library: Library, want: string, type?: MediaType): LibraryEntry[] {
  const key = keyOf(want)
  if (key) return library.entries[key] ? [library.entries[key]] : []
  const { name, year } = parseWant(want)
  const w = fold(name)
  if (!w) return []
  const all = Object.values(library.entries).filter((e) => !type || e.type === type)
  const yearOk = (e: LibraryEntry): boolean => !year || e.title.year === year
  const exact = all.filter((e) => fold(e.title.name) === w && yearOk(e))
  if (exact.length) return exact
  const words = w.split(' ')
  return all.filter((e) => {
    const n = fold(e.title.name)
    const squashed = n.replace(/ /g, '')
    return yearOk(e) && words.every((x) => n.includes(x) || squashed.includes(x))
  })
}

/**
 * Picks from TMDB's search results: the only exact name match (with the year and type, if given),
 * or nothing when it isn't clear (the options are then listed for Claude to choose by key).
 */
export function pickFromSearch(results: SearchResult[], want: string, type?: MediaType): { pick: SearchResult | null; options: SearchResult[] } {
  const { name, year } = parseWant(want)
  const w = fold(name)
  const options = results.filter((r) => (!type || r.type === type) && (!year || r.year === year))
  const exact = options.filter((r) => fold(r.name) === w)
  if (exact.length === 1) return { pick: exact[0], options }
  // Several with the same name (a remake, a film and its show): the far more popular one, if it's clear.
  if (exact.length > 1) {
    const [a, b] = [...exact].sort((x, y) => y.popularity - x.popularity)
    if (a.popularity >= b.popularity * 5) return { pick: a, options: exact }
    return { pick: null, options: exact }
  }
  return { pick: null, options }
}

export const yearText = (year: number | null | undefined): string => (year ? ` (${year})` : '')

/** "Breaking Bad (2008) [tv:1396]": how a title is named in answers, key included for the next call. */
export const titleLabel = (t: { key: string; name: string; year: number | null }): string => `${t.name}${yearText(t.year)} [${t.key}]`

export const entryLabel = (e: LibraryEntry): string => titleLabel({ key: e.key, name: e.title.name, year: e.title.year })

export const episodeLabel = (season: number, episode: number): string => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

/** One line about something in the library: status, progress, rating and note. */
export function entryLine(raw: LibraryEntry, d?: Pick<TitleDetails, 'seasons'>): string {
  const e = activeEntry(raw)!
  const bits = [`${entryLabel(raw)}: ${STATUS_LABELS[e.status]}${e.type === 'movie' ? ' (film)' : ' (show)'}`]
  if (currentRewatch(raw)) bits.push('rewatching')
  if (e.type === 'tv') {
    const ticked = Object.keys(e.episodes ?? {}).filter((k) => parseEpisodeKey(k)).length
    if (d) {
      const p = showProgress(e, d.seasons)
      bits.push(`${p.watched} of ${p.total} episodes`)
      const next = e.status !== 'watched' ? nextEpisodeFor(e, d.seasons) : null
      if (next && p.watched) bits.push(`next ${episodeLabel(next.season, next.episode)}`)
    } else if (ticked) bits.push(`${ticked} episodes ticked`)
  }
  if (raw.watchedOn) bits.push(`watched on ${raw.watchedOn}`)
  if (raw.rating) bits.push(`rated ${raw.rating}/10`)
  if (raw.from) bits.push(`from ${raw.from}`)
  if (raw.note) bits.push(`note: “${raw.note}”`)
  return bits.join(', ')
}

/** Seasons as TMDB lists them, just what's needed to count episodes. */
export type SeasonCounts = { number: number; episodeCount: number }[]

/**
 * Which episodes Claude means, as episode keys:
 * - a whole season (no episode), or one episode, or `episode` to `toEpisode`;
 * - `upTo`: everything from S1E1 to that episode (Eclipse's "Watched up to here"), specials left out;
 * - `all`: every episode of every season (not specials).
 */
export function episodesFor(seasons: SeasonCounts, want: { season?: number; episode?: number; toEpisode?: number; upTo?: boolean; all?: boolean }): string[] {
  const regular = [...seasons].filter((s) => s.number > 0).sort((a, b) => a.number - b.number)
  const range = (season: number, from: number, to: number): string[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => episodeKey(season, from + i))
  if (want.all) return regular.flatMap((s) => range(s.number, 1, s.episodeCount))
  if (want.season === undefined) throw new Error('Say which season (or all: true for the whole show).')
  const s = seasons.find((x) => x.number === want.season)
  if (!s) throw new Error(`There’s no season ${want.season}. It has ${regular.map((x) => x.number).join(', ') || 'no seasons yet'}.`)
  if (want.episode !== undefined && (want.episode < 1 || want.episode > s.episodeCount)) throw new Error(`Season ${s.number} has ${s.episodeCount} episodes.`)
  if (want.upTo) {
    if (want.episode === undefined) throw new Error('Say which episode to tick up to.')
    return [...regular.filter((x) => x.number < s.number).flatMap((x) => range(x.number, 1, x.episodeCount)), ...range(s.number, 1, want.episode)]
  }
  if (want.episode === undefined) return range(s.number, 1, s.episodeCount)
  const to = Math.min(want.toEpisode ?? want.episode, s.episodeCount)
  return range(s.number, want.episode, Math.max(to, want.episode))
}

/** "S1E1 to S1E8, S2E1" in short: how a batch of ticks is described back to Claude. */
export function episodesText(keys: string[]): string {
  const eps = keys.map(parseEpisodeKey).filter((e): e is { season: number; episode: number } => !!e)
  if (!eps.length) return 'no episodes'
  const runs: string[] = []
  let start = eps[0]
  let prev = eps[0]
  const flush = (): void => void runs.push(start === prev ? episodeLabel(start.season, start.episode) : `${episodeLabel(start.season, start.episode)} to ${episodeLabel(prev.season, prev.episode)}`)
  for (const e of eps.slice(1)) {
    if (e.season === prev.season && e.episode === prev.episode + 1) prev = e
    else {
      flush()
      start = prev = e
    }
  }
  flush()
  return runs.join(', ')
}

/** "2h 05m" style hours for answers. */
export function hoursText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** A day between two others, inclusive (YYYY-MM-DD strings compare as text). */
export const between = (day: string | null | undefined, from: string, to: string): boolean => !!day && day >= from && day <= to
