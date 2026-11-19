import type { Dropped, JustTonight, Library, LibraryEntry, MediaType, Preferences, Reaction, Rewatch, TitleDetails, TitleKey, TitleSnapshot, WatchSlot, WatchStatus } from './types'
import type { PlannedTime } from './types'
import { DEFAULT_PREFERENCES, UNDATED, WATCH_STATUSES, episodeKey, parseEpisodeKey, parseTitleKey } from './types'
import type { TitleRef } from './types'
import { normalizeLists, normalizeWatchSoon, refOf } from './lists'
import { normalizeLinks, normalizeMoments } from './watching'
import { normalizeTaste } from './taste'
import { normalizePosters } from './posters'
import { normalizeFavourites } from './favourites'
import { cleanReactions, dropUnticked } from './reactions'

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
  if (status === 'watched' && !entry.watchedOn && !entry.seenBefore) entry.watchedOn = localDate(now)
  entries[item.key] = entry
  return { ...library, entries }
}

/**
 * Entries with a given status (or all), most recently changed first. A show you're rewatching
 * comes back as Watching, with the rewatch's ticks (see activeEntry).
 */
export function entriesWith(library: Library, status?: WatchStatus, type?: MediaType): LibraryEntry[] {
  return Object.values(library.entries)
    .map((e) => activeEntry(e)!)
    .filter((e) => (!status || e.status === status) && (!type || e.type === type))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function countByStatus(library: Library): Record<WatchStatus, number> {
  const counts = { want: 0, watching: 0, watched: 0, stopped: 0 }
  for (const e of Object.values(library.entries)) counts[activeEntry(e)!.status]++
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
/**
 * Ticks (or unticks) episodes. While you're rewatching, the ticks go on the rewatch, not your first
 * watch. `undated` ticks them as seen with no date (watched before Eclipse).
 */
export function setEpisodes(library: Library, item: LibraryItem, keys: string[], watched: boolean, now: Date = new Date(), undated = false): Library {
  const day = undated ? UNDATED : localDate(now)
  const rewatch = currentRewatch(library.entries[item.key])
  if (rewatch) {
    return changeEntry(
      library,
      item.key,
      (e) => {
        const episodes = { ...(rewatch.episodes ?? {}) }
        for (const k of keys) {
          if (!parseEpisodeKey(k)) continue
          if (watched) episodes[k] = episodes[k] ?? day
          else delete episodes[k]
        }
        const r: Rewatch = { ...rewatch, episodes }
        if (!Object.keys(episodes).length) delete r.episodes
        return { ...e, rewatches: (e.rewatches ?? []).map((x) => (x === rewatch ? dropUnticked(r) : x)) }
      },
      now
    )
  }
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
        if (watched) episodes[k] = episodes[k] && episodes[k] !== UNDATED ? episodes[k] : day
        else delete episodes[k]
      }
      const next: LibraryEntry = { ...e, episodes }
      if (!Object.keys(episodes).length) delete next.episodes
      if (watched && (e.status === 'want' || e.status === 'stopped')) next.status = 'watching'
      return dropUnticked(next)
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

/** Sets or clears who recommended it. */
/**
 * Your own rating out of 10, in whole steps (five stars with halves, like Sequel: 7 is three and a
 * half stars). null takes it off.
 */
export function setRating(library: Library, key: string, rating: number | null, now: Date = new Date()): Library {
  const value = rating === null || !Number.isFinite(rating) ? null : Math.min(10, Math.max(1, Math.round(rating)))
  if (!library.entries[key] || (library.entries[key].rating ?? null) === value) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next: LibraryEntry = { ...e, rating: value ?? 0 }
      if (value === null) delete next.rating
      return next
    },
    now
  )
}

export function setFrom(library: Library, key: string, from: string, now: Date = new Date()): Library {
  const text = from.replace(/\s+/g, ' ').trim().slice(0, 80)
  if ((library.entries[key]?.from ?? '') === text) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next: LibraryEntry = { ...e, from: text }
      if (!text) delete next.from
      return next
    },
    now
  )
}

/** Everyone (and everywhere) that's recommended you something, with how many, most first. Names match ignoring case. */
export function recommenders(library: Library): { name: string; count: number }[] {
  const n = new Map<string, { name: string; count: number }>()
  for (const e of Object.values(library.entries)) {
    if (!e.from) continue
    const k = e.from.toLowerCase()
    const x = n.get(k) ?? { name: e.from, count: 0 }
    x.count++
    n.set(k, x)
  }
  return [...n.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Sets or clears the day you watched something (YYYY-MM-DD). */
export function setWatchedOn(library: Library, key: string, day: string | null, now: Date = new Date()): Library {
  if (day !== null && !isDay(day)) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next = { ...e }
      if (day) {
        next.watchedOn = day
        delete next.seenBefore
      } else delete next.watchedOn
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

/** Don't nudge about a title until a day (or nudge again: null). */
export function snoozeTitle(library: Library, key: string, until: string | null, now: Date = new Date()): Library {
  if (until !== null && !isDay(until)) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const next = { ...e }
      if (until) next.snoozedUntil = until
      else delete next.snoozedUntil
      return next
    },
    now
  )
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
  const merged: Partial<Preferences> = { ...preferencesOf(library), ...patch }
  // An older copy of Eclipse (or a test) setting the usual evening directly: rebuild the week from it.
  if (!patch.schedule && (patch.startTime || patch.bedtime || patch.watchDays)) delete merged.schedule
  return { ...library, preferences: normalizePreferences(merged) }
}

const MAX_SLOTS = 3

function normalizeSchedule(p: Partial<Preferences>, start: string, bed: string, days: number[]): WatchSlot[][] {
  const valid = Array.isArray(p.schedule) && p.schedule.length === 7 && p.schedule.every((d) => Array.isArray(d))
  if (!valid) return [0, 1, 2, 3, 4, 5, 6].map((d) => (days.includes(d) ? [{ start, end: bed }] : []))
  return p.schedule!.map((slots) =>
    slots
      .filter((x): x is WatchSlot => !!x && isTime(x.start) && isTime(x.end) && x.start !== x.end)
      .map((x) => ({ start: x.start, end: x.end }))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, MAX_SLOTS)
  )
}

/** "Your usual evening" from a week: the evening slot most days have (for older copies and short labels). */
function usualEvening(schedule: WatchSlot[][], fallback: WatchSlot): WatchSlot {
  const counts = new Map<string, number>()
  for (const slots of schedule) {
    const last = slots[slots.length - 1]
    if (last) counts.set(`${last.start}-${last.end}`, (counts.get(`${last.start}-${last.end}`) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!top) return fallback
  const [start, end] = top[0].split('-')
  return { start, end }
}

const minutesIn = (v: unknown, max: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null)

function normalizeJustTonight(v: unknown): JustTonight | undefined {
  if (!v || typeof v !== 'object') return undefined
  const j = v as Partial<JustTonight>
  if (typeof j.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j.day)) return undefined
  const out: JustTonight = { day: j.day }
  if (j.off === true) out.off = true
  else {
    if (isTime(j.start)) out.start = j.start
    if (isTime(j.bedtime)) out.bedtime = j.bedtime
  }
  return out.off || out.start || out.bedtime ? out : undefined
}

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

function normalizePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>
  const services = Array.isArray(p.services) ? [...new Set(p.services.filter((n): n is number => Number.isInteger(n) && n > 0))] : []
  const renewals: Record<string, number> = {}
  if (p.renewals && typeof p.renewals === 'object') {
    for (const [id, day] of Object.entries(p.renewals)) if (/^\d+$/.test(id) && Number.isInteger(day) && day >= 1 && day <= 31) renewals[id] = day
  }
  const start = isTime(p.startTime) ? p.startTime : DEFAULT_PREFERENCES.startTime
  const bed = isTime(p.bedtime) ? p.bedtime : DEFAULT_PREFERENCES.bedtime
  const days = Array.isArray(p.watchDays)
    ? [...new Set(p.watchDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [...DEFAULT_PREFERENCES.watchDays]
  const schedule = normalizeSchedule(p, start, bed, days)
  const usual = usualEvening(schedule, { start, end: bed })
  const justTonight = normalizeJustTonight(p.justTonight)
  return {
    region: typeof p.region === 'string' && /^[A-Z]{2}$/.test(p.region) ? p.region : DEFAULT_PREFERENCES.region,
    services,
    startTime: usual.start,
    bedtime: usual.end,
    watchDays: schedule.map((s, d) => (s.length ? d : -1)).filter((d) => d >= 0),
    schedule,
    ...(justTonight ? { justTonight } : {}),
    gapMinutes: minutesIn(p.gapMinutes, 30) ?? 0,
    windDownMinutes: minutesIn(p.windDownMinutes, 120) ?? 0,
    weeklyBudgetMinutes: minutesIn(p.weeklyBudgetMinutes, 7 * 24 * 60) ?? 0,
    renewals,
    calendarEpisodes: p.calendarEpisodes === true,
    stalledDays: Number.isInteger(p.stalledDays) && p.stalledDays! >= 7 && p.stalledDays! <= 730 ? p.stalledDays! : DEFAULT_PREFERENCES.stalledDays,
    catchUpSkipDays: Number.isInteger(p.catchUpSkipDays) && p.catchUpSkipDays! >= 0 && p.catchUpSkipDays! <= 3650 ? p.catchUpSkipDays! : DEFAULT_PREFERENCES.catchUpSkipDays
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
  const rawDropped = raw && typeof raw === 'object' ? (raw as { dropped?: unknown }).dropped : undefined
  const rawLeft = raw && typeof raw === 'object' ? (raw as { repairLeft?: unknown }).repairLeft : undefined
  const rawCatch = raw && typeof raw === 'object' ? (raw as { catchUpDismissed?: unknown }).catchUpDismissed : undefined
  const rawHidden = raw && typeof raw === 'object' ? (raw as { recsHidden?: unknown }).recsHidden : undefined
  const rawTaste = raw && typeof raw === 'object' ? (raw as { recsTaste?: unknown }).recsTaste : undefined
  const rawApplied = raw && typeof raw === 'object' ? (raw as { phoneApplied?: unknown }).phoneApplied : undefined
  const rawPosters = raw && typeof raw === 'object' ? (raw as { posters?: unknown }).posters : undefined
  const rawBackdrops = raw && typeof raw === 'object' ? (raw as { backdrops?: unknown }).backdrops : undefined
  const rawFavourites = raw && typeof raw === 'object' ? (raw as { favourites?: unknown }).favourites : undefined
  const finish = (): Library => {
    const posters = normalizePosters(rawPosters)
    if (posters) lib.posters = posters
    const backdrops = normalizePosters(rawBackdrops)
    if (backdrops) lib.backdrops = backdrops
    const favourites = normalizeFavourites(rawFavourites)
    if (favourites) lib.favourites = favourites
    const taste = normalizeTaste(rawTaste)
    if (taste) lib.recsTaste = taste
    if (Array.isArray(rawApplied)) {
      const ids = [...new Set(rawApplied.filter((x): x is string => typeof x === 'string' && !!x))].slice(-1000)
      if (ids.length) lib.phoneApplied = ids
    }
    if (Array.isArray(rawHidden)) {
      const hidden = [...new Set(rawHidden.filter((x): x is string => typeof x === 'string' && /^(movie|tv):\d+$/.test(x)))]
      if (hidden.length) lib.recsHidden = hidden.slice(-500)
    }
    if (Array.isArray(rawCatch)) {
      const no = [...new Set(rawCatch.filter((x): x is string => typeof x === 'string' && /^(movie|tv):\d+(@S\d+)?>(movie|tv):\d+(@S\d+)?$/.test(x)))]
      if (no.length) lib.catchUpDismissed = no.slice(-300)
    }
    if (Array.isArray(rawLeft)) {
      const left = [...new Set(rawLeft.filter((x): x is string => typeof x === 'string' && /^(movie|tv):\d+@\d{4}-\d{2}-\d{2}$/.test(x)))]
      if (left.length) lib.repairLeft = left
    }
    const dropped = normalizeDropped(rawDropped)
    if (dropped) lib.dropped = dropped
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
      ...(isDay(e.snoozedUntil) ? { snoozedUntil: e.snoozedUntil } : {}),
      ...(normalizeMoments(e.moments) ? { moments: normalizeMoments(e.moments) } : {}),
      ...(normalizeLinks(e.links) ? { links: normalizeLinks(e.links) } : {}),
      ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim().slice(0, 300) } : {}),
      ...(typeof e.from === 'string' && e.from.trim() ? { from: e.from.trim().slice(0, 80) } : {}),
      ...(typeof e.rating === 'number' && e.rating >= 0 && e.rating <= 10 ? { rating: e.rating } : {}),
      ...(cleanEpisodes(e.episodes) ?? {}),
      ...withReactions(e.reactions, cleanEpisodes(e.episodes)?.episodes),
      ...(e.seenBefore === true ? { seenBefore: true } : {}),
      ...cleanRewatches(e.rewatches),
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

const isPlannedAt = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)

function cleanRewatches(raw: unknown): { rewatches?: Rewatch[] } {
  if (!Array.isArray(raw)) return {}
  const out: Rewatch[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object' || !isDay((r as Rewatch).startedOn)) continue
    const x = r as Rewatch
    const done = isDay(x.finishedOn) ? x.finishedOn : undefined
    const who = typeof x.with === 'string' && x.with.trim() ? x.with.trim().slice(0, 60) : undefined
    // Only one of your own rewatches can still be going (and one per person you watch with).
    if (!done && out.some((o) => !o.finishedOn && o.with === who)) continue
    const planned = who && !done && x.planned && typeof x.planned === 'object' && isPlannedAt(x.planned.at) ? { at: x.planned.at, ...(x.planned.weekly === true ? { weekly: true } : {}) } : undefined
    out.push({ startedOn: x.startedOn, ...(done ? { finishedOn: done } : {}), ...(cleanEpisodes(x.episodes) ?? {}), ...withReactions(x.reactions, cleanEpisodes(x.episodes)?.episodes), ...(who ? { with: who } : {}), ...(planned ? { planned } : {}) })
  }
  out.sort((a, b) => (a.finishedOn ? 0 : 1) - (b.finishedOn ? 0 : 1) || a.startedOn.localeCompare(b.startedOn))
  return out.length ? { rewatches: out } : {}
}

function withReactions(raw: unknown, episodes: Record<string, string> | undefined): { reactions?: Record<string, Reaction> } {
  const reactions = cleanReactions(raw, episodes)
  return reactions ? { reactions } : {}
}

function cleanEpisodes(raw: unknown): { episodes: Record<string, string> } | null {
  if (!raw || typeof raw !== 'object') return null
  const episodes: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const ep = parseEpisodeKey(k)
    if (ep && (isDay(v) || v === UNDATED)) episodes[episodeKey(ep.season, ep.episode)] = v as string
  }
  return Object.keys(episodes).length ? { episodes } : null
}

// ---- Seen before and rewatches ----

/** The rewatch you're part-way through, if any. */
export const currentRewatch = (e: LibraryEntry | undefined): Rewatch | undefined => e?.rewatches?.find((r) => !r.finishedOn && !r.with)

const active = new WeakMap<LibraryEntry, LibraryEntry>()

/**
 * The entry as progress should see it: while you're rewatching, a Watching show with the rewatch's
 * ticks, so "next episode", time left and the heatmap follow the rewatch. The same object comes
 * back for the same entry (so UIs can compare it).
 */
export function activeEntry(e: LibraryEntry | undefined): LibraryEntry | undefined {
  const r = currentRewatch(e)
  if (!e || !r) return e
  let view = active.get(e)
  if (!view) {
    view = { ...e, status: 'watching', episodes: r.episodes ?? {} }
    if (!r.episodes) delete view.episodes
    active.set(e, view)
  }
  return view
}

/** How many times you've watched it: the first time (dated or not) plus every finished rewatch. */
export function watchCount(e: LibraryEntry | undefined): number {
  if (!e) return 0
  const first = e.status === 'watched' || !!e.watchedOn || !!e.seenBefore || (e.rewatches?.length ?? 0) > 0 ? 1 : 0
  return first + (e.rewatches ?? []).filter((r) => r.finishedOn).length
}

/** Marks it watched with no date: you saw it before Eclipse. */
export function markSeenBefore(library: Library, item: LibraryItem, now: Date = new Date()): Library {
  const lib = setStatus(library, item, 'watched', now)
  return changeEntry(
    lib,
    item.key,
    (e) => {
      const next: LibraryEntry = { ...e, seenBefore: true }
      delete next.watchedOn
      return next
    },
    now
  )
}

/** Starts watching it again. Films: watched again today (it's finished straight away). */
export function startRewatch(library: Library, item: LibraryItem, now: Date = new Date()): Library {
  const e = library.entries[item.key]
  if (currentRewatch(e)) return library
  const lib = e ? library : setStatus(library, item, 'watched', now)
  const day = localDate(now)
  return changeEntry(
    lib,
    item.key,
    (x) => ({ ...x, status: 'watched', rewatches: [...(x.rewatches ?? []), item.type === 'movie' ? { startedOn: day, finishedOn: day } : { startedOn: day }] }),
    now
  )
}

/** Finishes the rewatch you're on (today), or gives it up (`keep` false) as if it never started. */
export function endRewatch(library: Library, key: string, keep: boolean, now: Date = new Date()): Library {
  const r = currentRewatch(library.entries[key])
  if (!r) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const rest = (e.rewatches ?? []).filter((x) => x !== r)
      const rewatches = keep ? [...rest, { ...r, finishedOn: localDate(now) }] : rest
      const next: LibraryEntry = { ...e, rewatches }
      if (!rewatches.length) delete next.rewatches
      return next
    },
    now
  )
}

/** Takes one finished rewatch off (by its position), e.g. one added by mistake. */
export function removeRewatch(library: Library, key: string, index: number, now: Date = new Date()): Library {
  return changeEntry(
    library,
    key,
    (e) => {
      const rewatches = (e.rewatches ?? []).filter((_, i) => i !== index)
      const next: LibraryEntry = { ...e, rewatches }
      if (!rewatches.length) delete next.rewatches
      return next
    },
    now
  )
}

// ---- One-click "seen it" on list and watch-order rows ----

const isWatchSoonKey = (library: Library, key: string): boolean => (library.watchSoon ?? []).some((r) => r.key === key)

type Row = Pick<TitleRef, 'key' | 'type' | 'id' | 'name' | 'year' | 'posterPath' | 'season' | 'episodes'>

const seasonTicks = (e: LibraryEntry, season: number): [string, string][] => Object.entries(e.episodes ?? {}).filter(([k]) => parseEpisodeKey(k)?.season === season)

/** True when a row only counts as seen because of "seen before, no date" (so the tick can be undone safely). */
export function isRowSeenUndated(library: Library, ref: Row): boolean {
  const e = library.entries[ref.key]
  if (!e || e.rewatches?.length) return false
  const undatedWatch = e.status === 'watched' && !!e.seenBefore && !e.watchedOn
  if (!ref.season) return undatedWatch
  if (!ref.episodes || (e.status === 'watched' && !undatedWatch)) return false
  const ticks = seasonTicks(e, ref.season)
  if (ticks.length >= ref.episodes) return ticks.every(([, day]) => day === UNDATED)
  return undatedWatch && ticks.length === 0
}

/**
 * Ticks a list row as seen with no date: a film or whole show is marked "seen before", a season
 * row gets all its episodes ticked with no date. Off undoes only those undated marks.
 */
export function markRowSeen(library: Library, ref: Row, on: boolean, now: Date = new Date()): Library {
  if (ref.season && !ref.episodes) return library
  const item: LibraryItem = { key: ref.key, type: ref.type, id: ref.id, title: library.entries[ref.key]?.title ?? { name: ref.name, year: ref.year, posterPath: ref.posterPath } }
  const seasonKeys = ref.season && ref.episodes ? Array.from({ length: ref.episodes }, (_, i) => episodeKey(ref.season!, i + 1)) : null
  if (on) {
    if (seasonKeys) {
      const e = library.entries[ref.key]
      return setEpisodes(library, item, seasonKeys.filter((k) => !e?.episodes?.[k]), true, now, true)
    }
    return markSeenBefore(library, item, now)
  }
  if (!isRowSeenUndated(library, ref)) return library
  const e = library.entries[ref.key]
  const keep = (x: LibraryEntry): boolean => !!(x.note || x.from || x.rating !== undefined || Object.keys(x.episodes ?? {}).length || x.finishBy || x.rewatches?.length)
  if (seasonKeys) {
    // Take the season's ticks off. A show that was finished (seen before) is back to Watching;
    // if nothing's left, it comes off your library.
    let lib = setEpisodes(library, item, seasonKeys, false, now)
    if (e.status === 'watched') {
      lib = changeEntry(
        lib,
        ref.key,
        (x) => {
          const next: LibraryEntry = { ...x, status: 'watching' }
          delete next.seenBefore
          return next
        },
        now
      )
    }
    const after = lib.entries[ref.key]
    return after && after.status === 'watching' && !keep(after) && !isWatchSoonKey(lib, ref.key) ? setStatus(lib, item, null, now) : lib
  }
  // A film or show marked seen before: take it back off, unless there's more to keep.
  if (!keep(e)) return setStatus(library, item, null, now)
  return changeEntry(
    library,
    ref.key,
    (x) => {
      const next: LibraryEntry = { ...x, status: 'want' }
      delete next.seenBefore
      return next
    },
    now
  )
}

/**
 * A show you're "watching" only because you ticked seasons as seen before: once every episode
 * that's out is ticked, it's Watched (seen before if none of the ticks has a date, otherwise
 * watched on the latest one). Shows you're genuinely partway through or rewatching are left alone.
 */
export function settleSeenShows(library: Library, details: Record<string, Pick<TitleDetails, 'seasons' | 'nextEpisode'>>, today: string, now: Date = new Date()): Library {
  let lib = library
  for (const e of Object.values(library.entries)) {
    const d = details[e.key]
    if (e.type !== 'tv' || e.status !== 'watching' || !d || currentRewatch(e)) continue
    const ticks = e.episodes ?? {}
    if (!Object.values(ticks).includes(UNDATED)) continue
    const out = airedEpisodes(d, today)
    if (!out.length || !out.every((k) => ticks[k])) continue
    const dated = Object.values(ticks).filter((v) => v !== UNDATED).sort()
    lib = changeEntry(
      lib,
      e.key,
      (x) => {
        const next: LibraryEntry = { ...x, status: 'watched' }
        if (!next.watchedOn) {
          if (dated.length) next.watchedOn = dated[dated.length - 1]
          else next.seenBefore = true
        }
        return next
      },
      now
    )
  }
  return lib
}

/** Every regular episode that's out by today, by episodeKey. */
function airedEpisodes(d: Pick<TitleDetails, 'seasons' | 'nextEpisode'>, today: string): string[] {
  const next = d.nextEpisode
  const upcoming = next && (!next.airDate || next.airDate > today)
  const out: string[] = []
  for (const s of d.seasons) {
    if (s.number <= 0 || (s.airDate && s.airDate > today)) continue
    for (let n = 1; n <= s.episodeCount; n++) {
      if (upcoming && (s.number > next.season || (s.number === next.season && n >= next.episode))) continue
      out.push(episodeKey(s.number, n))
    }
  }
  return out
}

// ---- Watching with someone ----

/** Shows you're watching with someone, each with its place in the show's rewatches list. */
export function watchesWith(e: LibraryEntry | undefined): { index: number; watch: Rewatch & { with: string } }[] {
  return (e?.rewatches ?? []).map((watch, index) => ({ index, watch })).filter((x): x is { index: number; watch: Rewatch & { with: string } } => !x.watch.finishedOn && !!x.watch.with)
}

/** Everyone you've watched (or are watching) something with, most used first. */
export function companions(library: Library): string[] {
  const n = new Map<string, number>()
  for (const e of Object.values(library.entries)) for (const r of e.rewatches ?? []) if (r.with) n.set(r.with, (n.get(r.with) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
}

/** Starts watching a show with someone. Your own progress isn't touched; one watch per person at a time. */
export function startWatchWith(library: Library, item: LibraryItem, name: string, now: Date = new Date()): Library {
  const who = name.trim().slice(0, 60)
  if (!who) return library
  const e = library.entries[item.key]
  if (watchesWith(e).some((x) => x.watch.with.toLowerCase() === who.toLowerCase())) return library
  const lib = e ? library : setStatus(library, item, 'watching', now)
  return changeEntry(lib, item.key, (x) => ({ ...x, rewatches: [...(x.rewatches ?? []), { startedOn: localDate(now), with: who }] }), now)
}

/** Ticks (or unticks) episodes on a watch with someone, by its place in the list. */
export function tickWith(library: Library, key: string, index: number, keys: string[], watched: boolean, now: Date = new Date()): Library {
  const w = library.entries[key]?.rewatches?.[index]
  if (!w?.with || w.finishedOn) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const episodes = { ...(w.episodes ?? {}) }
      for (const k of keys) {
        if (!parseEpisodeKey(k)) continue
        if (watched) episodes[k] = episodes[k] ?? localDate(now)
        else delete episodes[k]
      }
      const next: Rewatch = { ...w, episodes }
      if (!Object.keys(episodes).length) delete next.episodes
      return { ...e, rewatches: (e.rewatches ?? []).map((x, i) => (i === index ? dropUnticked(next) : x)) }
    },
    now
  )
}

/** Sets (or clears, with null) the next time you've arranged to watch with someone. */
export function planWatchWith(library: Library, key: string, index: number, planned: PlannedTime | null, now: Date = new Date()): Library {
  const w = library.entries[key]?.rewatches?.[index]
  if (!w?.with || w.finishedOn) return library
  if (planned && !isPlannedAt(planned.at)) return library
  return changeEntry(
    library,
    key,
    (e) => ({
      ...e,
      rewatches: (e.rewatches ?? []).map((x, i) => {
        if (i !== index) return x
        const next: Rewatch = { ...x }
        if (planned) next.planned = { at: planned.at, ...(planned.weekly ? { weekly: true } : {}) }
        else delete next.planned
        return next
      })
    }),
    now
  )
}

/** How long a session counts as "on" after it starts, and how early Home starts showing it. */
export const SESSION_HOURS = 4
export const SESSION_LEAD_MINUTES = 90

const atDate = (at: string): Date => {
  const [d, t] = at.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return new Date(y, m - 1, day, h, mi)
}

/**
 * The next session of a watch with someone that hasn't finished yet (a weekly one rolls on to the
 * next week once a session is over). Null when nothing is arranged, or a one-off is past.
 */
export function nextSession(watch: Pick<Rewatch, 'planned' | 'finishedOn'>, now: Date): Date | null {
  if (!watch.planned || watch.finishedOn) return null
  const start = atDate(watch.planned.at)
  const over = (d: Date): boolean => d.getTime() + SESSION_HOURS * 3_600_000 < now.getTime()
  if (!watch.planned.weekly) return over(start) ? null : start
  const next = new Date(start)
  for (let i = 0; over(next) && i < 1000; i++) next.setDate(next.getDate() + 7)
  return next
}

/** True from a little before an arranged time until a few hours after it starts. */
export function sessionIsOn(watch: Pick<Rewatch, 'planned' | 'finishedOn'>, now: Date): boolean {
  const s = nextSession(watch, now)
  return !!s && now.getTime() >= s.getTime() - SESSION_LEAD_MINUTES * 60_000
}

/** Finishes a watch with someone (it counts), or drops it (`keep` false). */
export function endWatchWith(library: Library, key: string, index: number, keep: boolean, now: Date = new Date()): Library {
  const w = library.entries[key]?.rewatches?.[index]
  if (!w?.with || w.finishedOn) return library
  return changeEntry(
    library,
    key,
    (e) => {
      const rewatches = keep ? (e.rewatches ?? []).map((x, i) => (i === index ? { ...x, finishedOn: localDate(now) } : x)) : (e.rewatches ?? []).filter((_, i) => i !== index)
      const next: LibraryEntry = { ...e, rewatches }
      if (!rewatches.length) delete next.rewatches
      return next
    },
    now
  )
}

// ---- Clearing out the watchlist ----

const DROPPED_KEPT = 30

function normalizeDropped(raw: unknown): Dropped[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: Dropped[] = []
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue
    const x = d as Partial<Dropped>
    const key = (x.entry as LibraryEntry | undefined)?.key
    if (typeof key !== 'string' || typeof x.droppedAt !== 'string' || out.some((o) => o.entry.key === key)) continue
    const entry = normalizeLibrary({ version: 1, entries: { [key]: x.entry } }).entries[key]
    if (entry) out.push({ entry, droppedAt: x.droppedAt, ...(x.soon ? { soon: true } : {}) })
  }
  return out.length ? out.slice(0, DROPPED_KEPT) : undefined
}

/** Takes a title off your library, keeping it whole in "recently dropped" so it can come back. */
export function dropTitle(library: Library, key: string, now: Date = new Date()): Library {
  const entry = library.entries[key]
  if (!entry) return library
  const entries = { ...library.entries }
  delete entries[key]
  const soon = (library.watchSoon ?? []).some((r) => r.key === key)
  const dropped: Dropped[] = [{ entry, droppedAt: now.toISOString(), ...(soon ? { soon: true } : {}) }, ...(library.dropped ?? []).filter((d) => d.entry.key !== key)].slice(0, DROPPED_KEPT)
  const next: Library = { ...library, entries, dropped }
  if (soon) next.watchSoon = (library.watchSoon ?? []).filter((r) => r.key !== key)
  return next
}

/** Puts a dropped title back as it was (and back on Watch soon if it was there). */
export function restoreDropped(library: Library, key: string): Library {
  const d = (library.dropped ?? []).find((x) => x.entry.key === key)
  if (!d) return library
  const dropped = (library.dropped ?? []).filter((x) => x !== d)
  const next: Library = { ...library, entries: { ...library.entries, [key]: library.entries[key] ?? d.entry }, dropped }
  if (!dropped.length) delete next.dropped
  if (d.soon && !(library.watchSoon ?? []).some((r) => r.key === key)) next.watchSoon = [...(library.watchSoon ?? []), refOf(d.entry)]
  return next
}

/**
 * The watchlist in the order to go through it: oldest additions first, newest first, or the ones
 * not on your services first (then oldest). `onMine` says which are on your services.
 */
export function clearOutOrder(library: Library, order: 'oldest' | 'newest' | 'notMine', onMine: (key: string) => boolean | undefined): LibraryEntry[] {
  const want = Object.values(library.entries).filter((e) => e.status === 'want')
  const byAdded = (a: LibraryEntry, b: LibraryEntry): number => a.addedAt.localeCompare(b.addedAt) || a.key.localeCompare(b.key)
  if (order === 'newest') return want.sort((a, b) => byAdded(b, a))
  if (order === 'oldest') return want.sort(byAdded)
  return want.sort((a, b) => Number(onMine(a.key) === true) - Number(onMine(b.key) === true) || byAdded(a, b))
}

/** A show you're watching with someone, as Home sees it: that watch's progress, and who it's with. */
export type TogetherPick = LibraryEntry & { together: { who: string; index: number } }

export const isTogether = (e: LibraryEntry | null | undefined): e is TogetherPick => !!e && 'together' in e && !!(e as TogetherPick).together

const lastDay = (episodes: Record<string, string> | undefined): string | null => {
  let last: string | null = null
  for (const [k, day] of Object.entries(episodes ?? {})) if (parseEpisodeKey(k) && day !== UNDATED && (!last || day > last)) last = day
  return last
}

/**
 * Home's picks with your watches with someone mixed in: each one goes just before the first show
 * you're watching on your own that you last watched earlier, so what you're watching now comes first.
 */
export function withTogether(picks: LibraryEntry[], library: Library): LibraryEntry[] {
  const now = new Date()
  const views: TogetherPick[] = Object.values(library.entries)
    .filter((e) => e.type === 'tv')
    // Only around a time you've arranged: the rest of the time it's not something to pick tonight.
    .flatMap((e) => watchesWith(e).filter(({ watch }) => sessionIsOn(watch, now)).map(({ index, watch }) => ({ ...e, status: 'watching' as const, episodes: watch.episodes ?? {}, together: { who: watch.with, index } })))
  if (!views.length) return picks
  const when = (e: LibraryEntry): string => (isTogether(e) ? (lastDay(e.episodes) ?? e.rewatches![e.together.index].startedOn) : (lastDay(e.episodes) ?? e.updatedAt.slice(0, 10)))
  // A show you only watch with someone (no ticks of your own) shows up once, as the watch together.
  const together = new Set(views.map((v) => v.key))
  const out = picks.filter((p) => !together.has(p.key) || Object.keys(p.episodes ?? {}).length > 0)
  for (const v of views.sort((a, b) => when(b).localeCompare(when(a)))) {
    const at = out.findIndex((p) => p.status !== 'watching' || (!isTogether(p) && when(p) < when(v)))
    out.splice(at < 0 ? out.length : at, 0, v)
  }
  return out
}

/** Watches with someone starting within `minutes` from now: for "Watching … with Jack at 21:00" reminders. */
export function sessionsStartingSoon(library: Library, now: Date, minutes = 15): { id: string; key: string; name: string; who: string; at: Date }[] {
  const out: { id: string; key: string; name: string; who: string; at: Date }[] = []
  for (const e of Object.values(library.entries)) {
    for (const { index, watch } of watchesWith(e)) {
      const at = nextSession(watch, now)
      if (!at) continue
      const until = at.getTime() - now.getTime()
      if (until > 0 && until <= minutes * 60_000) out.push({ id: `${e.key}@${index}@${at.getTime()}`, key: e.key, name: e.title.name, who: watch.with, at })
    }
  }
  return out
}
