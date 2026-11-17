import type { LibraryEntry, Preferences, TitleDetails, WatchProviders } from './types'
import { episodeKey } from './types'
import { localDate } from './library'
import { onMyServices } from './providers'

/**
 * The runtime maths behind "Watchlist hours" and "Finish it by Friday": how much is left of
 * something, and how that fits into your evenings. Days are your local dates ("YYYY-MM-DD").
 */

/** When TMDB doesn't know a show's episode length. */
export const DEFAULT_EPISODE_MINUTES = 45

export interface TimeLeft {
  episodes: number
  minutes: number
  /** True when the length is a guess (TMDB has no runtime for it). */
  estimated: boolean
}

type RuntimeInfo = Pick<TitleDetails, 'type' | 'runtime' | 'seasons' | 'nextEpisode'>

export const episodeMinutes = (d: Pick<TitleDetails, 'runtime'>): number => d.runtime || DEFAULT_EPISODE_MINUTES

/**
 * What's left to watch. Films: the whole film, unless you've watched it. Shows: the regular
 * episodes you haven't ticked that are already out (specials and episodes not yet aired don't count).
 */
export function timeLeft(d: RuntimeInfo, entry: LibraryEntry | undefined, today: string): TimeLeft {
  if (entry?.status === 'watched') return { episodes: 0, minutes: 0, estimated: false }
  if (d.type === 'movie') return { episodes: 0, minutes: d.runtime ?? 0, estimated: !d.runtime }
  const next = d.nextEpisode
  const unaired = (s: number, e: number): boolean =>
    !!next && (!next.airDate || next.airDate > today) && (s > next.season || (s === next.season && e >= next.episode))
  const seen = entry?.episodes ?? {}
  let episodes = 0
  for (const s of d.seasons) {
    if (s.number <= 0) continue
    // A season that hasn't started yet doesn't count at all.
    if (s.airDate && s.airDate > today) continue
    for (let e = 1; e <= s.episodeCount; e++) if (!seen[episodeKey(s.number, e)] && !unaired(s.number, e)) episodes++
  }
  return { episodes, minutes: episodes * episodeMinutes(d), estimated: !d.runtime }
}

// ---- Your evenings ----

export type Evenings = Pick<Preferences, 'startTime' | 'bedtime' | 'watchDays'>

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Start and bedtime in minutes after the evening's midnight (bedtime after midnight is past 1440). */
function evening(ev: Evenings): { start: number; end: number } {
  const start = toMinutes(ev.startTime)
  let end = toMinutes(ev.bedtime)
  if (end <= start) end += 1440
  return { start, end }
}

/** Minutes in a usual watching evening. */
export const eveningMinutes = (ev: Evenings): number => evening(ev).end - evening(ev).start

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}
const weekday = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/**
 * Which evening it is now, and the minutes of it still to come. Just after midnight still
 * counts as last night if your bedtime is after midnight.
 */
export function tonight(now: Date, ev: Evenings): { day: string; minutesLeft: number } {
  const { start, end } = evening(ev)
  let mins = now.getHours() * 60 + now.getMinutes()
  let day = localDate(now)
  if (end > 1440 && mins < end - 1440) {
    mins += 1440
    day = addDays(day, -1)
  }
  return { day, minutesLeft: Math.max(0, end - Math.max(mins, start)) }
}

/** How many episodes (or whether a film) fit before bed tonight, from now. */
export const fitTonight = (now: Date, ev: Evenings, minutesEach: number): number =>
  minutesEach > 0 ? Math.floor(tonight(now, ev).minutesLeft / minutesEach) : 0

/** The latest you can start something this long and still be in bed on time, "HH:MM". */
export function startBy(minutes: number, ev: Evenings): string {
  const t = (((evening(ev).end - minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export interface FinishPlan {
  /** Watching nights from tonight up to and including the deadline. */
  nights: number
  /** Episodes a night needed to make it (rounded up). */
  perNight: number
  /** The most that fit in one of your evenings. */
  maxPerNight: number
  realistic: boolean
  /** The earliest you could finish watching as much as fits each night (null if never). */
  earliestFinish: string | null
  /** Episodes that fit before bed tonight. */
  tonight: number
}

/** "Finish it by Friday": how many episodes a night it takes to finish `left` by `deadline`. */
export function finishPlan(left: TimeLeft, minutesEach: number, deadline: string, now: Date, ev: Evenings): FinishPlan {
  const maxPerNight = minutesEach > 0 ? Math.floor(eveningMinutes(ev) / minutesEach) : 0
  const t = tonight(now, ev)
  const tonightFits = minutesEach > 0 ? Math.floor(t.minutesLeft / minutesEach) : 0
  const watchDay = (day: string): boolean => ev.watchDays.includes(weekday(day))
  // Tonight counts if it's one of your nights and there's still time for an episode.
  const capacity = (day: string): number => (!watchDay(day) ? 0 : day === t.day ? tonightFits : maxPerNight)

  let nights = 0
  for (let day = t.day; day <= deadline && nights < 3660; day = addDays(day, 1)) if (capacity(day) > 0) nights++

  let earliestFinish: string | null = null
  if (left.episodes === 0) earliestFinish = t.day
  else if (maxPerNight > 0 && ev.watchDays.length) {
    let todo = left.episodes
    for (let day = t.day, i = 0; i < 3660; day = addDays(day, 1), i++) {
      todo -= capacity(day)
      if (todo <= 0) {
        earliestFinish = day
        break
      }
    }
  }

  const perNight = nights ? Math.ceil(left.episodes / nights) : left.episodes
  return {
    nights,
    perNight,
    maxPerNight,
    realistic: left.episodes === 0 || (!!earliestFinish && earliestFinish <= deadline),
    earliestFinish,
    tonight: tonightFits
  }
}

// ---- Deadlines ----

/** The next Friday (today if it's Friday). */
export function nextFriday(today: string): string {
  return addDays(today, (5 - weekday(today) + 7) % 7)
}

/** When the next season starts, if it's announced (so you can be caught up the day before). */
export function nextPremiere(d: Pick<TitleDetails, 'seasons' | 'nextEpisode'>, today: string): string | null {
  const season = d.seasons.filter((s) => s.number > 0 && s.airDate && s.airDate > today).sort((a, b) => a.number - b.number)[0]
  if (season?.airDate) return season.airDate
  const n = d.nextEpisode
  return n && n.episode === 1 && n.airDate && n.airDate > today ? n.airDate : null
}

/** The next time a service renews, from the day of the month it renews (short months use their last day). */
export function nextRenewal(dayOfMonth: number, today: string): string {
  const [y, m] = today.split('-').map(Number)
  const inMonth = (year: number, month: number): string => {
    const last = new Date(year, month, 0).getDate()
    return localDate(new Date(year, month - 1, Math.min(dayOfMonth, last)))
  }
  const thisMonth = inMonth(y, m)
  return thisMonth >= today ? thisMonth : inMonth(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)
}

export const dayBefore = (day: string): string => addDays(day, -1)

/** Watching nights between two days, inclusive (for "4 nights" in the plan). */
export function nightsBetween(from: string, to: string, ev: Evenings): string[] {
  const out: string[] = []
  for (let day = from; day <= to && out.length < 3660; day = addDays(day, 1)) if (ev.watchDays.includes(weekday(day))) out.push(day)
  return out
}

// ---- Watchlist hours ----

export interface HoursBucket {
  /** A service's name, or one of the groups below. */
  label: string
  /** Set for your own services. */
  serviceId?: number
  minutes: number
  titles: number
}

export const OTHER_STREAMING = 'Streaming elsewhere'
export const RENT_OR_BUY = 'Rent or buy'
export const NOT_STREAMING = 'Not streaming'
export const NOT_CHECKED = 'Not checked yet'

/**
 * Your watchlist as time, split by where you'd watch it: your own services first (a title on
 * two of yours counts once, under the first), then elsewhere, rent or buy, and nowhere.
 */
export function watchlistHours(
  items: { key: string; left: TimeLeft }[],
  providers: Record<string, WatchProviders | undefined>,
  myServices: number[]
): { minutes: number; titles: number; buckets: HoursBucket[] } {
  const buckets = new Map<string, HoursBucket>()
  const add = (label: string, minutes: number, serviceId?: number): void => {
    const b = buckets.get(label) ?? { label, minutes: 0, titles: 0, ...(serviceId ? { serviceId } : {}) }
    b.minutes += minutes
    b.titles++
    buckets.set(label, b)
  }
  let minutes = 0
  let titles = 0
  for (const { key, left } of items) {
    if (left.minutes <= 0) continue
    minutes += left.minutes
    titles++
    const p = providers[key]
    if (!p) {
      add(NOT_CHECKED, left.minutes)
      continue
    }
    const mine = onMyServices(p, myServices).sort((a, b) => myServices.indexOf(a.id) - myServices.indexOf(b.id))[0]
    if (mine) add(mine.name, left.minutes, mine.id)
    else if (p.stream.length || p.free.length) add(OTHER_STREAMING, left.minutes)
    else if (p.rent.length || p.buy.length) add(RENT_OR_BUY, left.minutes)
    else add(NOT_STREAMING, left.minutes)
  }
  const order = [OTHER_STREAMING, RENT_OR_BUY, NOT_STREAMING, NOT_CHECKED]
  const list = [...buckets.values()].sort((a, b) => {
    const ra = a.serviceId ? -1 : order.indexOf(a.label)
    const rb = b.serviceId ? -1 : order.indexOf(b.label)
    return ra !== rb ? ra - rb : b.minutes - a.minutes
  })
  return { minutes, titles, buckets: list }
}

/** "214 hours", "3h 20m", "45m": long totals in whole hours. */
export function formatHours(minutes: number): string {
  if (minutes >= 600) return `${Math.round(minutes / 60)} hours`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
