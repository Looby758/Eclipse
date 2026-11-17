import type { Library, MediaType, TitleKey, TitleSnapshot } from './types'
import { parseEpisodeKey } from './types'

/**
 * "On this day": what you watched on today's date in earlier years, from the watch dates in
 * your library (a film or show marked Watched, and ticked episodes). Titles without a date are
 * skipped. If nothing lands exactly on today, the same week in earlier years is used instead.
 */

export interface Memory {
  key: TitleKey
  type: MediaType
  id: number
  title: TitleSnapshot
  /** The day it happened, YYYY-MM-DD. */
  date: string
  yearsAgo: number
  /** Whole-title watch (a film, or a show marked Watched), or episodes of a show that day. */
  kind: 'title' | 'episodes'
  /** For episodes: which ones, in order, e.g. ["S1E1", "S1E2"]. */
  episodes: string[]
  note: string | null
}

export interface OnThisDay {
  /** True when these are from this week rather than today exactly. */
  nearby: boolean
  memories: Memory[]
}

const parts = (day: string): [number, number, number] => day.split('-').map(Number) as [number, number, number]
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Days between two dates' month-days, ignoring the year (so 28 Dec and 2 Jan are 5 apart). */
function dayGap(a: string, b: string): number {
  const [, am, ad] = parts(a)
  const [, bm, bd] = parts(b)
  const diff = Math.abs(Date.UTC(2001, am - 1, ad) - Date.UTC(2001, bm - 1, bd)) / 86_400_000
  return Math.min(diff, 365 - diff)
}

/** Whether `day` falls on today's month and day in an earlier year (29 Feb shows on 28 Feb in other years). */
function sameDay(day: string, today: string): boolean {
  const [y, m, d] = parts(day)
  const [ty, tm, td] = parts(today)
  if (y >= ty) return false
  if (m === tm && d === td) return true
  return m === 2 && d === 29 && tm === 2 && td === 28 && !isLeap(ty)
}

function collect(library: Library, today: string, test: (day: string) => boolean): Memory[] {
  const [ty] = parts(today)
  // Ticks with no date (seen before Eclipse) are never memories.
  const match = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(day) && test(day)
  const out: Memory[] = []
  for (const e of Object.values(library.entries)) {
    const base = { key: e.key, type: e.type, id: e.id, title: e.title, note: e.note ?? null }
    // The first watch and every rewatch: a film you watched again counts on the day you did.
    const finished = [e.watchedOn, ...(e.type === 'movie' ? (e.rewatches ?? []).map((r) => r.finishedOn) : [])]
    for (const day of new Set(finished)) if (day && match(day)) out.push({ ...base, date: day, yearsAgo: ty - parts(day)[0], kind: 'title', episodes: [] })
    const byDay = new Map<string, string[]>()
    for (const ticks of [e.episodes ?? {}, ...(e.rewatches ?? []).map((r) => r.episodes ?? {})])
      for (const [k, day] of Object.entries(ticks)) if (match(day) && !byDay.get(day)?.includes(k)) byDay.set(day, [...(byDay.get(day) ?? []), k])
    for (const [day, keys] of byDay) {
      // A show marked Watched on the same day as its last episodes is one memory, not two.
      if (e.watchedOn === day && out.some((m) => m.key === e.key && m.date === day)) {
        out.find((m) => m.key === e.key && m.date === day)!.episodes = sortEpisodes(keys)
        continue
      }
      out.push({ ...base, date: day, yearsAgo: ty - parts(day)[0], kind: 'episodes', episodes: sortEpisodes(keys) })
    }
  }
  return out.sort((a, b) => a.yearsAgo - b.yearsAgo || a.date.localeCompare(b.date) || a.title.name.localeCompare(b.title.name))
}

function sortEpisodes(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const x = parseEpisodeKey(a)!
    const y = parseEpisodeKey(b)!
    return x.season - y.season || x.episode - y.episode
  })
}

export function onThisDay(library: Library, today: string, weekWindow = 3): OnThisDay {
  const exact = collect(library, today, (day) => sameDay(day, today))
  if (exact.length) return { nearby: false, memories: exact }
  const [ty] = parts(today)
  return { nearby: true, memories: collect(library, today, (day) => parts(day)[0] < ty && dayGap(day, today) <= weekWindow) }
}

/** "S1 E1–3", "S1 E9 – S2 E2" or "S2 E4": a run of episodes in a few words. */
export function episodeSpan(keys: string[]): string {
  const eps = keys.map((k) => parseEpisodeKey(k)!).filter(Boolean)
  if (!eps.length) return ''
  const first = eps[0]
  const last = eps[eps.length - 1]
  if (eps.length === 1) return `S${first.season} E${first.episode}`
  if (first.season === last.season) return `S${first.season} E${first.episode}–${last.episode}`
  return `S${first.season} E${first.episode} – S${last.season} E${last.episode}`
}

/** "One year ago today", "3 years ago today", or "A year ago this week". */
export function agoLabel(yearsAgo: number, nearby: boolean): string {
  const words = ['', 'One year', 'Two years', 'Three years', 'Four years', 'Five years']
  const n = words[yearsAgo] ?? `${yearsAgo} years`
  return `${n} ago ${nearby ? 'this week' : 'today'}`
}
