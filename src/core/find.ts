import { UNDATED, type LibraryEntry } from './types'

/** Phase 40: finding things in your own library: typing a name, and more ways to sort. */

export type LibrarySort = 'recent' | 'quickest' | 'az' | 'watched' | 'added' | 'year'

export const SORT_LABELS: Record<LibrarySort, string> = {
  recent: 'Recently changed',
  quickest: 'Quickest to finish',
  az: 'A to Z',
  watched: 'Last watched',
  added: 'Date added',
  year: 'Release year'
}

export const isSort = (s: unknown): s is LibrarySort => typeof s === 'string' && s in SORT_LABELS

/** Lower case, accents and punctuation dropped: "Amélie" and "amelie" match, as do "Spider-Man" and "spiderman". */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Whether a title matches what you've typed (every word, in any order, anywhere in the name). */
export function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  const name = fold(entry.title.name)
  const squashed = name.replace(/ /g, '')
  return q.split(' ').every((w) => name.includes(w) || squashed.includes(w))
}

/** The last day you watched anything of it (YYYY-MM-DD), or null if there's no dated watch. */
export function lastWatched(entry: LibraryEntry): string | null {
  const days: string[] = []
  for (const d of Object.values(entry.episodes ?? {})) if (d !== UNDATED) days.push(d)
  if (entry.watchedOn) days.push(entry.watchedOn)
  for (const r of entry.rewatches ?? []) {
    if (r.finishedOn) days.push(r.finishedOn)
    if (r.startedOn) days.push(r.startedOn)
    for (const d of Object.values(r.episodes ?? {})) if (d !== UNDATED) days.push(d)
  }
  return days.length ? days.sort()[days.length - 1].slice(0, 10) : null
}

/**
 * Sorts library entries (Quickest needs the minutes left, by key). Ties and unknowns fall back to
 * the name, so the order never jumps around.
 */
export function sortEntries(entries: LibraryEntry[], sort: LibrarySort, minutesLeft: Record<string, number> = {}): LibraryEntry[] {
  const byName = (a: LibraryEntry, b: LibraryEntry): number => a.title.name.localeCompare(b.title.name, 'en', { sensitivity: 'base', numeric: true })
  const desc = (x: string | number | null, y: string | number | null): number => (x === y ? 0 : x == null ? 1 : y == null ? -1 : x > y ? -1 : 1)
  const out = [...entries]
  switch (sort) {
    case 'az':
      return out.sort(byName)
    case 'added':
      return out.sort((a, b) => desc(a.addedAt, b.addedAt) || byName(a, b))
    case 'watched':
      return out.sort((a, b) => desc(lastWatched(a), lastWatched(b)) || byName(a, b))
    case 'year':
      return out.sort((a, b) => desc(a.title.year, b.title.year) || byName(a, b))
    case 'quickest': {
      const m = (e: LibraryEntry): number => minutesLeft[e.key] || Infinity
      return out.sort((a, b) => m(a) - m(b) || byName(a, b))
    }
    default:
      return out.sort((a, b) => desc(a.updatedAt, b.updatedAt))
  }
}
