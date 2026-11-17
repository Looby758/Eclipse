import type { Library, LibraryEntry, MediaType, TitleKey, TitleSnapshot, WatchStatus } from './types'
import { WATCH_STATUSES, parseTitleKey } from './types'

/**
 * Your library: every film and show you've given a status, kept in library.json in your data
 * folder. These functions never change a library in place; they return a new one to save.
 */

export const emptyLibrary = (): Library => ({ version: 1, entries: {} })

/** Your local date as YYYY-MM-DD (not UTC, so a late-night watch lands on the right day). */
export function localDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Sets a title's status (adding it to the library if it's new), or removes it with `null`.
 * Marking something Watched records today's date, unless it already has one.
 */
export function setStatus(
  library: Library,
  item: { key: TitleKey; type: MediaType; id: number; title: TitleSnapshot },
  status: WatchStatus | null,
  now: Date = new Date()
): Library {
  const entries = { ...library.entries }
  if (status === null) {
    delete entries[item.key]
    return { ...library, entries }
  }
  const stamp = now.toISOString()
  const old = entries[item.key]
  const entry: LibraryEntry = old
    ? { ...old, status, updatedAt: stamp, title: item.title }
    : { key: item.key, type: item.type, id: item.id, status, addedAt: stamp, updatedAt: stamp, title: item.title }
  if (status === 'watched' && !entry.watchedOn) entry.watchedOn = localDate(now)
  entries[item.key] = entry
  return { ...library, entries }
}

/** Entries with a given status (or all), most recently changed first. */
export function entriesWith(library: Library, status?: WatchStatus, type?: MediaType): LibraryEntry[] {
  return Object.values(library.entries)
    .filter((e) => (!status || e.status === status) && (!type || e.type === type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function countByStatus(library: Library): Record<WatchStatus, number> {
  const counts = { want: 0, watching: 0, watched: 0, stopped: 0 }
  for (const e of Object.values(library.entries)) counts[e.status]++
  return counts
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * Reads a library from whatever was in the file, keeping every entry that makes sense and quietly
 * dropping broken ones, so a hand edit or a half-synced file never stops the app from opening.
 */
export function normalizeLibrary(raw: unknown): Library {
  const lib = emptyLibrary()
  const entries = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : null
  if (!entries || typeof entries !== 'object') return lib
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    const parsed = parseTitleKey(key)
    if (!parsed || !value || typeof value !== 'object') continue
    const e = value as Partial<LibraryEntry>
    if (!e.status || !WATCH_STATUSES.includes(e.status)) continue
    const t = (e.title ?? {}) as Partial<TitleSnapshot>
    const now = new Date(0).toISOString()
    lib.entries[key] = {
      key: key as TitleKey,
      type: parsed.type,
      id: parsed.id,
      status: e.status,
      addedAt: typeof e.addedAt === 'string' ? e.addedAt : now,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : typeof e.addedAt === 'string' ? e.addedAt : now,
      ...(isDay(e.watchedOn) ? { watchedOn: e.watchedOn } : {}),
      title: {
        name: typeof t.name === 'string' ? t.name : 'Untitled',
        year: typeof t.year === 'number' ? t.year : null,
        posterPath: typeof t.posterPath === 'string' ? t.posterPath : null
      }
    }
  }
  return lib
}
