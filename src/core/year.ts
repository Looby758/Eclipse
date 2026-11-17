import type { Credits, Library, LibraryEntry, MediaType, PersonRef, TitleDetails, TitleRef, TitleSnapshot } from './types'
import { UNDATED, parseEpisodeKey } from './types'
import { isItemSeen, progressOf } from './lists'
import { episodeMinutes } from './time'

/**
 * Phase 25: your year in Eclipse. A year in review from your watch dates: hours watched, busiest
 * month, the director and actor you watched most, your longest binge, and lists you finished.
 * Undated watches (seen before Eclipse) don't count, so repairing old dates first makes it better.
 */

interface Watch {
  key: string
  type: MediaType
  title: TitleSnapshot
  day: string
  minutes: number
  /** An episode ("S1E3"), or null for a film. */
  episode: string | null
}

const isDay = (d: string | undefined): d is string => !!d && d !== UNDATED && /^\d{4}-\d{2}-\d{2}$/.test(d)

function watchesOf(e: LibraryEntry, d: TitleDetails | undefined): Watch[] {
  const base = { key: e.key, type: e.type, title: e.title }
  if (e.type === 'movie') {
    const mins = d?.runtime || 120
    return [e.watchedOn, ...(e.rewatches ?? []).map((r) => r.finishedOn)].filter(isDay).map((day) => ({ ...base, day, minutes: mins, episode: null }))
  }
  const per = d ? episodeMinutes(d) : 45
  const out: Watch[] = []
  for (const ticks of [e.episodes ?? {}, ...(e.rewatches ?? []).map((r) => r.episodes ?? {})]) {
    for (const [k, day] of Object.entries(ticks)) if (parseEpisodeKey(k) && isDay(day)) out.push({ ...base, day, minutes: per, episode: k })
  }
  return out
}

/** The years you have dated watches in, newest first. */
export function yearsWithWatches(library: Library): number[] {
  const years = new Set<number>()
  for (const e of Object.values(library.entries)) for (const w of watchesOf(e, undefined)) years.add(Number(w.day.slice(0, 4)))
  return [...years].sort((a, b) => b - a)
}

/** Titles you watched something of in a year (to fetch details and credits for). */
export function keysWatchedIn(library: Library, year: number): string[] {
  const y = String(year)
  return Object.values(library.entries)
    .filter((e) => watchesOf(e, undefined).some((w) => w.day.startsWith(y)))
    .map((e) => e.key)
}

export interface YearTitle {
  key: string
  type: MediaType
  name: string
  posterPath: string | null
  minutes: number
  /** Films: times watched. Shows: episodes. */
  count: number
}

export interface YearPerson {
  person: PersonRef
  titles: string[]
}

export interface YearReview {
  year: number
  minutes: number
  films: number
  episodes: number
  shows: number
  /** Shows you finished (marked Watched) that year. */
  showsFinished: number
  /** Minutes by month, January first. */
  months: number[]
  busiestMonth: number | null
  /** Days you watched something. */
  days: number
  /** Most episodes of one show in a day. */
  binge: { name: string; key: string; day: string; episodes: number } | null
  /** Most days in a row with something watched. */
  streak: { days: number; from: string; to: string } | null
  topTitles: YearTitle[]
  director: YearPerson | null
  actor: YearPerson | null
  /** Lists and watch orders you finished that year. */
  listsFinished: string[]
}

/** The day you finished a list row: the film's or show's watch day, or the season's last tick. */
function rowDay(library: Library, ref: TitleRef): string | null {
  const e = library.entries[ref.key]
  if (!e) return null
  const ticks = Object.entries(e.episodes ?? {})
    .filter(([k, d]) => isDay(d) && (!ref.season || parseEpisodeKey(k)?.season === ref.season))
    .map(([, d]) => d)
  const days = [...ticks, ...(ref.season ? [] : [e.watchedOn].filter(isDay))]
  return days.sort().pop() ?? null
}

/** Each list's name and titles, by list id: the lists you follow or made. */
export type ListItems = Record<string, { name: string; items: TitleRef[] }>

export function yearInReview(
  library: Library,
  year: number,
  details: Record<string, TitleDetails>,
  credits: Record<string, Credits>,
  lists: ListItems = {},
  today = `${year}-12-31`
): YearReview {
  const y = String(year)
  const watches = Object.values(library.entries).flatMap((e) => watchesOf(e, details[e.key]).filter((w) => w.day.startsWith(y)))
  const months = Array.from({ length: 12 }, () => 0)
  for (const w of watches) months[Number(w.day.slice(5, 7)) - 1] += w.minutes
  const minutes = months.reduce((a, b) => a + b, 0)
  const busiest = minutes ? months.indexOf(Math.max(...months)) : null

  // Longest binge: most episodes of one show in one day.
  const perShowDay = new Map<string, { w: Watch; n: number }>()
  for (const w of watches) {
    if (!w.episode) continue
    const id = `${w.key}@${w.day}`
    const cur = perShowDay.get(id)
    perShowDay.set(id, { w, n: (cur?.n ?? 0) + 1 })
  }
  let binge: YearReview['binge'] = null
  for (const { w, n } of perShowDay.values()) if (!binge || n > binge.episodes || (n === binge.episodes && w.day < binge.day)) binge = { name: w.title.name, key: w.key, day: w.day, episodes: n }

  // Longest streak of days in a row.
  const days = [...new Set(watches.map((w) => w.day))].sort()
  let streak: YearReview['streak'] = null
  let start = 0
  for (let i = 0; i < days.length; i++) {
    const next = i + 1 < days.length && Date.parse(`${days[i + 1]}T12:00:00Z`) - Date.parse(`${days[i]}T12:00:00Z`) === 86_400_000
    if (!next) {
      const len = i - start + 1
      if (!streak || len > streak.days) streak = { days: len, from: days[start], to: days[i] }
      start = i + 1
    }
  }

  // Top titles by time.
  const byTitle = new Map<string, YearTitle>()
  for (const w of watches) {
    const t = byTitle.get(w.key) ?? { key: w.key, type: w.type, name: w.title.name, posterPath: w.title.posterPath, minutes: 0, count: 0 }
    t.minutes += w.minutes
    t.count++
    byTitle.set(w.key, t)
  }
  const titles = [...byTitle.values()].sort((a, b) => b.minutes - a.minutes)

  // The director (films) and actor (films and shows) you watched most: by titles, then time.
  const tally = (pick: (c: Credits, type: MediaType) => PersonRef[]): YearPerson | null => {
    const m = new Map<number, { person: PersonRef; titles: string[]; minutes: number }>()
    for (const t of titles) {
      const c = credits[t.key]
      if (!c) continue
      for (const p of pick(c, t.type)) {
        const cur = m.get(p.id) ?? { person: p, titles: [], minutes: 0 }
        cur.titles.push(t.name)
        cur.minutes += t.minutes
        m.set(p.id, cur)
      }
    }
    const best = [...m.values()].sort((a, b) => b.titles.length - a.titles.length || b.minutes - a.minutes)[0]
    return best && best.titles.length >= 2 ? { person: best.person, titles: best.titles } : null
  }

  const listsFinished = Object.values(lists)
    .filter((l) => {
      const p = progressOf(l.items, library, today)
      if (!p.total || p.seen < p.total) return false
      const last = p.released.map((r) => (isItemSeen(library, r) ? rowDay(library, r) : null)).filter((d): d is string => !!d).sort().pop()
      return !!last && last.startsWith(y)
    })
    .map((l) => l.name)

  return {
    year,
    minutes,
    films: watches.filter((w) => !w.episode).length,
    episodes: watches.filter((w) => w.episode).length,
    shows: new Set(watches.filter((w) => w.episode).map((w) => w.key)).size,
    showsFinished: Object.values(library.entries).filter((e) => e.type === 'tv' && e.watchedOn?.startsWith(y)).length,
    months,
    busiestMonth: busiest,
    days: days.length,
    binge: binge && binge.episodes >= 2 ? binge : null,
    streak: streak && streak.days >= 2 ? streak : null,
    topTitles: titles.slice(0, 5),
    director: tally((c, type) => (type === 'movie' ? c.directors : [])),
    actor: tally((c) => c.cast.slice(0, 5)),
    listsFinished
  }
}
