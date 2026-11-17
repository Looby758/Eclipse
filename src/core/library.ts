import type { Library, LibraryEntry, MediaType, Preferences, TitleKey, TitleSnapshot, WatchStatus } from './types'
import { DEFAULT_PREFERENCES, WATCH_STATUSES, episodeKey, parseEpisodeKey, parseTitleKey } from './types'
import type { TitleRef } from './types'
import { normalizeLists, normalizeWatchSoon, refOf } from './lists'

export type LibraryItem = { key: TitleKey; type: MediaType; id: number; title: TitleSnapshot }

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
  item: LibraryItem,
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

/** Changes one entry (if it's in the library), stamping updatedAt. */
function changeEntry(library: Library, key: string, change: (e: LibraryEntry) => LibraryEntry, now: Date): Library {
  const old = library.entries[key]
  if (!old) return library
  return { ...library, entries: { ...library.entries, [key]: { ...change({ ...old }), updatedAt: now.toISOString() } } }
}

/**
 * Ticks (or unticks) episodes of a show. Ticking records today's date (a date already there is
 * kept), adds the show to your library if it isn't yet, and moves it to Watching from Want to
 * watch, Stopped or nothing.
 */
export function setEpisodes(library: Library, item: LibraryItem, keys: string[], watched: boolean, now: Date = new Date()): Library {
  let lib = library
  if (!lib.entries[item.key]) {
    if (!watched) return lib
    lib = setStatus(lib, item, 'watching', now)
  }
  return changeEntry(
    lib,
    item.key,
    (e) => {
      const episodes = { ...(e.episodes ?? {}) }
      for (const k of keys) {
        if (!parseEpisodeKey(k)) continue
        if (watched) episodes[k] = episodes[k] ?? localDate(now)
        else delete episodes[k]
      }
      const next: LibraryEntry = { ...e, episodes }
      if (!Object.keys(episodes).length) delete next.episodes
      if (watched && (e.status === 'want' || e.status === 'stopped')) next.status = 'watching'
      return next
    },
    now
  )
}

/** Sets or clears the one-line note on something in your library. */
export function setNote(library: Library, key: string, note: string, now: Date = new Date()): Library {
  const text = note.replace(/\s+/g, ' ').trim().slice(0, 300)
  return changeEntry(
    library,
    key,
    (e) => {
      const next: LibraryEntry = { ...e, note: text }
      if (!text) delete next.note
      return next
    },
    now
  )
}

/** Sets or clears the day you watched something (YYYY-MM-DD). */
export function setWatchedOn(library: Library, key: string, day: string | null, now: Date = new Date()): Library {
  if (day !== null && !isDay(day)) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next = { ...e }
      if (day) next.watchedOn = day
      else delete next.watchedOn
      return next
    },
    now
  )
}

const filled = new WeakMap<Preferences, Preferences>()

/** Your preferences, with defaults for anything not set yet. The same object comes back for the same library (so UIs can compare it). */
export function preferencesOf(library: Library): Preferences {
  const p = library.preferences
  if (!p) return DEFAULT_PREFERENCES
  let full = filled.get(p)
  if (!full) filled.set(p, (full = { ...DEFAULT_PREFERENCES, ...p }))
  return full
}

/** Sets or clears the day you want to have finished a show by. */
export function setFinishBy(library: Library, key: string, day: string | null, now: Date = new Date()): Library {
  if (day !== null && !isDay(day)) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next = { ...e }
      if (day) next.finishBy = day
      else delete next.finishBy
      return next
    },
    now
  )
}

export function setPreferences(library: Library, patch: Partial<Preferences>): Library {
  return { ...library, preferences: normalizePreferences({ ...preferencesOf(library), ...patch }) }
}

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

function normalizePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>
  const services = Array.isArray(p.services) ? [...new Set(p.services.filter((n): n is number => Number.isInteger(n) && n > 0))] : []
  const renewals: Record<string, number> = {}
  if (p.renewals && typeof p.renewals === 'object') {
    for (const [id, day] of Object.entries(p.renewals)) if (/^\d+$/.test(id) && Number.isInteger(day) && day >= 1 && day <= 31) renewals[id] = day
  }
  return {
    region: typeof p.region === 'string' && /^[A-Z]{2}$/.test(p.region) ? p.region : DEFAULT_PREFERENCES.region,
    services,
    startTime: isTime(p.startTime) ? p.startTime : DEFAULT_PREFERENCES.startTime,
    bedtime: isTime(p.bedtime) ? p.bedtime : DEFAULT_PREFERENCES.bedtime,
    watchDays: Array.isArray(p.watchDays)
      ? [...new Set(p.watchDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [...DEFAULT_PREFERENCES.watchDays],
    renewals,
    calendarEpisodes: p.calendarEpisodes === true
  }
}

/** Seasons as TMDB lists them: just what's needed to count episodes. */
export type SeasonCounts = { number: number; episodeCount: number }[]

/** How many regular episodes (no specials) you've ticked, out of how many there are. */
export function showProgress(entry: LibraryEntry | undefined, seasons: SeasonCounts): { watched: number; total: number } {
  const regular = seasons.filter((s) => s.number > 0)
  const total = regular.reduce((n, s) => n + s.episodeCount, 0)
  const ticked = Object.keys(entry?.episodes ?? {}).filter((k) => {
    const e = parseEpisodeKey(k)
    return e && regular.some((s) => s.number === e.season && e.episode <= s.episodeCount)
  }).length
  return { watched: ticked, total }
}

/** The episode after the furthest one you've ticked (S1E1 if none), or null when you're through. */
export function nextEpisodeFor(entry: LibraryEntry | undefined, seasons: SeasonCounts): { season: number; episode: number } | null {
  const order: { season: number; episode: number }[] = []
  for (const s of [...seasons].filter((x) => x.number > 0).sort((a, b) => a.number - b.number)) {
    for (let e = 1; e <= s.episodeCount; e++) order.push({ season: s.number, episode: e })
  }
  const seen = entry?.episodes ?? {}
  let last = -1
  order.forEach((ep, i) => {
    if (seen[episodeKey(ep.season, ep.episode)]) last = i
  })
  return order[last + 1] ?? null
}

/**
 * Reads a library from whatever was in the file, keeping every entry that makes sense and quietly
 * dropping broken ones, so a hand edit or a half-synced file never stops the app from opening.
 */
export function normalizeLibrary(raw: unknown): Library {
  const lib = emptyLibrary()
  if (raw && typeof raw === 'object' && 'preferences' in raw) lib.preferences = normalizePreferences((raw as { preferences?: unknown }).preferences)
  const entries = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : null
  const legacy: { name: string; ref: TitleRef }[] = []
  const rawLists = raw && typeof raw === 'object' ? (raw as { lists?: unknown }).lists : undefined
  const rawSoon = raw && typeof raw === 'object' ? (raw as { watchSoon?: unknown }).watchSoon : undefined
  const finish = (): Library => {
    const lists = normalizeLists(rawLists, legacy)
    if (lists) lib.lists = lists
    const soon = normalizeWatchSoon(rawSoon)
    if (soon) lib.watchSoon = soon
    return lib
  }
  if (!entries || typeof entries !== 'object') return finish()
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
      ...(isDay(e.finishBy) ? { finishBy: e.finishBy } : {}),
      ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim().slice(0, 300) } : {}),
      ...(typeof e.rating === 'number' && e.rating >= 0 && e.rating <= 10 ? { rating: e.rating } : {}),
      ...(cleanEpisodes(e.episodes) ?? {}),
      title: {
        name: typeof t.name === 'string' ? t.name : 'Untitled',
        year: typeof t.year === 'number' ? t.year : null,
        posterPath: typeof t.posterPath === 'string' ? t.posterPath : null
      }
    }
    // Older files kept list names on each title (from the Sequel import): they become your own lists.
    const old = (e as { lists?: unknown }).lists
    if (Array.isArray(old)) for (const name of old) if (typeof name === 'string' && name.trim()) legacy.push({ name: name.trim(), ref: refOf(lib.entries[key]) })
  }
  return finish()
}

function cleanEpisodes(raw: unknown): { episodes: Record<string, string> } | null {
  if (!raw || typeof raw !== 'object') return null
  const episodes: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ep = parseEpisodeKey(k)
    if (ep && isDay(v)) episodes[episodeKey(ep.season, ep.episode)] = v
  }
  return Object.keys(episodes).length ? { episodes } : null
}
