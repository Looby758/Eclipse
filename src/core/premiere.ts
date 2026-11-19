import type { ComingSoon } from './shelf'

/**
 * Premiere night (phase 50). On the day a season you've been waiting for comes out, Home turns into
 * that show and counts down to the time it's out in the UK, then says "It's out".
 *
 * TMDB only knows the day a season starts (the US day for American shows), not the time, so the
 * time is worked out from the service it's on. These are the usual UK times; you can change one
 * from Home when it's wrong.
 */

/** When a service usually puts a new season out in the UK, on TMDB's day or the day after. */
export interface ReleaseTime {
  /** "08:00", UK time. */
  time: string
  /** Out the day after TMDB's date (American shows that air in the US evening). */
  nextDay: boolean
}

const USUAL: Record<string, ReleaseTime> = {
  // Midnight in California.
  Netflix: { time: '08:00', nextDay: false },
  'Disney+': { time: '08:00', nextDay: false },
  'Prime Video': { time: '08:00', nextDay: false },
  'Paramount+': { time: '08:00', nextDay: false },
  // 9pm in New York the evening before TMDB's date.
  'Apple TV+': { time: '02:00', nextDay: false },
  // Sky and NOW show American series "at the same time as the US": the early hours after the US evening.
  NOW: { time: '02:00', nextDay: true },
  'BBC iPlayer': { time: '06:00', nextDay: false },
  ITVX: { time: '06:00', nextDay: false },
  'Channel 4': { time: '21:00', nextDay: false }
}

/** When nothing is known about where it's on. */
export const DEFAULT_RELEASE: ReleaseTime = { time: '08:00', nextDay: false }

/** The usual UK release time for a service ("Disney+"), or the default when it's not known. */
export function usualReleaseTime(service: string | null | undefined): ReleaseTime & { known: boolean } {
  const known = service ? USUAL[service] : undefined
  return { ...(known ?? DEFAULT_RELEASE), known: !!known }
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

export const addDay = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Minutes the UK is ahead of UTC at a moment (0 in winter, 60 in summer). */
function londonOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at)
  const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'))
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
}

/** The moment it's `time` on `day` in the UK ("2026-11-23", "08:00"), whatever this computer's clock is set to. */
export function ukMoment(day: string, time: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, min)
  // Guess with the offset at that wall time, then check once (only matters on the night the clocks change).
  let at = wall - londonOffset(new Date(wall)) * 60_000
  at = wall - londonOffset(new Date(at)) * 60_000
  return new Date(at)
}

/** A time you set yourself for one season: the day and the UK time. */
export interface ReleaseOverride {
  day: string
  time: string
}

export function isReleaseOverride(v: unknown): v is ReleaseOverride {
  const o = v as ReleaseOverride
  return !!o && typeof o === 'object' && typeof o.day === 'string' && DAY.test(o.day) && typeof o.time === 'string' && TIME.test(o.time)
}

/** One premiere: the season, where it's on and the moment it's out. */
export interface Premiere {
  item: ComingSoon
  /** The service it's on ("Disney+"), or null when TMDB doesn't say. */
  service: string | null
  /** The UK day it's out (TMDB's day, or the day after). */
  day: string
  /** "08:00", UK time. */
  time: string
  at: Date
  /** The time is the service's usual one (or the default), not one you set. */
  usual: boolean
  /** Neither you nor the service gave the time, so it's a guess. */
  guessed: boolean
}

/** When a season is out in the UK: the time you set if you did, otherwise the service's usual one. */
export function premiereOf(item: ComingSoon, service: string | null, override?: ReleaseOverride | null): Premiere | null {
  if (item.type !== 'tv' || !item.date || !DAY.test(item.date)) return null
  if (override && isReleaseOverride(override)) return { item, service, day: override.day, time: override.time, at: ukMoment(override.day, override.time), usual: false, guessed: false }
  const usual = usualReleaseTime(service)
  const day = usual.nextDay ? addDay(item.date, 1) : item.date
  return { item, service, day, time: usual.time, at: ukMoment(day, usual.time), usual: true, guessed: !usual.known }
}

/** The days a premiere could fall on (TMDB's day or the day after), so it's worth looking at on either. */
export const premiereDays = (item: ComingSoon): string[] => (item.date ? [item.date, addDay(item.date, 1)] : [])

/**
 * Whether Home is a premiere night for this one now: all of the day it's out, midnight to midnight. Starting the season (ticking an episode of it) ends it
 * sooner, because the season then leaves the list of what you're waiting for.
 */
export function isPremiereNight(p: Premiere, now: Date, localDate: (d: Date) => string): boolean {
  return localDate(now) === p.day
}

/** Today's premieres, the next one out first (ones already out after those still to come). */
export function premieresTonight(list: Premiere[], now: Date, localDate: (d: Date) => string): Premiere[] {
  const t = now.getTime()
  return list
    .filter((p) => isPremiereNight(p, now, localDate))
    .sort((a, b) => Number(a.at.getTime() <= t) - Number(b.at.getTime() <= t) || a.at.getTime() - b.at.getTime() || a.item.name.localeCompare(b.item.name))
}

/** What's left until it's out, for the countdown. All zero once it's out. */
export function countdown(at: Date, now: Date): { out: boolean; hours: number; minutes: number; seconds: number } {
  const left = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000))
  return { out: left === 0, hours: Math.floor(left / 3600), minutes: Math.floor((left % 3600) / 60), seconds: left % 60 }
}

/** How far through the wait the day is, 0 at midnight to 1 when it's out (the ring around the poster). */
export function waitProgress(at: Date, now: Date): number {
  const start = new Date(at)
  start.setHours(0, 0, 0, 0)
  // Out just after midnight: count from the evening before instead, so the ring still moves.
  const from = at.getTime() - start.getTime() < 3 * 3600_000 ? start.getTime() - 6 * 3600_000 : start.getTime()
  const span = at.getTime() - from
  return span <= 0 ? 1 : Math.min(1, Math.max(0, (now.getTime() - from) / span))
}

/**
 * The posters for the wall on premiere night: the coming season's poster first, then the show's
 * posters (English or no text) and its other seasons' posters. Only posters, never a picture from
 * inside an episode. Duplicates are dropped.
 */
export function premierePosters(seasonPoster: string | null, showPosters: { path: string; language: string | null }[], seasonPosters: (string | null)[], chosen?: string | null): string[] {
  const out = new Set<string>()
  if (seasonPoster) out.add(seasonPoster)
  if (chosen) out.add(chosen)
  for (const p of showPosters) if (p.language === null || p.language === 'en') out.add(p.path)
  for (const p of seasonPosters) if (p) out.add(p)
  return [...out]
}
