import type { Library, PersonDetails, PersonRef, TitleRef } from './types'
import { parseEpisodeKey } from './types'

/**
 * "Where do I know them from?": the cast of a title who are also in things you've watched (or
 * are part-way through), e.g. "You know Rhea Seehorn from Better Call Saul".
 */

export interface KnownFrom {
  person: PersonRef
  /** Up to three, the ones you watched most recently first. */
  titles: TitleRef[]
}

/** The last day you watched any of it, for ordering (undated counts as long ago). */
function lastWatched(library: Library, key: string): string {
  const e = library.entries[key]
  if (!e) return ''
  const days = [e.watchedOn ?? '', ...Object.entries(e.episodes ?? {}).filter(([k]) => parseEpisodeKey(k)).map(([, v]) => (v === 'seen' ? '0000' : v))]
  return days.sort().pop() ?? ''
}

/** Watched, or part-way through (episodes ticked). */
function seenSome(library: Library, key: string): boolean {
  const e = library.entries[key]
  if (!e) return false
  return e.status === 'watched' || !!e.seenBefore || Object.keys(e.episodes ?? {}).length > 0 || (e.rewatches?.length ?? 0) > 0
}

export function knownFrom(cast: PersonRef[], people: Record<number, PersonDetails>, library: Library, selfKey: string, limit = 8): KnownFrom[] {
  const out: KnownFrom[] = []
  for (const person of cast) {
    const p = people[person.id]
    if (!p) continue
    const titles = p.acted
      .filter((t) => t.key !== selfKey && seenSome(library, t.key))
      .sort((a, b) => lastWatched(library, b.key).localeCompare(lastWatched(library, a.key)))
      .slice(0, 3)
    if (titles.length) out.push({ person, titles })
    if (out.length >= limit) break
  }
  return out
}
