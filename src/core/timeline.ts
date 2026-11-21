import { minutesEach, type StatDetails } from './stats'
import type { Library, LibraryEntry, MediaType, TitleKey } from './types'
import { UNDATED, parseEpisodeKey } from './types'

/**
 * Phase 64, "My timeline, with eras": everything you've watched laid along a line of dates, so you
 * can scroll from your first Sequel entry to today (and on into what's coming), zoom from years
 * down to single weeks, and see the eras of your watching named above it.
 */

/** One day you watched something in a stretch: the episodes ticked that day ("S2E4"), or none for a film. */
export interface TimelineDay {
  day: string
  episodes: string[]
}

/** One stretch of watching one title: from the first day to the last, with no long break in between. */
export interface TimelineSpan {
  /** Unique on the timeline: "tv:1402#0". */
  id: string
  key: TitleKey
  type: MediaType
  tmdbId: number
  name: string
  posterPath: string | null
  /** YYYY-MM-DD, first and last day (the same day for a film). */
  from: string
  to: string
  /** "First time", "Rewatch", "Rewatch 2" or "With Sam". */
  label: string
  days: TimelineDay[]
  /** Episodes in this stretch (0 for a film). */
  episodes: number
  /** Still going: the last stretch of something you're watching now. */
  going: boolean
}

/** A named stretch of months when one title took up most of your watching. */
export interface Era {
  /** "tv:1402@2021-11": the title and the month it starts, which is how a name you give it is saved. */
  id: string
  key: TitleKey
  /** YYYY-MM, first and last month. */
  from: string
  to: string
  /** The name Eclipse gives it ("The Walking Dead winter, 2021–22"). */
  auto: string
  /** Your name for it, if you renamed it. */
  name: string
}

export interface Timeline {
  spans: TimelineSpan[]
  eras: Era[]
  /** Watches with no date (seen before Eclipse), which can't go on the timeline. */
  undated: number
  /** The first and last dated day, or null when nothing has a date. */
  first: string | null
  last: string | null
}

/** A break this long splits a title into separate stretches on the timeline. */
export const SPLIT_DAYS = 45

const isDay = (d: string | undefined | null): d is string => !!d && d !== UNDATED && /^\d{4}-\d{2}-\d{2}$/.test(d)
export const dayNumber = (d: string): number => Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000)

/** A run of ticks (episode or film watches), each with its day, split wherever there's a long break. */
function stretches(ticks: { day: string; episode: string | null }[]): TimelineDay[][] {
  const byDay = new Map<string, string[]>()
  for (const t of ticks) {
    const list = byDay.get(t.day) ?? []
    if (t.episode) list.push(t.episode)
    byDay.set(t.day, list)
  }
  const days = [...byDay.keys()].sort()
  const out: TimelineDay[][] = []
  let run: TimelineDay[] = []
  for (const d of days) {
    if (run.length && dayNumber(d) - dayNumber(run[run.length - 1].day) > SPLIT_DAYS) {
      out.push(run)
      run = []
    }
    const eps = byDay.get(d)!.sort((a, b) => {
      const x = parseEpisodeKey(a)!
      const y = parseEpisodeKey(b)!
      return x.season - y.season || x.episode - y.episode
    })
    run.push({ day: d, episodes: eps })
  }
  if (run.length) out.push(run)
  return out
}

/** Every watch of one title as stretches: your first time, rewatches and watches with someone. */
function spansOf(e: LibraryEntry): { spans: TimelineSpan[]; undated: number } {
  const spans: TimelineSpan[] = []
  let undated = 0
  const watches: { label: string; ticks: { day: string; episode: string | null }[]; going: boolean }[] = []
  const rewatches = e.rewatches ?? []
  if (e.type === 'movie') {
    if (e.status === 'watched') {
      if (isDay(e.watchedOn) && !e.seenBefore) watches.push({ label: 'First time', ticks: [{ day: e.watchedOn, episode: null }], going: false })
      else undated++
    }
  } else {
    const ticks: { day: string; episode: string | null }[] = []
    for (const [k, d] of Object.entries(e.episodes ?? {})) {
      if (!parseEpisodeKey(k)) continue
      if (isDay(d)) ticks.push({ day: d, episode: k })
      else undated++
    }
    watches.push({ label: 'First time', ticks, going: e.status === 'watching' && !rewatches.some((r) => !r.finishedOn && !r.with) })
  }
  let n = 0
  for (const r of rewatches) {
    const label = r.with ? `With ${r.with}` : ++n === 1 ? 'Rewatch' : `Rewatch ${n}`
    if (e.type === 'movie') {
      if (isDay(r.finishedOn)) watches.push({ label, ticks: [{ day: r.finishedOn, episode: null }], going: false })
      continue
    }
    const ticks: { day: string; episode: string | null }[] = []
    for (const [k, d] of Object.entries(r.episodes ?? {})) {
      if (!parseEpisodeKey(k)) continue
      if (isDay(d)) ticks.push({ day: d, episode: k })
      else undated++
    }
    watches.push({ label, ticks, going: !r.finishedOn })
  }
  for (const w of watches) {
    const runs = stretches(w.ticks)
    runs.forEach((days, i) => {
      spans.push({
        id: `${e.key}#${spans.length}`,
        key: e.key,
        type: e.type,
        tmdbId: e.id,
        name: e.title.name,
        posterPath: e.title.posterPath,
        from: days[0].day,
        to: days[days.length - 1].day,
        label: w.label,
        days,
        episodes: days.reduce((a, d) => a + d.episodes.length, 0),
        going: w.going && i === runs.length - 1
      })
    })
  }
  return { spans, undated }
}

const SEASONS: [string, number[]][] = [
  ['winter', [12, 1, 2]],
  ['spring', [3, 4, 5]],
  ['summer', [6, 7, 8]],
  ['autumn', [9, 10, 11]]
]

const monthIndex = (m: string): number => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1
const monthOf = (i: number): string => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

/** "The Walking Dead winter, 2021–22", "The Breaking Bad summer, 2019", "The Office year, 2020". */
export function eraName(title: string, from: string, to: string): string {
  const who = /^the\s/i.test(title) ? title : `The ${title}`
  const a = monthIndex(from)
  const b = monthIndex(to)
  const years = (x: number, y: number): string => {
    const ya = Math.floor(x / 12)
    const yb = Math.floor(y / 12)
    return ya === yb ? `${ya}` : yb === ya + 1 ? `${ya}–${String(yb).slice(2)}` : `${ya}–${yb}`
  }
  const length = b - a + 1
  if (length <= 4) {
    // The season most of it falls in.
    const count = new Map<string, number>()
    for (let i = a; i <= b; i++) {
      const m = (i % 12) + 1
      const s = SEASONS.find(([, ms]) => ms.includes(m))![0]
      count.set(s, (count.get(s) ?? 0) + 1)
    }
    const season = [...count.entries()].sort((x, y) => y[1] - x[1])[0][0]
    // A winter is named by both years it touches (December 2021 to February 2022 is "2021–22").
    if (season === 'winter') {
      const mid = Math.round((a + b) / 2)
      const m = (mid % 12) + 1
      const y = Math.floor(mid / 12)
      const start = m === 12 ? y : y - 1
      const spansYears = Math.floor(a / 12) !== Math.floor(b / 12) || m === 12 || m <= 2
      return `${who} winter, ${spansYears ? `${start}–${String(start + 1).slice(2)}` : y}`
    }
    return `${who} ${season}, ${years(a, b)}`
  }
  if (length <= 14) return `${who} year, ${years(a, b)}`
  return `${who} years, ${years(a, b)}`
}

/** Least minutes in a month for it to count towards an era. */
export const ERA_MONTH_MINUTES = 300
/** Share of a month's watching one title needs to lead it. */
export const ERA_SHARE = 0.4

/**
 * The eras of your watching: runs of months (a quiet month in between is allowed) where one title
 * took up most of your time. A single month counts only if it was a big one.
 */
export function erasOf(library: Library, spans: TimelineSpan[], details: Record<string, StatDetails | undefined> = {}): Era[] {
  const months = new Map<number, Map<string, number>>()
  for (const s of spans) {
    const e = library.entries[s.key]
    const each = e ? minutesEach(e, details[s.key]) : 45
    for (const d of s.days) {
      const m = monthIndex(d.day.slice(0, 7))
      const by = months.get(m) ?? new Map<string, number>()
      by.set(s.key, (by.get(s.key) ?? 0) + each * Math.max(1, d.episodes.length))
      months.set(m, by)
    }
  }
  const leaders = new Map<number, { key: string; minutes: number }>()
  for (const [m, by] of months) {
    const total = [...by.values()].reduce((a, b) => a + b, 0)
    if (total < ERA_MONTH_MINUTES) continue
    const [key, minutes] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
    if (minutes / total >= ERA_SHARE) leaders.set(m, { key, minutes })
  }
  const eras: Era[] = []
  const sorted = [...leaders.keys()].sort((a, b) => a - b)
  let i = 0
  while (i < sorted.length) {
    const key = leaders.get(sorted[i])!.key
    let j = i
    let minutes = leaders.get(sorted[i])!.minutes
    // Carry on while the same title leads, allowing one month in between.
    while (j + 1 < sorted.length && leaders.get(sorted[j + 1])!.key === key && sorted[j + 1] - sorted[j] <= 2) {
      j++
      minutes += leaders.get(sorted[j])!.minutes
    }
    const from = monthOf(sorted[i])
    const to = monthOf(sorted[j])
    if (j > i || minutes >= 1200) {
      const entry = library.entries[key as TitleKey]
      const id = `${key}@${from}`
      const auto = eraName(entry?.title.name ?? 'Something', from, to)
      eras.push({ id, key: key as TitleKey, from, to, auto, name: library.eraNames?.[id] ?? auto })
    }
    i = j + 1
  }
  return eras
}

/** The whole timeline: every stretch of watching, oldest first, and the eras above it. */
export function timelineOf(library: Library, details: Record<string, StatDetails | undefined> = {}): Timeline {
  const spans: TimelineSpan[] = []
  let undated = 0
  for (const e of Object.values(library.entries)) {
    const got = spansOf(e)
    spans.push(...got.spans)
    undated += got.undated
  }
  spans.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.name.localeCompare(b.name))
  const first = spans.length ? spans[0].from : null
  const last = spans.length ? spans.reduce((m, s) => (s.to > m ? s.to : m), spans[0].to) : null
  return { spans, eras: erasOf(library, spans, details), undated, first, last }
}

/**
 * Puts stretches into lanes so none overlap: each goes in the first lane that's free from its start.
 * `width` is how much room each needs, in the same units as the start (its poster can be wider than
 * a short stretch). Returns the lane for each, in the order given.
 */
export function packLanes(items: { start: number; width: number }[], gap = 0): number[] {
  const ends: number[] = []
  return items.map((it) => {
    let lane = ends.findIndex((end) => end + gap <= it.start)
    if (lane === -1) {
      lane = ends.length
      ends.push(0)
    }
    ends[lane] = it.start + it.width
    return lane
  })
}

/** Era names you've given, read from the file (anything odd is dropped). */
export function normalizeEraNames(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [id, name] of Object.entries(raw as Record<string, unknown>)) {
    if (/^(movie|tv):\d+@\d{4}-\d{2}$/.test(id) && typeof name === 'string' && name.trim()) out[id] = name.trim().slice(0, 80)
  }
  return Object.keys(out).length ? out : undefined
}

/** Renames an era, or gives it back Eclipse's name with null (or an empty name). */
export function setEraName(library: Library, id: string, name: string | null): Library {
  if (!/^(movie|tv):\d+@\d{4}-\d{2}$/.test(id)) return library
  const names = { ...(library.eraNames ?? {}) }
  const clean = name?.trim().slice(0, 80) ?? ''
  if (!clean) {
    if (!(id in names)) return library
    delete names[id]
  } else {
    if (names[id] === clean) return library
    names[id] = clean
  }
  const next: Library = { ...library, eraNames: names }
  if (!Object.keys(names).length) delete next.eraNames
  return next
}

/** Whether a title has anything dated to show on the timeline (for "Show me on my timeline"). */
export function onTimeline(e: LibraryEntry | undefined): boolean {
  if (!e) return false
  return spansOf(e).spans.length > 0
}
