import { activeEntry } from './library'
import { lastTicked } from './nudges'
import { learn, leaning } from './taste'
import { reactionWeight } from './reactions'
import type { Library, LibraryEntry, SearchResult, Taste, Trait } from './types'

/**
 * Recommendations for Search and the poster wall (asked for 17 Nov 2026, learning added in phase 43):
 * TMDB's "recommended" and "similar" lists for the films and shows you've watched or are watching,
 * added up. A title recommended by several of yours, or by ones you rated highly or watched lately,
 * comes first. Then what you've taught it with Interested and Not for me (see taste.ts) raises or
 * lowers each one. Anything already in your library, dropped, or hidden with "Not for me" is left out.
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
  /** Creators, cast, networks or keywords it shares with things you said Interested to. */
  liked?: string[]
  /** …and with things you said Not for me to. */
  disliked?: string[]
}

/** TMDB's "similar" lists go mostly by keywords and genres, so they count for less than "recommended". */
export const SIMILAR_WEIGHT = 0.6

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
 * rated 5 or under), weighted by your rating, how its episodes hit you (phase 47) and how recently
 * you watched. The strongest `max`.
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
    // Phase 47: shows whose episodes hit you (😭 🔥 🤯) count for more, ones that dragged (😴) for less.
    const felt = reactionWeight(raw)
    seeds.push({ key: raw.key, name: raw.title.name, weight: recency * liked * watching * felt })
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

/**
 * Raises or lowers each recommendation by what your answers have taught it, then ranks them again.
 * Titles whose traits haven't been fetched yet keep their score.
 */
export function applyTaste(recs: Recommendation[], traits: Record<string, Trait[] | undefined>, taste: Taste | undefined, limit = 40): Recommendation[] {
  if (!taste || !Object.keys(taste.weights).length) return recs.slice(0, limit)
  return recs
    .map((r) => {
      const l = leaning(taste, traits[r.key])
      return { ...r, score: r.score * Math.exp(l.adjust), ...(l.liked.length ? { liked: l.liked } : {}), ...(l.disliked.length ? { disliked: l.disliked } : {}) }
    })
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity)
    .slice(0, limit)
}

/** Where the ranking gets its TMDB answers from (the computer and the phone each cache them their own way). */
export interface RecSources {
  /** TMDB's "recommended" list for a title key. */
  recommendations(key: string): Promise<SearchResult[]>
  /** TMDB's "similar" list for a title key. */
  similar(key: string): Promise<SearchResult[]>
  /** A title's creators, network, main cast and keywords. */
  traits(key: string): Promise<Trait[]>
}

export type CandidateList = { seed: Seed; results: SearchResult[] }

/**
 * Both of TMDB's lists for each seed, a few seeds at a time. "Similar" counts for SIMILAR_WEIGHT of
 * "recommended". A list that can't be fetched is left out until it can.
 */
export async function candidateLists(seeds: Seed[], sources: Pick<RecSources, 'recommendations' | 'similar'>): Promise<CandidateList[]> {
  const lists: CandidateList[] = []
  for (let i = 0; i < seeds.length; i += 5) {
    await Promise.all(
      seeds.slice(i, i + 5).flatMap((seed) =>
        (['recs', 'similar'] as const).map(async (source) => {
          try {
            const results = await (source === 'recs' ? sources.recommendations(seed.key) : sources.similar(seed.key))
            lists.push({ seed: source === 'recs' ? seed : { ...seed, weight: seed.weight * SIMILAR_WEIGHT }, results })
          } catch {
            // Skipped until it can be fetched.
          }
        })
      )
    )
  }
  return lists
}

export interface RankOptions {
  /** How many candidates to rank before learning moves them (default 90). */
  candidates?: number
  /** How many of the strongest candidates have their traits fetched to learn from (default 60). */
  withTraits?: number
  /** How many to return (default 40). */
  limit?: number
}

/**
 * The full ranking, the same on the computer and the phone: the seeds' lists added up, then (once
 * it has learnt something) the strongest candidates' traits are fetched so `taste` can move them up
 * or down. `taste` defaults to the library's own.
 */
export async function rankRecommendations(
  library: Library,
  lists: CandidateList[],
  sources: Pick<RecSources, 'traits'>,
  { candidates = 90, withTraits = 60, limit = 40 }: RankOptions = {},
  taste: Taste | undefined = library.recsTaste
): Promise<Recommendation[]> {
  const ranked = recommend(library, lists, Math.max(candidates, limit))
  if (!taste || !Object.keys(taste.weights).length) return ranked.slice(0, limit)
  const traits: Record<string, Trait[]> = {}
  const top = ranked.slice(0, withTraits)
  for (let i = 0; i < top.length; i += 8) {
    await Promise.all(
      top.slice(i, i + 8).map(async (r) => {
        try {
          traits[r.key] = await sources.traits(r.key)
        } catch {
          // Ranked without learning until it can be fetched.
        }
      })
    )
  }
  return applyTaste(ranked, traits, taste, limit)
}

/** Why a pick is there, in a line: "Because of The Walking Dead and Shadowhunters · you liked Jensen Ackles". */
export function whyText(r: Pick<Recommendation, 'because' | 'liked'>): string {
  const names = r.because.slice(0, 2)
  const more = r.because.length - names.length
  const base = names.length ? `Because of ${names.join(' and ')}${more > 0 ? ` +${more}` : ''}` : ''
  const liked = r.liked?.length ? `you were interested in others with ${r.liked.slice(0, 2).join(' and ')}` : ''
  return [base, liked].filter(Boolean).join(' · ')
}

/** "Not for me": hides a recommendation for good (the last 500). */
export function hideRecommendation(library: Library, key: string): Library {
  return { ...library, recsHidden: [...new Set([...(library.recsHidden ?? []), key])].slice(-500) }
}

/**
 * Interested or Not for me on a recommendation: learns from the title's traits, and Not for me also
 * hides it for good. (Interested adds it to Want to watch; that's done with the usual setStatus.)
 */
export function answerRecommendation(library: Library, key: string, yes: boolean, traits: Trait[]): Library {
  const lib = { ...library, recsTaste: learn(library.recsTaste, traits, yes) }
  return yes ? lib : hideRecommendation(lib, key)
}
