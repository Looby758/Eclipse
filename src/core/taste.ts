import type { Taste, Trait } from './types'

/**
 * Recommendations that learn from your answers (phase 43). Genres and topics don't say what you like
 * about a show (plenty of monster-hunting shows are nothing like Shadowhunters), so nothing is
 * guessed up front. Each *Not for me* lowers anything sharing its creators, network, main cast or
 * TMDB keywords, and each *Interested* raises them. It starts out generic and gets sharper as you
 * answer. Plain arithmetic, saved in the library so both computers agree. No AI.
 */

export type TraitKind = 'creator' | 'network' | 'cast' | 'keyword'

/**
 * How far one answer moves a trait. Who made it says the most about what it's like; keywords the
 * least, since most titles have a dozen of them and many are broad ("based on novel or book").
 */
export const STEP: Record<TraitKind, number> = { creator: 0.6, cast: 0.3, network: 0.25, keyword: 0.12 }
/** No single trait goes past this either way, so one strong opinion can't bury everything. */
const MAX_WEIGHT = 2.5
/** Keywords together count for at most this much either way. */
const MAX_KEYWORDS = 1.2
/** The whole adjustment, either way (e^2.5 ≈ 12× up or down). */
const MAX_TOTAL = 2.5
/** The library keeps the strongest this many traits. */
const MAX_TRAITS = 800

export const kindOf = (id: string): TraitKind | null => {
  const k = id.split(':')[0]
  return k === 'creator' || k === 'network' || k === 'cast' || k === 'keyword' ? k : null
}

export const emptyTaste = (): Taste => ({ weights: {}, yes: 0, no: 0 })

/** Learns from one answer: Interested (yes) raises every trait of the title, Not for me lowers them. */
export function learn(taste: Taste | undefined, traits: Trait[], yes: boolean): Taste {
  const weights = { ...(taste?.weights ?? {}) }
  const seen = new Set<string>()
  for (const t of traits) {
    const kind = kindOf(t.id)
    if (!kind || seen.has(t.id)) continue
    seen.add(t.id)
    const was = weights[t.id]?.w ?? 0
    const w = Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, was + (yes ? STEP[kind] : -STEP[kind])))
    if (Math.abs(w) < 1e-9) delete weights[t.id]
    else weights[t.id] = { w: Math.round(w * 1000) / 1000, name: t.name }
  }
  const kept = Object.entries(weights)
    .sort((a, b) => Math.abs(b[1].w) - Math.abs(a[1].w))
    .slice(0, MAX_TRAITS)
  return { weights: Object.fromEntries(kept), yes: (taste?.yes ?? 0) + (yes ? 1 : 0), no: (taste?.no ?? 0) + (yes ? 0 : 1) }
}

export interface Leaning {
  /** How much to raise (above 0) or lower (below 0) a title: its score is multiplied by e^this. */
  adjust: number
  /** The traits it shares with things you said yes to, strongest first ("Eric Kripke"). */
  liked: string[]
  /** The traits it shares with things you said no to, strongest first. */
  disliked: string[]
}

/** How your answers so far lean on a title with these traits. */
export function leaning(taste: Taste | undefined, traits: Trait[] | undefined): Leaning {
  if (!taste || !traits?.length) return { adjust: 0, liked: [], disliked: [] }
  let other = 0
  let keywords = 0
  const hits: { name: string; w: number; kind: TraitKind }[] = []
  const seen = new Set<string>()
  for (const t of traits) {
    const got = taste.weights[t.id]
    const kind = kindOf(t.id)
    if (!got || !kind || seen.has(t.id)) continue
    seen.add(t.id)
    if (kind === 'keyword') keywords += got.w
    else other += got.w
    hits.push({ name: got.name || t.name, w: got.w, kind })
  }
  const adjust = Math.max(-MAX_TOTAL, Math.min(MAX_TOTAL, other + Math.max(-MAX_KEYWORDS, Math.min(MAX_KEYWORDS, keywords))))
  // Reasons name people and networks before keywords, and only ones that clearly lean one way.
  const named = (sign: 1 | -1): string[] =>
    hits
      .filter((h) => h.w * sign >= 0.25)
      .sort((a, b) => (a.kind === 'keyword' ? 1 : 0) - (b.kind === 'keyword' ? 1 : 0) || Math.abs(b.w) - Math.abs(a.w))
      .map((h) => h.name)
  return { adjust, liked: named(1), disliked: named(-1) }
}

/** Reads learnt weights back from the library file, dropping anything that doesn't make sense. */
export function normalizeTaste(raw: unknown): Taste | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as { weights?: unknown; yes?: unknown; no?: unknown }
  const weights: Taste['weights'] = {}
  if (r.weights && typeof r.weights === 'object') {
    for (const [id, v] of Object.entries(r.weights as Record<string, unknown>)) {
      if (!kindOf(id) || !/^[a-z]+:\d+$/.test(id) || !v || typeof v !== 'object') continue
      const { w, name } = v as { w?: unknown; name?: unknown }
      if (typeof w !== 'number' || !Number.isFinite(w) || w === 0) continue
      weights[id] = { w: Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, w)), name: typeof name === 'string' ? name.slice(0, 80) : '' }
    }
  }
  const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
  const taste = { weights, yes: count(r.yes), no: count(r.no) }
  return Object.keys(weights).length || taste.yes || taste.no ? taste : undefined
}
