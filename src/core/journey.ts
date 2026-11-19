import type { LibraryEntry, Rewatch } from './types'
import { UNDATED, parseEpisodeKey } from './types'

/**
 * My journey with a show (phase 57): a ribbon of its seasons showing when you watched each one,
 * who with, rewatches, and the gaps in between. Only seasons you've reached show: nothing past
 * where you are.
 */

/** One season in one watch: from your first tick in it to your last. */
export interface JourneyStint {
  season: number
  /** First and last dated tick (YYYY-MM-DD); both null when it was all seen before Eclipse. */
  from: string | null
  to: string | null
  seen: number
  /** Episodes in the season (0 if not known). */
  total: number
}

/** One watch of the show: your first time through, a rewatch, or watching it with someone. */
export interface JourneyLane {
  kind: 'first' | 'rewatch' | 'with'
  label: string
  who?: string
  stints: JourneyStint[]
  /** Still going (no finish date, and for your first watch: the show is still Watching). */
  going: boolean
}

/** A long break between two seasons of the same watch. */
export interface JourneyGap {
  lane: number
  afterSeason: number
  beforeSeason: number
  from: string
  to: string
  days: number
}

export interface Journey {
  lanes: JourneyLane[]
  gaps: JourneyGap[]
  /** The earliest and latest dated ticks across every watch (null if nothing has a date). */
  start: string | null
  end: string | null
}

/** A break this long between seasons is worth pointing out. */
export const GAP_DAYS = 45

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

function stintsOf(episodes: Record<string, string> | undefined, totals: Map<number, number>): JourneyStint[] {
  const by = new Map<number, string[]>()
  for (const [key, day] of Object.entries(episodes ?? {})) {
    const p = parseEpisodeKey(key)
    if (!p || p.season === 0) continue
    by.set(p.season, [...(by.get(p.season) ?? []), day])
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, days]) => {
      const dated = days.filter((d) => d !== UNDATED).sort()
      return { season, from: dated[0] ?? null, to: dated[dated.length - 1] ?? null, seen: days.length, total: totals.get(season) ?? 0 }
    })
}

/**
 * The journey for a show, or null when there's too little for a ribbon (fewer than two seasons
 * reached in any watch).
 */
export function journeyOf(entry: LibraryEntry | undefined, seasons: { number: number; episodeCount: number }[]): Journey | null {
  if (!entry || entry.type !== 'tv') return null
  const totals = new Map(seasons.map((s) => [s.number, s.episodeCount]))
  const lanes: JourneyLane[] = []
  const first = stintsOf(entry.episodes, totals)
  if (first.length) lanes.push({ kind: 'first', label: 'First time', stints: first, going: entry.status === 'watching' && !(entry.rewatches ?? []).some((r) => !r.with) })
  let n = 0
  for (const r of entry.rewatches ?? []) {
    const stints = stintsOf(r.episodes, totals)
    const lane = laneFor(r, ++n)
    if (r.with) n--
    if (stints.length || !r.finishedOn) lanes.push({ ...lane, stints })
  }
  if (!lanes.some((l) => l.stints.length >= 2)) return null

  const gaps: JourneyGap[] = []
  lanes.forEach((l, i) => {
    for (let k = 1; k < l.stints.length; k++) {
      const a = l.stints[k - 1]
      const b = l.stints[k]
      if (!a.to || !b.from) continue
      const days = daysBetween(a.to, b.from)
      if (days >= GAP_DAYS) gaps.push({ lane: i, afterSeason: a.season, beforeSeason: b.season, from: a.to, to: b.from, days })
    }
  })
  const dates = lanes.flatMap((l) => l.stints.flatMap((s) => [s.from, s.to])).filter((d): d is string => !!d).sort()
  return { lanes, gaps, start: dates[0] ?? null, end: dates[dates.length - 1] ?? null }
}

function laneFor(r: Rewatch, n: number): Omit<JourneyLane, 'stints'> {
  if (r.with) return { kind: 'with', label: `With ${r.with}`, who: r.with, going: !r.finishedOn }
  return { kind: 'rewatch', label: n === 1 ? 'Rewatch' : `Rewatch ${n}`, going: !r.finishedOn }
}

/** "8 months", "3 weeks", "1 year 2 months": how long a gap was, in plain words. */
export function gapLabel(days: number): string {
  if (days < 60) return `${Math.max(1, Math.round(days / 7))} week${Math.round(days / 7) === 1 ? '' : 's'}`
  const months = Math.round(days / 30.44)
  if (months < 12) return `${months} months`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} year${y === 1 ? '' : 's'}${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`
}
