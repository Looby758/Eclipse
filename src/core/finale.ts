import type { Episode, Library, LibraryEntry } from './types'
import { UNDATED, parseEpisodeKey } from './types'
import { showProgress, type SeasonCounts } from './library'
import { finishedShelf } from './shelf'
import { DEFAULT_EPISODE_MINUTES } from './time'

/**
 * Phase 46 (with 48 folded in): finishing a show is an event. When you tick the last episode of a
 * show that has ended, the screen goes dark and a short "trailer" of your time with it plays to the
 * show's own theme, ending in a finale. Nothing for seasons or films.
 *
 * Everything here is plain data: what to show (finaleStats), when to show it (justFinished), how a
 * theme tune is shaped (themeShape) and when each moment happens (finaleTimeline).
 */

/** A longest night only counts from this many episodes. */
export const NIGHT_MIN = 3
/** A break only counts from this many days without ticking anything. */
export const BREAK_MIN_DAYS = 30

export interface FinaleStats {
  key: string
  name: string
  /** First and last tick (YYYY-MM-DD). */
  startedOn: string
  finishedOn: string
  /** From the first tick to the last, counting both days. */
  days: number
  firstEpisode: { season: number; episode: number; name: string | null }
  episodes: number
  seasons: number
  minutes: number
  /** People you watched some of it with, and how many episodes. */
  together: { who: string; episodes: number }[]
  longestNight: { count: number; day: string } | null
  longestBreak: { days: number; afterSeason: number } | null
  /** TMDB's best-rated episode. */
  best: { season: number; episode: number; name: string; rating: number } | null
  /** Counting this one: how many shows you've finished. */
  finishedCount: number
}

const ended = (status: string | undefined): boolean => status === 'Ended' || status === 'Canceled'

const dayNumber = (day: string): number => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000)
export const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from)

/** Every regular episode of the show ticked on your own watch. */
export function isComplete(entry: LibraryEntry | undefined, seasons: SeasonCounts): boolean {
  const p = showProgress(entry, seasons)
  return p.total > 0 && p.watched >= p.total
}

/** Regular-season ticks with a real date, in watching order. */
function datedTicks(entry: LibraryEntry, seasons: SeasonCounts): { season: number; episode: number; day: string }[] {
  const regular = new Map(seasons.filter((s) => s.number > 0).map((s) => [s.number, s.episodeCount]))
  return Object.entries(entry.episodes ?? {})
    .map(([k, day]) => ({ ...parseEpisodeKey(k)!, day, ok: !!parseEpisodeKey(k) }))
    .filter((t) => t.ok && t.day !== UNDATED && /^\d{4}-\d{2}-\d{2}$/.test(t.day) && t.episode <= (regular.get(t.season) ?? 0))
    .map(({ season, episode, day }) => ({ season, episode, day }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.season - b.season || a.episode - b.episode)
}

/**
 * Whether this change to the library is you finishing the show: it has ended, it wasn't complete
 * before and is now, and the last tick is from today or last night (so a sync that brings in an
 * old finish, or a show ticked as seen before Eclipse, doesn't set it off).
 */
export function justFinished(before: LibraryEntry | undefined, after: LibraryEntry | undefined, seasons: SeasonCounts, showStatus: string | undefined, today: string): boolean {
  if (!after || after.type !== 'tv' || !ended(showStatus)) return false
  if (isComplete(before, seasons) || !isComplete(after, seasons)) return false
  const ticks = datedTicks(after, seasons)
  if (!ticks.length) return false
  const last = ticks[ticks.length - 1].day
  return daysBetween(last, today) <= 1 && daysBetween(last, today) >= 0
}

/** The numbers and moments for the send-off. Null when there's nothing dated to tell. */
export function finaleStats(library: Library, key: string, seasons: SeasonCounts, episodes: Episode[], typicalMinutes: number | null): FinaleStats | null {
  const entry = library.entries[key]
  if (!entry) return null
  const ticks = datedTicks(entry, seasons)
  if (!ticks.length) return null
  const regular = seasons.filter((s) => s.number > 0)
  const total = regular.reduce((n, s) => n + s.episodeCount, 0)
  const byKey = new Map(episodes.map((e) => [`${e.season}:${e.number}`, e]))
  const minutesEach = typicalMinutes || DEFAULT_EPISODE_MINUTES
  let minutes = 0
  for (const s of regular) for (let n = 1; n <= s.episodeCount; n++) minutes += byKey.get(`${s.number}:${n}`)?.runtime || minutesEach

  const startedOn = ticks[0].day
  const finishedOn = ticks[ticks.length - 1].day
  const first = regular.length ? { season: Math.min(...regular.map((s) => s.number)), episode: 1 } : { season: ticks[0].season, episode: ticks[0].episode }

  // Longest night: the most episodes ticked on one day.
  const perDay = new Map<string, number>()
  for (const t of ticks) perDay.set(t.day, (perDay.get(t.day) ?? 0) + 1)
  let night: FinaleStats['longestNight'] = null
  for (const [day, count] of perDay) if (count >= NIGHT_MIN && (!night || count > night.count || (count === night.count && day < night.day))) night = { count, day }

  // Longest break between two ticks, and the season you'd reached.
  let gap: FinaleStats['longestBreak'] = null
  for (let i = 1; i < ticks.length; i++) {
    const d = daysBetween(ticks[i - 1].day, ticks[i].day)
    if (d >= BREAK_MIN_DAYS && (!gap || d > gap.days)) gap = { days: d, afterSeason: ticks[i - 1].season }
  }

  // Best episode by TMDB's rating; a few votes needed so one stray 10 doesn't win.
  let best: FinaleStats['best'] = null
  for (const e of episodes) {
    if (e.season <= 0 || e.voteAverage == null || e.voteCount < 5) continue
    if (!best || e.voteAverage > best.rating) best = { season: e.season, episode: e.number, name: e.name, rating: Math.round(e.voteAverage * 10) / 10 }
  }

  const together = new Map<string, number>()
  for (const r of entry.rewatches ?? []) {
    const n = Object.keys(r.episodes ?? {}).length
    if (r.with && n) together.set(r.with, (together.get(r.with) ?? 0) + n)
  }

  const others = finishedShelf(library).filter((b) => b.type === 'tv' && b.key !== key).length

  return {
    key,
    name: entry.title.name,
    startedOn,
    finishedOn,
    days: daysBetween(startedOn, finishedOn) + 1,
    firstEpisode: { ...first, name: byKey.get(`${first.season}:${first.episode}`)?.name ?? null },
    episodes: total,
    seasons: regular.length,
    minutes,
    together: [...together.entries()].map(([who, n]) => ({ who, episodes: n })).sort((a, b) => b.episodes - a.episodes),
    longestNight: night,
    longestBreak: gap,
    best,
    finishedCount: others + 1
  }
}

// ---- The theme tune ----

export interface ThemeShape {
  /** Seconds. */
  duration: number
  /** Where it gets properly loud (the band comes in), if it has such a moment. */
  drop: number | null
  /** Its last big hit before the end, if there is one. */
  lastHit: number | null
}

/**
 * Reads a theme from its loudness (RMS, one value per `step` seconds): where the band comes in and
 * its last big hit. Themes are often cut off mid-phrase (Plex's are 20 to 60 seconds long), so the
 * finale lands on the last hit and the tune is faded out before it ends, never looped.
 */
export function themeShape(levels: number[], step: number): ThemeShape {
  const duration = levels.length * step
  const db = levels.map((l) => 20 * Math.log10(Math.max(l, 1e-6)))
  const at = (t: number): number => Math.max(0, Math.min(db.length, Math.round(t / step)))
  const mean = (from: number, to: number): number => {
    const a = at(from)
    const b = Math.max(a + 1, at(to))
    let s = 0
    for (let i = a; i < b && i < db.length; i++) s += db[i]
    return s / Math.max(1, Math.min(b, db.length) - a)
  }
  const rise = (t: number, before: number, after: number): number => mean(t, t + after) - mean(t - before, t)

  let drop: number | null = null
  for (let t = 3; t <= duration * 0.6; t += step) {
    if (rise(t, 3, 2) >= 5) {
      // The steepest point in the next second is where it actually hits.
      let bestT = t
      let bestR = -Infinity
      for (let u = t; u <= t + 1; u += step) {
        const r = rise(u, 0.5, 0.5)
        if (r > bestR) [bestR, bestT] = [r, u]
      }
      drop = Math.round(bestT * 100) / 100
      break
    }
  }

  let lastHit: number | null = null
  const from = Math.max((drop ?? 0) + 8, duration * 0.55)
  let bestR = 3
  for (let t = from; t <= duration - 4; t += step) {
    const r = rise(t, 2, 0.5)
    if (r > bestR) [bestR, lastHit] = [r, t]
  }
  if (lastHit != null) {
    // Pin it to the onset itself, so the finale lands on the note rather than just after it.
    let pin = lastHit
    let pinR = -Infinity
    for (let u = lastHit - 0.5; u <= lastHit + 0.3; u += step) {
      const r = rise(u, 0.3, 0.2)
      if (r > pinR) [pinR, pin] = [r, u]
    }
    lastHit = Math.round(pin * 100) / 100
  }
  return { duration, drop, lastHit }
}

// ---- When everything happens ----

export interface FinaleTimeline {
  /** When each highlight comes in (seconds from the start), in the order given. */
  highlights: number[]
  /** The highlight that lands as the band comes in, which gets a flash. */
  flashAt: number | null
  countAt: number
  finaleAt: number
  /** Fade the theme out from here over themeOutFor seconds (null with no theme). */
  themeOutAt: number | null
  themeOutFor: number
}

const PER_HIGHLIGHT = 3.8
const MIN_HIGHLIGHT = 2.4
const COUNT_FOR = 4.2
const FIRST_AT = 1.3

/**
 * Lines the highlights up with the theme: the first ones on its quiet start, the rest from where
 * the band comes in, the numbers counting up as it drops back, and the finale on the last hit.
 * With no theme (or one with no clear shape) it runs at an even pace. `count` highlights are asked
 * for; fewer come back if they wouldn't be readable in the time the theme gives.
 */
export function finaleTimeline(count: number, shape: ThemeShape | null): FinaleTimeline {
  const { drop, lastHit } = shape ?? { drop: null, lastHit: null }
  if (shape && drop != null && lastHit != null && drop >= 2.5 && lastHit - drop >= 8) {
    const countAt = lastHit - COUNT_FOR
    const preRoom = drop - FIRST_AT
    const pre = Math.min(count, preRoom >= 5.5 ? 2 : preRoom >= 2.6 ? 1 : 0)
    const post = Math.min(count - pre, Math.floor((countAt - drop) / MIN_HIGHLIGHT))
    const highlights = [
      ...Array.from({ length: pre }, (_, i) => FIRST_AT + (preRoom / pre) * i),
      ...Array.from({ length: post }, (_, i) => drop + ((countAt - drop) / post) * i)
    ].map((t) => Math.round(t * 100) / 100)
    const themeOutAt = lastHit + 2.1
    return {
      highlights,
      flashAt: post ? drop : null,
      countAt,
      finaleAt: lastHit,
      themeOutAt,
      themeOutFor: Math.max(1.5, Math.min(3, shape.duration - 0.3 - themeOutAt))
    }
  }
  const highlights = Array.from({ length: count }, (_, i) => Math.round((FIRST_AT + PER_HIGHLIGHT * i) * 100) / 100)
  const countAt = FIRST_AT + PER_HIGHLIGHT * count
  const finaleAt = countAt + COUNT_FOR
  // A theme with no clear shape still plays from the start, faded out before it ends.
  const themeOutAt = shape ? Math.max(0, Math.min(finaleAt + 2.1, shape.duration - 3.3)) : null
  return { highlights, flashAt: null, countAt, finaleAt, themeOutAt, themeOutFor: 3 }
}
