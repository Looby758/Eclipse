import { episodeKey, parseEpisodeKey, REACTION_LIST, UNDATED, type Library, type LibraryEntry, type Reaction } from './types'

/**
 * Phase 47, "My own heatmap": after ticking an episode, one optional tap for how it hit you
 * (😭 🔥 😂 😴 🤯). Each reaction is saved with the tick it belongs to (your first watch, a rewatch,
 * or a watch with someone), so it's in library.json for both computers and in the export. The
 * heatmap's *Mine* view shows them beside TMDB's ratings, and recommendations (phase 43) lean
 * towards shows that hit you and away from ones that dragged.
 */

export const isReaction = (v: unknown): v is Reaction => typeof v === 'string' && (REACTION_LIST as string[]).includes(v)

/** Keeps only real reactions on episodes that are ticked in the same watch. */
export function cleanReactions(raw: unknown, episodes: Record<string, string> | undefined): Record<string, Reaction> | undefined {
  if (!raw || typeof raw !== 'object' || !episodes) return undefined
  const out: Record<string, Reaction> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ep = parseEpisodeKey(k)
    if (!ep || !isReaction(v)) continue
    const key = episodeKey(ep.season, ep.episode)
    if (episodes[key]) out[key] = v
  }
  return Object.keys(out).length ? out : undefined
}

/** A watch of a show: your first (-1) or one of `rewatches` by its place. */
type Watch = { index: number; episodes?: Record<string, string>; reactions?: Record<string, Reaction> }

function watchesOf(e: LibraryEntry): Watch[] {
  return [{ index: -1, episodes: e.episodes, reactions: e.reactions }, ...(e.rewatches ?? []).map((r, index) => ({ index, episodes: r.episodes, reactions: r.reactions }))]
}

/** The day a watch ticked this episode, comparable as text ("seen", with no date, is oldest). */
const tickDay = (w: Watch, k: string): string | null => {
  const v = w.episodes?.[k]
  return !v ? null : v === UNDATED ? '0000-00-00' : v
}

/** The watches that ticked an episode, most recent tick first (later watches win a tie). */
function ticksOf(e: LibraryEntry, k: string): Watch[] {
  return watchesOf(e)
    .filter((w) => tickDay(w, k))
    .sort((a, b) => tickDay(b, k)!.localeCompare(tickDay(a, k)!) || b.index - a.index)
}

/** Whether any watch of the show has ticked this episode. */
export const isTicked = (e: LibraryEntry | undefined, k: string): boolean => !!e && ticksOf(e, k).length > 0

/** How an episode hit you: the reaction on its most recent tick, or an earlier watch's if that one has none. */
export function reactionOf(e: LibraryEntry | undefined, k: string): Reaction | undefined {
  if (!e) return undefined
  for (const w of ticksOf(e, k)) if (w.reactions?.[k]) return w.reactions[k]
  return undefined
}

/** Every episode you've reacted to, as reactionOf sees it. */
export function reactionsOf(e: LibraryEntry | undefined): Record<string, Reaction> {
  const out: Record<string, Reaction> = {}
  if (!e) return out
  const keys = new Set(watchesOf(e).flatMap((w) => Object.keys(w.reactions ?? {})))
  for (const k of keys) {
    const r = reactionOf(e, k)
    if (r) out[k] = r
  }
  return out
}

/**
 * Sets (or clears, with null) how an episode hit you, on its most recent tick. Nothing happens if
 * the episode isn't ticked anywhere: a reaction always belongs to a tick.
 */
export function setReaction(library: Library, key: string, k: string, reaction: Reaction | null, now: Date = new Date()): Library {
  const e = library.entries[key]
  const ep = parseEpisodeKey(k)
  if (!e || !ep || (reaction !== null && !isReaction(reaction))) return library
  const target = ticksOf(e, episodeKey(ep.season, ep.episode))[0]
  if (!target) return library
  const ek = episodeKey(ep.season, ep.episode)
  const next = { ...(target.reactions ?? {}) }
  if (reaction) next[ek] = reaction
  else delete next[ek]
  const reactions = Object.keys(next).length ? next : undefined
  const changed: LibraryEntry = { ...e, updatedAt: now.toISOString() }
  if (target.index === -1) {
    if (reactions) changed.reactions = reactions
    else delete changed.reactions
  } else {
    changed.rewatches = (e.rewatches ?? []).map((r, i) => {
      if (i !== target.index) return r
      const x = { ...r }
      if (reactions) x.reactions = reactions
      else delete x.reactions
      return x
    })
  }
  return { ...library, entries: { ...library.entries, [key]: changed } }
}

/** Takes reactions off episodes that are no longer ticked in that watch (after unticking). */
export function dropUnticked<T extends { episodes?: Record<string, string>; reactions?: Record<string, Reaction> }>(w: T): T {
  if (!w.reactions) return w
  const kept = cleanReactions(w.reactions, w.episodes)
  if (kept && Object.keys(kept).length === Object.keys(w.reactions).length) return w
  const x = { ...w }
  if (kept) x.reactions = kept
  else delete x.reactions
  return x
}

// ---- Asking after a tick ----

export interface FreshTick {
  key: string
  name: string
  season: number
  episode: number
}

/** Every dated tick in a library, as "tv:1396|-1|S1E3" (title, watch, episode). */
function datedTicks(library: Library): Set<string> {
  const out = new Set<string>()
  for (const e of Object.values(library.entries)) {
    if (e.type !== 'tv') continue
    for (const w of watchesOf(e)) for (const [k, v] of Object.entries(w.episodes ?? {})) if (v !== UNDATED) out.add(`${e.key}|${w.index}|${k}`)
  }
  return out
}

/**
 * The one episode just ticked between two versions of the library, to ask how it hit you. Only a
 * single new tick dated today counts: ticking a whole season, marking things seen before, or a
 * batch from the other computer doesn't ask. Null when there's nothing to ask about.
 */
export function freshTick(before: Library, after: Library, today: string): FreshTick | null {
  const was = datedTicks(before)
  const added = [...datedTicks(after)].filter((t) => !was.has(t))
  if (added.length !== 1) return null
  const [key, index, k] = added[0].split('|')
  const e = after.entries[key]
  const ep = parseEpisodeKey(k)
  if (!e || !ep) return null
  const w = watchesOf(e).find((x) => String(x.index) === index)
  if (w?.episodes?.[k] !== today || w.reactions?.[k]) return null
  return { key, name: e.title.name, season: ep.season, episode: ep.episode }
}

// ---- Mine against TMDB ----

/** How strongly a reaction says "this was good": 😭 🔥 🤯 yes, 😂 a bit, 😴 no. */
export function reactionTone(r: Reaction): number {
  return r === 'sleep' ? -1 : r === 'laugh' ? 0.5 : 1
}

/**
 * Where you and everyone else disagree: a 😴 on an episode in the top third of the show's ratings
 * ("everyone else loved it"), or 😭 🔥 🤯 on one in the bottom third ("you loved it, they didn't").
 * `low` and `high` are the show's rating range, as the heatmap colours it.
 */
export function disagreement(reaction: Reaction | undefined, rating: number | null, low: number, high: number): 'loved' | 'dragged' | null {
  if (!reaction || rating === null) return null
  const t = (rating - low) / (high - low || 1)
  if (reaction === 'sleep' && t >= 2 / 3) return 'dragged'
  if (reactionTone(reaction) === 1 && t <= 1 / 3) return 'loved'
  return null
}

/**
 * For recommendations (phase 43): how much a show hit you, from your reactions to it. 1 with no
 * reactions (or too few to say); up to 1.5 when most were 😭 🔥 🤯, down to 0.5 when most were 😴.
 * It takes about five reactions to count fully.
 */
export function reactionWeight(e: LibraryEntry | undefined): number {
  const all = Object.values(reactionsOf(e))
  if (all.length < 2) return 1
  const mean = all.reduce((n, r) => n + reactionTone(r), 0) / all.length
  const sure = Math.min(1, all.length / 5)
  return Math.round((1 + 0.5 * mean * sure) * 100) / 100
}
