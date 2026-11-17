import type { Library, LibraryEntry, TitleDetails } from './types'
import { UNDATED, parseEpisodeKey } from './types'
import { timeLeft } from './time'

/**
 * Gentle nudges for Home. Phase 21: a show you've stopped watching without saying so ("Keep going
 * or stop?"). Phase 22: a new season of a show you finished the last one of long ago ("Season 4 is
 * out. You finished season 3 in March 2024"), with a reminder of how the last season ended.
 */

const DAY = 86_400_000
const dayMs = (d: string): number => Date.parse(`${d}T12:00:00Z`)
const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY)

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const snoozed = (e: LibraryEntry, today: string): boolean => !!e.snoozedUntil && e.snoozedUntil > today

/** The latest day you ticked an episode (undated ticks don't count), or null. */
export function lastTicked(episodes: Record<string, string> | undefined, season?: number): string | null {
  let last: string | null = null
  for (const [k, day] of Object.entries(episodes ?? {})) {
    const p = parseEpisodeKey(k)
    if (!p || day === UNDATED || (season !== undefined && p.season !== season)) continue
    if (!last || day > last) last = day
  }
  return last
}

export interface StalledShow {
  entry: LibraryEntry
  /** The last day you watched an episode (or added it, if you never have). */
  lastDay: string
  days: number
}

/**
 * Shows marked Watching that you haven't ticked an episode of in `days` days, longest first. A show
 * you're caught up on (waiting for the next season) isn't stalled, when its details are known.
 */
export function stalledShows(library: Library, today: string, days = 60, details: Record<string, TitleDetails> = {}): StalledShow[] {
  const out: StalledShow[] = []
  for (const e of Object.values(library.entries)) {
    if (e.type !== 'tv' || e.status !== 'watching' || snoozed(e, today)) continue
    const d = details[e.key]
    if (d && timeLeft(d, e, today).episodes === 0) continue
    // A rewatch you're on counts as watching it.
    const ticks = [lastTicked(e.episodes), ...(e.rewatches ?? []).map((r) => lastTicked(r.episodes)), e.addedAt.slice(0, 10)]
    const lastDay = ticks.filter((d): d is string => !!d).sort().pop()!
    const gap = daysBetween(lastDay, today)
    if (gap >= days) out.push({ entry: e, lastDay, days: gap })
  }
  return out.sort((a, b) => b.days - a.days)
}

export interface ComebackShow {
  entry: LibraryEntry
  /** The new season. */
  season: number
  airDate: string
  /** When you finished the season before it. */
  finishedOn: string
}

/**
 * Shows with a new season out in the last `recentDays` days, where you finished the season before
 * it at least `gapDays` before that and haven't started the new one.
 */
export function comebacks(library: Library, details: Record<string, TitleDetails>, today: string, gapDays = 180, recentDays = 45): ComebackShow[] {
  const since = addDays(today, -recentDays)
  const out: ComebackShow[] = []
  for (const e of Object.values(library.entries)) {
    if (e.type !== 'tv' || e.status === 'stopped' || e.status === 'want' || snoozed(e, today)) continue
    const d = details[e.key]
    if (!d) continue
    const regular = d.seasons.filter((s) => s.number > 0)
    const fresh = regular.filter((s) => s.number > 1 && s.airDate && s.airDate <= today && s.airDate >= since).sort((a, b) => b.number - a.number)[0]
    if (!fresh) continue
    const before = regular.find((s) => s.number === fresh.number - 1)
    if (!before || !before.episodeCount) continue
    const eps = e.episodes ?? {}
    const startedNew = Object.keys(eps).some((k) => parseEpisodeKey(k)?.season === fresh.number)
    if (startedNew) continue
    // Finished the season before: every episode of it ticked, the last one with a date.
    let all = true
    for (let n = 1; n <= before.episodeCount; n++) if (!eps[`S${before.number}E${n}`]) all = false
    const finishedOn = lastTicked(eps, before.number)
    if (!all || !finishedOn) continue
    if (daysBetween(finishedOn, fresh.airDate!) < gapDays) continue
    out.push({ entry: e, season: fresh.number, airDate: fresh.airDate!, finishedOn })
  }
  return out.sort((a, b) => b.airDate.localeCompare(a.airDate))
}

/** The day `n` days after `day` (for "remind me in a month"). */
export const daysAfter = addDays
