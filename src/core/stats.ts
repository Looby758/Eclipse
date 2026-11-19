import type { Library, LibraryEntry, MediaType, TitleDetails, TitleKey, WatchStatus } from './types'
import { UNDATED, parseEpisodeKey } from './types'

/**
 * Your stats: everything you've watched, added up over all time, for the Stats page and for
 * milestones (phase 53). Minutes come from TMDB's runtimes (an episode's usual length; 45 minutes
 * for a show and 2 hours for a film when TMDB doesn't say).
 */

/** What stats need from TMDB about a title. */
export type StatDetails = Pick<TitleDetails, 'runtime' | 'seasons' | 'genres'>

export const SHOW_MINUTES = 45
export const FILM_MINUTES = 120

/** One watch: an episode tick or a film watched, first time or again. */
export interface WatchEvent {
  key: TitleKey
  type: MediaType
  name: string
  /** YYYY-MM-DD, or null when it has no date (seen before Eclipse). */
  day: string | null
  minutes: number
  /** "S1E3" for an episode, null for a film. */
  episode: string | null
  /** A rewatch (yours or with someone), not the first time. */
  again: boolean
  /** Watching with someone ("Sam"). */
  with?: string
}

const isDay = (d: string | undefined | null): d is string => !!d && d !== UNDATED && /^\d{4}-\d{2}-\d{2}$/.test(d)

export const minutesEach = (e: Pick<LibraryEntry, 'type'>, d: StatDetails | undefined): number => d?.runtime || (e.type === 'movie' ? FILM_MINUTES : SHOW_MINUTES)

/** Every watch in the library, in no particular order. */
export function watchEvents(library: Library, details: Record<string, StatDetails | undefined> = {}): WatchEvent[] {
  const out: WatchEvent[] = []
  for (const e of Object.values(library.entries)) {
    const mins = minutesEach(e, details[e.key])
    const base = { key: e.key, type: e.type, name: e.title.name, minutes: mins }
    if (e.type === 'movie') {
      if (e.status === 'watched') out.push({ ...base, day: isDay(e.watchedOn) && !e.seenBefore ? e.watchedOn : null, episode: null, again: false })
      for (const r of e.rewatches ?? []) if (r.finishedOn) out.push({ ...base, day: isDay(r.finishedOn) ? r.finishedOn : null, episode: null, again: true, ...(r.with ? { with: r.with } : {}) })
      continue
    }
    for (const [k, d] of Object.entries(e.episodes ?? {})) if (parseEpisodeKey(k)) out.push({ ...base, day: isDay(d) ? d : null, episode: k, again: false })
    for (const r of e.rewatches ?? []) {
      for (const [k, d] of Object.entries(r.episodes ?? {})) if (parseEpisodeKey(k)) out.push({ ...base, day: isDay(d) ? d : null, episode: k, again: true, ...(r.with ? { with: r.with } : {}) })
    }
  }
  return out
}

/** Seasons (not specials) with every episode ticked, by show. */
export function seasonsFinished(e: LibraryEntry, d: StatDetails | undefined): number {
  if (e.type !== 'tv' || !d) return 0
  const seen = e.episodes ?? {}
  return d.seasons.filter((s) => s.number > 0 && s.episodeCount > 0 && Array.from({ length: s.episodeCount }, (_, i) => seen[`S${s.number}E${i + 1}`]).every(Boolean)).length
}

const dayMs = (d: string): number => Date.parse(`${d}T12:00:00Z`)

/** The longest run of days in a row in a sorted list of days. */
export function longestRun(days: string[]): { days: number; from: string; to: string } | null {
  let best: { days: number; from: string; to: string } | null = null
  let start = 0
  for (let i = 0; i < days.length; i++) {
    const next = i + 1 < days.length && dayMs(days[i + 1]) - dayMs(days[i]) === 86_400_000
    if (next) continue
    const len = i - start + 1
    if (!best || len > best.days) best = { days: len, from: days[start], to: days[i] }
    start = i + 1
  }
  return best
}

export interface StatTitle {
  key: TitleKey
  type: MediaType
  name: string
  posterPath: string | null
  minutes: number
  /** Shows: episodes ticked (rewatches too). Films: times watched. */
  count: number
}

export interface AllTimeStats {
  minutes: number
  showMinutes: number
  filmMinutes: number
  /** Time spent on rewatches (yours and with someone). */
  againMinutes: number
  episodes: number
  /** Different films watched. */
  films: number
  /** Films watched, counting each time. */
  filmWatches: number
  showsStarted: number
  showsFinished: number
  seasonsFinished: number
  rewatchesFinished: number
  /** Days with something watched (dated). */
  days: number
  /** Watches with no date (seen before Eclipse), which the charts leave out. */
  undated: number
  first: { name: string; key: TitleKey; day: string } | null
  /** Minutes a watching day, on average. */
  perDay: number
  byYear: { year: number; minutes: number; episodes: number; films: number }[]
  /** The last 12 months, oldest first ("2026-11"). */
  months: { month: string; minutes: number }[]
  /** Minutes by weekday, Monday first. */
  weekdays: number[]
  busiestMonth: { month: string; minutes: number } | null
  busiestDay: { day: string; minutes: number; episodes: number; films: number } | null
  binge: { name: string; key: TitleKey; day: string; episodes: number } | null
  longestStreak: { days: number; from: string; to: string } | null
  /** Days in a row up to today (or yesterday, if nothing's on yet today). */
  currentStreak: number
  topShows: StatTitle[]
  topFilms: StatTitle[]
  genres: { name: string; minutes: number; titles: number }[]
  people: { name: string; episodes: number; films: number; minutes: number; titles: string[] }[]
  statuses: Record<WatchStatus, number>
  library: { titles: number; films: number; shows: number }
  ratings: { count: number; average: number | null; top: { key: TitleKey; name: string; rating: number }[] }
  decades: { decade: number; titles: number }[]
}

export function allTimeStats(library: Library, details: Record<string, StatDetails | undefined>, today: string): AllTimeStats {
  const events = watchEvents(library, details)
  const dated = events.filter((w) => w.day) as (WatchEvent & { day: string })[]
  const entries = Object.values(library.entries)
  const sum = (list: WatchEvent[]): number => list.reduce((a, w) => a + w.minutes, 0)

  const byDay = new Map<string, { minutes: number; episodes: number; films: number }>()
  for (const w of dated) {
    const d = byDay.get(w.day) ?? { minutes: 0, episodes: 0, films: 0 }
    d.minutes += w.minutes
    if (w.episode) d.episodes++
    else d.films++
    byDay.set(w.day, d)
  }
  const days = [...byDay.keys()].sort()

  const years = new Map<number, { year: number; minutes: number; episodes: number; films: number }>()
  for (const w of dated) {
    const y = Number(w.day.slice(0, 4))
    const cur = years.get(y) ?? { year: y, minutes: 0, episodes: 0, films: 0 }
    cur.minutes += w.minutes
    if (w.episode) cur.episodes++
    else cur.films++
    years.set(y, cur)
  }

  const monthTotals = new Map<string, number>()
  for (const w of dated) monthTotals.set(w.day.slice(0, 7), (monthTotals.get(w.day.slice(0, 7)) ?? 0) + w.minutes)
  const months: { month: string; minutes: number }[] = []
  {
    let y = Number(today.slice(0, 4))
    let m = Number(today.slice(5, 7))
    for (let i = 0; i < 12; i++) {
      const id = `${y}-${String(m).padStart(2, '0')}`
      months.unshift({ month: id, minutes: monthTotals.get(id) ?? 0 })
      if (--m === 0) {
        m = 12
        y--
      }
    }
  }
  const busiestMonth = [...monthTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

  const weekdays = [0, 0, 0, 0, 0, 0, 0]
  for (const w of dated) weekdays[(new Date(`${w.day}T12:00:00Z`).getUTCDay() + 6) % 7] += w.minutes

  const busiestDay = [...byDay.entries()].sort((a, b) => b[1].minutes - a[1].minutes || a[0].localeCompare(b[0]))[0]

  let binge: AllTimeStats['binge'] = null
  const showDay = new Map<string, { w: WatchEvent & { day: string }; n: number }>()
  for (const w of dated) {
    if (!w.episode) continue
    const id = `${w.key}@${w.day}`
    showDay.set(id, { w, n: (showDay.get(id)?.n ?? 0) + 1 })
  }
  for (const { w, n } of showDay.values()) if (!binge || n > binge.episodes || (n === binge.episodes && w.day < binge.day)) binge = { name: w.name, key: w.key, day: w.day, episodes: n }

  let currentStreak = 0
  {
    const has = new Set(days)
    let d = has.has(today) ? today : new Date(dayMs(today) - 86_400_000).toISOString().slice(0, 10)
    while (has.has(d)) {
      currentStreak++
      d = new Date(dayMs(d) - 86_400_000).toISOString().slice(0, 10)
    }
  }

  const byTitle = new Map<string, StatTitle>()
  for (const w of events) {
    const e = library.entries[w.key]
    const t = byTitle.get(w.key) ?? { key: w.key, type: w.type, name: w.name, posterPath: e?.title.posterPath ?? null, minutes: 0, count: 0 }
    t.minutes += w.minutes
    t.count++
    byTitle.set(w.key, t)
  }
  const titles = [...byTitle.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))

  const genres = new Map<string, { name: string; minutes: number; titles: number }>()
  for (const t of titles) {
    for (const g of details[t.key]?.genres ?? []) {
      const cur = genres.get(g) ?? { name: g, minutes: 0, titles: 0 }
      cur.minutes += t.minutes
      cur.titles++
      genres.set(g, cur)
    }
  }

  const people = new Map<string, AllTimeStats['people'][number]>()
  for (const w of events) {
    if (!w.with) continue
    const id = w.with.toLowerCase()
    const p = people.get(id) ?? { name: w.with, episodes: 0, films: 0, minutes: 0, titles: [] }
    if (w.episode) p.episodes++
    else p.films++
    p.minutes += w.minutes
    if (!p.titles.includes(w.name)) p.titles.push(w.name)
    people.set(id, p)
  }

  const first = dated.slice().sort((a, b) => a.day.localeCompare(b.day))[0]
  const rated = entries.filter((e) => typeof e.rating === 'number')
  const statuses: Record<WatchStatus, number> = { want: 0, watching: 0, watched: 0, stopped: 0 }
  for (const e of entries) statuses[e.status]++

  const decades = new Map<number, number>()
  for (const t of titles) {
    const y = library.entries[t.key]?.title.year
    if (y) decades.set(Math.floor(y / 10) * 10, (decades.get(Math.floor(y / 10) * 10) ?? 0) + 1)
  }

  const shows = entries.filter((e) => e.type === 'tv')
  return {
    minutes: sum(events),
    showMinutes: sum(events.filter((w) => w.episode)),
    filmMinutes: sum(events.filter((w) => !w.episode)),
    againMinutes: sum(events.filter((w) => w.again)),
    episodes: events.filter((w) => w.episode).length,
    films: entries.filter((e) => e.type === 'movie' && e.status === 'watched').length,
    filmWatches: events.filter((w) => !w.episode).length,
    showsStarted: shows.filter((e) => Object.keys(e.episodes ?? {}).length > 0).length,
    showsFinished: shows.filter((e) => e.status === 'watched').length,
    seasonsFinished: shows.reduce((a, e) => a + seasonsFinished(e, details[e.key]), 0),
    rewatchesFinished: entries.reduce((a, e) => a + (e.rewatches ?? []).filter((r) => r.finishedOn).length, 0),
    days: days.length,
    undated: events.length - dated.length,
    first: first ? { name: first.name, key: first.key, day: first.day } : null,
    perDay: days.length ? Math.round(sum(dated) / days.length) : 0,
    byYear: [...years.values()].sort((a, b) => a.year - b.year),
    months,
    weekdays,
    busiestMonth: busiestMonth ? { month: busiestMonth[0], minutes: busiestMonth[1] } : null,
    busiestDay: busiestDay ? { day: busiestDay[0], ...busiestDay[1] } : null,
    binge: binge && binge.episodes >= 2 ? binge : null,
    longestStreak: longestRun(days),
    currentStreak,
    topShows: titles.filter((t) => t.type === 'tv').slice(0, 10),
    topFilms: titles.filter((t) => t.type === 'movie' && t.count > 1).sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 10),
    genres: [...genres.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 10),
    people: [...people.values()].sort((a, b) => b.minutes - a.minutes),
    statuses,
    library: { titles: entries.length, films: entries.filter((e) => e.type === 'movie').length, shows: shows.length },
    ratings: {
      count: rated.length,
      average: rated.length ? Math.round((rated.reduce((a, e) => a + (e.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      top: rated
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.name.localeCompare(b.title.name))
        .slice(0, 5)
        .map((e) => ({ key: e.key, name: e.title.name, rating: e.rating ?? 0 }))
    },
    decades: [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([decade, n]) => ({ decade, titles: n }))
  }
}
