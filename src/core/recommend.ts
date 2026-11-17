import { activeEntry } from './library'
import { lastTicked } from './nudges'
import type { Library, LibraryEntry, SearchResult } from './types'

/**
 * Recommendations for Search (asked for 17 Nov 2026): TMDB's "if you liked this" lists for the
 * films and shows you've watched or are watching, added up. A title recommended by several of
 * yours, or by ones you rated highly or watched lately, comes first. Anything already in your
 * library, dropped, or hidden with "Not for me" is left out.
 */

export interface Seed {
  key: string
  name: string
  weight: number
}

export interface Recommendation extends SearchResult {
  score: number
  /** The titles of yours it was recommended from, strongest first. */
  because: string[]
}

const DAY = 86_400_000

/** When you last watched something: its last tick, watched day or the end of a rewatch. */
function lastWatched(e: LibraryEntry): string | null {
  const days = [lastTicked(e.episodes), e.watchedOn, ...(e.rewatches ?? []).flatMap((r) => [r.finishedOn ?? null, lastTicked(r.episodes)])].filter(
    (d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
  )
  return days.sort().pop() ?? null
}

/**
 * The titles to recommend from: what you've watched or are watching (not stopped, and not ones you
 * rated 5 or under), weighted by your rating and how recently you watched. The strongest `max`.
 */
export function seedsOf(library: Library, now: Date, max = 15): Seed[] {
  const seeds: Seed[] = []
  for (const raw of Object.values(library.entries)) {
    const e = activeEntry(raw)!
    if (e.status !== 'watched' && e.status !== 'watching') continue
    if (raw.rating !== undefined && raw.rating <= 5) continue
    const last = lastWatched(raw)
    const ageDays = last ? (now.getTime() - Date.parse(`${last}T12:00:00Z`)) / DAY : 3650
    // Watched this month counts fully, a year ago about half, long ago a quarter.
    const recency = 0.25 + 0.75 * Math.exp(-Math.max(0, ageDays) / 365)
    const liked = raw.rating !== undefined ? (raw.rating >= 9 ? 1.6 : raw.rating >= 8 ? 1.3 : 1) : 1
    const watching = e.status === 'watching' ? 1.2 : 1
    seeds.push({ key: raw.key, name: raw.title.name, weight: recency * liked * watching })
  }
  return seeds.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)).slice(0, max)
}

/** Adds up each seed's recommendations (higher in its list counts for more) and ranks them. */
export function recommend(library: Library, lists: { seed: Seed; results: SearchResult[] }[], limit = 40): Recommendation[] {
  const skip = new Set<string>([...Object.keys(library.entries), ...(library.dropped ?? []).map((d) => d.entry.key), ...(library.recsHidden ?? [])])
  const byKey = new Map<string, Recommendation & { from: Map<string, number> }>()
  for (const { seed, results } of lists) {
    results.slice(0, 20).forEach((r, i) => {
      if (skip.has(r.key) || !r.posterPath) return
      const points = seed.weight * (1 - i / 25)
      const rec = byKey.get(r.key) ?? { ...r, score: 0, because: [], from: new Map<string, number>() }
      rec.score += points
      rec.from.set(seed.name, (rec.from.get(seed.name) ?? 0) + points)
      byKey.set(r.key, rec)
    })
  }
  return [...byKey.values()]
    .map(({ from, ...rec }) => ({ ...rec, because: [...from.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n) }))
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity)
    .slice(0, limit)
}

/** "Not for me": hides a recommendation for good (the last 500). */
export function hideRecommendation(library: Library, key: string): Library {
  return { ...library, recsHidden: [...new Set([...(library.recsHidden ?? []), key])].slice(-500) }
}
