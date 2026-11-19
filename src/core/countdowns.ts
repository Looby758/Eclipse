import type { Library, TitleDetails, TitleRef } from './types'
import { normalizeWatchSoon } from './lists'
import { filmRelease } from './shelf'
import { addDay } from './premiere'

/**
 * Countdowns on Home (asked for with phase 50): pick a film or show you're waiting for on its page
 * ("Count down on Home") and Home counts the days to it, e.g. Avengers: Doomsday. Saved in the
 * library, so both computers show the same ones.
 */

/** Enough to be useful without crowding Home. */
export const COUNTDOWNS_MAX = 8

/** How long after the day it stays on Home, saying it's out. */
export const OUT_SHOWN_DAYS = 3

export const hasCountdown = (library: Library, key: string): boolean => !!library.countdowns?.some((r) => r.key === key)

/** Adds a countdown (at the end) or takes it off. */
export function setCountdown(library: Library, ref: TitleRef, on: boolean): Library {
  const list = library.countdowns ?? []
  const has = list.some((r) => r.key === ref.key)
  if (on === has) return library
  if (on && list.length >= COUNTDOWNS_MAX) return library
  const { season: _s, episodes: _e, sections: _x, role: _r, roleEpisodes: _re, creditIds: _c, ...clean } = ref
  const next = on ? [...list, clean] : list.filter((r) => r.key !== ref.key)
  const out: Library = { ...library, countdowns: next }
  if (!next.length) delete out.countdowns
  return out
}

export function normalizeCountdowns(raw: unknown): TitleRef[] | undefined {
  return normalizeWatchSoon(raw)?.slice(0, COUNTDOWNS_MAX)
}

/** What a countdown counts to: the day (or null when it's announced without one) and what's coming. */
export interface CountdownTarget {
  date: string | null
  /** "In cinemas", "Season 3", "Episode 5 of season 2" or "Out". */
  label: string
}

/**
 * The day a title is coming: a film's UK release (cinemas first); a show's next season (or next
 * episode when it's partway through one). Null when nothing is coming (released long ago, or ended).
 */
export function countdownTarget(d: TitleDetails, today: string, region = 'GB'): CountdownTarget | null {
  const gone = addDay(today, -OUT_SHOWN_DAYS)
  if (d.type === 'movie') {
    const { date, cinema } = filmRelease(d, region)
    if (date) return date >= gone ? { date, label: cinema ? 'In cinemas' : 'Out' } : null
    return d.status === 'Released' ? null : { date: null, label: 'In cinemas' }
  }
  const n = d.nextEpisode
  if (n?.airDate && n.airDate >= gone) return { date: n.airDate, label: n.episode === 1 ? `Season ${n.season}` : `Episode ${n.episode} of season ${n.season}` }
  if (d.status === 'Ended' || d.status === 'Canceled') return null
  // A season TMDB lists before it has a next episode.
  const later = d.seasons.filter((s) => s.number > 0 && (!s.airDate || s.airDate >= gone) && (s.airDate || s.episodeCount === 0)).sort((a, b) => a.number - b.number)[0]
  if (later) return { date: later.airDate, label: `Season ${later.number}` }
  if (n) return { date: n.airDate, label: `Season ${n.season}` }
  return d.status === 'Returning Series' ? { date: null, label: 'Next season' } : null
}

/** Whole days from today to the day (0 on the day, below 0 after it). */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
}
