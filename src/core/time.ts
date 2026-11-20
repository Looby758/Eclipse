import type { LibraryEntry, SeasonDetails, Preferences, TitleDetails, WatchProviders } from './types'
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

/** What's left of the season you're on: "4 episodes and 3h 10m left in season 3". */
export interface SeasonLeft extends TimeLeft {
  season: number
}

/**
 * The season you're on is the one with your next unticked episode that's out. Counts that season's
 * unticked, aired episodes. With the season's episode list (from `seasons`, when it's loaded) it adds
 * up their real lengths, otherwise it uses the show's usual episode length. Null for films, before
 * you've ticked anything (then the whole show is what's left), or when nothing out is left.
 */
export function seasonLeft(d: RuntimeInfo, entry: LibraryEntry | undefined, today: string, seasons: Pick<SeasonDetails, 'number' | 'episodes'>[] = []): SeasonLeft | null {
  if (d.type !== 'tv' || entry?.status === 'watched') return null
  const seen = entry?.episodes ?? {}
  if (!Object.keys(seen).length) return null
  const next = d.nextEpisode
  const unaired = (s: number, e: number): boolean =>
    !!next && (!next.airDate || next.airDate > today) && (s > next.season || (s === next.season && e >= next.episode))
  for (const s of [...d.seasons].filter((x) => x.number > 0).sort((a, b) => a.number - b.number)) {
    if (s.airDate && s.airDate > today) continue
    const list = seasons.find((x) => x.number === s.number)?.episodes ?? []
    const left = { season: s.number, episodes: 0, minutes: 0, estimated: false }
    for (let e = 1; e <= s.episodeCount; e++) {
      if (seen[episodeKey(s.number, e)] || unaired(s.number, e)) continue
      const ep = list.find((x) => x.number === e)
      if (ep?.airDate && ep.airDate > today) continue
      left.episodes++
      if (ep?.runtime) left.minutes += ep.runtime
      else {
        left.minutes += episodeMinutes(d)
        if (!d.runtime) left.estimated = true
      }
    }
    if (left.episodes) return left
  }
  return null
}

// ---- Your evenings ----

/**
 * Your week. Older libraries and tests may only have the usual evening (start, bedtime and the
 * nights you watch); the rest is optional and falls back to that.
 */
export type Evenings = Pick<Preferences, 'startTime' | 'bedtime' | 'watchDays'> &
  Partial<Pick<Preferences, 'schedule' | 'justTonight' | 'gapMinutes' | 'windDownMinutes' | 'weeklyBudgetMinutes'>>

/** A stretch of watching in minutes after that day's midnight (an end past midnight is over 1440). */
export interface Span {
  start: number
  end: number
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const toSpan = (start: string, end: string): Span => {
  const s = toMinutes(start)
  let e = toMinutes(end)
  if (e <= s) e += 1440
  return { start: s, end: e }
}
/** Minutes after midnight as "HH:MM" (wrapping past midnight). */
export const clock = (mins: number): string => {
  const t = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}
const weekday = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/** The usual slots for a day of the week, before any "just tonight" change or wind-down. */
function usualSlots(dow: number, ev: Evenings): Span[] {
  const raw = ev.schedule?.length === 7 ? ev.schedule[dow] : ev.watchDays.includes(dow) ? [{ start: ev.startTime, end: ev.bedtime }] : []
  return raw.map((x) => toSpan(x.start, x.end)).sort((a, b) => a.start - b.start)
}

const windDown = (slots: Span[], ev: Evenings): Span[] => {
  const w = ev.windDownMinutes ?? 0
  if (!w || !slots.length) return slots
  const out = slots.map((s) => ({ ...s }))
  const last = out[out.length - 1]
  last.end = Math.max(last.start, last.end - w)
  return out.filter((s) => s.end > s.start)
}

/**
 * When you can watch on a day: its slots from your week, with any "just tonight" change for that
 * day and the wind-down before bed taken off the last one.
 */
export function slotsOn(day: string, ev: Evenings, usual = false): Span[] {
  let slots = usualSlots(weekday(day), ev)
  const jt = ev.justTonight
  if (!usual && jt && jt.day === day) {
    if (jt.off) return []
    if (!slots.length) slots = [toSpan(jt.start ?? ev.startTime, jt.bedtime ?? ev.bedtime)]
    else {
      if (jt.start) {
        const st = toMinutes(jt.start) < 6 * 60 ? toMinutes(jt.start) + 1440 : toMinutes(jt.start)
        slots = slots.filter((s) => s.end > st).map((s) => ({ start: Math.max(s.start, st), end: s.end }))
      }
      if (jt.bedtime && slots.length) {
        const last = slots[slots.length - 1]
        let b = toMinutes(jt.bedtime)
        if (b <= last.start) b += 1440
        slots[slots.length - 1] = { start: last.start, end: b }
      }
    }
  }
  return windDown(slots, ev)
}

/** How many of something this long fit in a stretch, with the gap between them. */
export const fitIn = (minutes: number, each: number, gap = 0): number => (each > 0 && minutes >= each ? Math.floor((minutes + gap) / (each + gap)) : 0)

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** Minutes you can watch on a day. */
export const dayMinutes = (day: string, ev: Evenings): number => sum(slotsOn(day, ev).map((s) => s.end - s.start))

/** Episodes (or films) of this length that fit on a day. */
export const fitsOn = (day: string, ev: Evenings, each: number): number => sum(slotsOn(day, ev).map((s) => fitIn(s.end - s.start, each, ev.gapMinutes)))

/** Minutes in your longest usual evening (for "longer than an evening" and how many fit a night at most). */
export function eveningMinutes(ev: Evenings): number {
  let most = 0
  for (let d = 0; d < 7; d++) most = Math.max(most, sum(windDown(usualSlots(d, ev), ev).map((s) => s.end - s.start)))
  return most
}

/** The most of something this long that fit in one of your usual evenings. */
export function mostAnEvening(ev: Evenings, each: number): number {
  let most = 0
  for (let d = 0; d < 7; d++) most = Math.max(most, sum(windDown(usualSlots(d, ev), ev).map((s) => fitIn(s.end - s.start, each, ev.gapMinutes))))
  return most
}

/** The days of the week you watch on (from your week, not counting "just tonight"). */
export const watchDaysOf = (ev: Evenings): number[] => [0, 1, 2, 3, 4, 5, 6].filter((d) => usualSlots(d, ev).length > 0)

export interface Tonight {
  /** The evening it is ("YYYY-MM-DD"): just after midnight still counts as last night if you're up late. */
  day: string
  /** Minutes of watching time still to come tonight. */
  minutesLeft: number
  /** What's left of each of tonight's slots. */
  left: Span[]
  /** Tonight's slots. */
  slots: Span[]
  /** Minutes since that evening's midnight. */
  now: number
  /** When tonight's watching ends ("HH:MM", after wind-down), or null if tonight's not a watching night. */
  bedtime: string | null
}

/** Which evening it is now, and what's left of it. */
export function tonight(now: Date, ev: Evenings): Tonight {
  let mins = now.getHours() * 60 + now.getMinutes()
  let day = localDate(now)
  const yesterday = addDays(day, -1)
  const late = slotsOn(yesterday, ev).some((s) => s.end > 1440 && mins < s.end - 1440)
  if (late) {
    mins += 1440
    day = yesterday
  }
  const slots = slotsOn(day, ev)
  const left = slots.filter((s) => s.end > mins).map((s) => ({ start: Math.max(s.start, mins), end: s.end }))
  const last = slots[slots.length - 1]
  return { day, minutesLeft: sum(left.map((s) => s.end - s.start)), left, slots, now: mins, bedtime: last ? clock(last.end) : null }
}

/** How many episodes (or whether a film) fit before bed tonight, from now. */
export const fitTonight = (now: Date, ev: Evenings, minutesEach: number): number =>
  minutesEach > 0 ? sum(tonight(now, ev).left.map((s) => fitIn(s.end - s.start, minutesEach, ev.gapMinutes))) : 0

/** Tonight's bedtime, or your usual one when tonight isn't a watching night. */
export const bedtimeTonight = (now: Date, ev: Evenings): string => tonight(now, ev).bedtime ?? usualBedtime(ev)

/** When tonight's watching starts, or your usual start when tonight isn't a watching night. */
export const tonightStart = (now: Date, ev: Evenings): string => {
  const s = tonight(now, ev).slots[0]
  return s ? clock(s.start) : ev.startTime
}

const usualBedtime = (ev: Evenings): string => clock(toSpan(ev.startTime, ev.bedtime).end - (ev.windDownMinutes ?? 0))

/** The latest you can start something this long tonight and still be done on time, "HH:MM". */
export function startBy(minutes: number, ev: Evenings, now: Date = new Date()): string {
  const t = tonight(now, ev)
  const last = t.slots[t.slots.length - 1]
  return last ? clock(last.end - minutes) : clock(toSpan(ev.startTime, ev.bedtime).end - (ev.windDownMinutes ?? 0) - minutes)
}

/** The weekly budget split over your watching nights, in minutes a night (null with no budget). */
export function budgetPerNight(ev: Evenings): number | null {
  const b = ev.weeklyBudgetMinutes ?? 0
  const nights = watchDaysOf(ev).length
  return b > 0 && nights ? Math.floor(b / nights) : null
}

/** Episodes of this length you'd plan for a day: what fits, kept under the weekly budget's share. */
export function planFor(day: string, ev: Evenings, each: number, fits = fitsOn(day, ev, each)): number {
  const share = budgetPerNight(ev)
  return share === null ? fits : Math.min(fits, Math.max(fits ? 1 : 0, fitIn(share, each, ev.gapMinutes)))
}

/** Monday of the week a day is in. */
export const weekStart = (day: string): string => addDays(day, -((weekday(day) + 6) % 7))

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
  const maxPerNight = mostAnEvening(ev, minutesEach)
  const t = tonight(now, ev)
  const tonightFits = fitTonight(now, ev, minutesEach)
  // Tonight counts if there's still time for an episode; the weekly budget keeps the rest even.
  const capacity = (day: string): number => (day === t.day ? planFor(day, ev, minutesEach, tonightFits) : planFor(day, ev, minutesEach))

  let nights = 0
  for (let day = t.day; day <= deadline && nights < 3660; day = addDays(day, 1)) if (capacity(day) > 0) nights++

  let earliestFinish: string | null = null
  if (left.episodes === 0) earliestFinish = t.day
  else if (maxPerNight > 0) {
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
  for (let day = from; day <= to && out.length < 3660; day = addDays(day, 1)) if (slotsOn(day, ev).length) out.push(day)
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
