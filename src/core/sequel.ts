import type { Library, LibraryEntry, MediaType, TitleKey, WatchStatus } from './types'
import { episodeKey, titleKey } from './types'
import { localDate } from './library'
import { addToListNamed, refOf } from './lists'

/**
 * Bringing your library over from Sequel (the iPhone app). Sequel exports a zip with a
 * Library.csv: one row per film, show, book or game, plus one row per watched episode.
 * This file reads that CSV and merges it into an Eclipse library. Books and games are skipped.
 */

/** Reads CSV text into rows of cells. Handles quoted cells with commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Splits a multi-value cell like "Marvel, Star Wars" (Sequel writes "\," for a comma inside a name). */
export function splitList(cell: string): string[] {
  return cell
    .split(/(?<!\\),/)
    .map((s) => s.replace(/\\,/g, ',').trim())
    .filter(Boolean)
}

/** Sequel's times are UTC "YYYY-MM-DD HH:MM:SS". Returns a Date, or null if it isn't one. */
function sequelTime(s: string | undefined): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec((s ?? '').trim())
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** One film or show from the export, ready to merge. */
export interface SequelItem {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  year: number | null
  posterPath: string | null
  status: WatchStatus
  addedAt: string | null
  watchedOn: string | null
  /** Out of 10. */
  rating: number | null
  note: string | null
  lists: string[]
  /** Shows only: episodeKey → the local day you watched it. */
  episodes: Record<string, string>
}

export interface SequelImport {
  items: SequelItem[]
  /** Books, audiobooks and games, which Eclipse doesn't track. */
  skippedOther: number
  /** Films and shows without a TMDB id (added by hand in Sequel), so Eclipse can't look them up. */
  skippedNoId: string[]
  /** Episode rows whose show wasn't found in the export. */
  orphanEpisodes: number
}

const STATUS: Record<string, WatchStatus> = {
  Wishlist: 'want',
  Library: 'want',
  Ongoing: 'watching',
  Completed: 'watched',
  Abandoned: 'stopped'
}

/** Reads Sequel's Library.csv. `toDay` turns UTC times into your local days (tests pass a fixed one). */
export function readSequelCsv(text: string, toDay: (d: Date) => string = localDate): SequelImport {
  const [header, ...rows] = parseCsv(text)
  const result: SequelImport = { items: [], skippedOther: 0, skippedNoId: [], orphanEpisodes: 0 }
  if (!header) return result
  const col = (name: string): number => header.findIndex((h) => h.trim() === name)
  const idx = {
    type: col('Media Type'),
    title: col('Title'),
    season: col('Season'),
    episode: col('Episode'),
    year: col('Release Year'),
    status: col('Status'),
    rating: col('Rating'),
    added: col('Date Added'),
    completed: col('Date Completed'),
    notes: col('Notes'),
    collections: col('Collections'),
    cover: col('Cover'),
    tmdb: col('TMDB ID'),
    sequelId: col('Sequel ID'),
    showId: col('Show ID')
  }
  if (idx.type < 0 || idx.tmdb < 0) throw new Error("This doesn't look like Sequel's Library.csv.")
  const get = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '')

  const bySequelId = new Map<string, SequelItem>()
  const episodeRows: string[][] = []
  for (const r of rows) {
    const kind = get(r, idx.type)
    if (kind === 'Episode') {
      episodeRows.push(r)
      continue
    }
    if (kind !== 'Movie' && kind !== 'Series') {
      result.skippedOther++
      continue
    }
    const id = Number(get(r, idx.tmdb))
    if (!Number.isInteger(id) || id <= 0) {
      result.skippedNoId.push(get(r, idx.title) || 'Untitled')
      continue
    }
    const type: MediaType = kind === 'Movie' ? 'movie' : 'tv'
    const rating = Number(get(r, idx.rating))
    const year = Number(get(r, idx.year))
    const cover = /image\.tmdb\.org\/t\/p\/[^/]+(\/[^/?#]+)$/.exec(get(r, idx.cover))
    const added = sequelTime(get(r, idx.added))
    const done = sequelTime(get(r, idx.completed))
    const status = STATUS[get(r, idx.status)] ?? 'want'
    const item: SequelItem = {
      key: titleKey(type, id),
      type,
      id,
      name: get(r, idx.title) || 'Untitled',
      year: Number.isInteger(year) && year > 0 ? year : null,
      posterPath: cover ? cover[1] : null,
      status,
      addedAt: added ? added.toISOString() : null,
      watchedOn: done && status === 'watched' ? toDay(done) : null,
      rating: get(r, idx.rating) && rating > 0 && rating <= 5 ? rating * 2 : null,
      note: get(r, idx.notes).replace(/\s+/g, ' ').trim().slice(0, 300) || null,
      lists: splitList(get(r, idx.collections)),
      episodes: {}
    }
    result.items.push(item)
    const sid = get(r, idx.sequelId)
    if (sid) bySequelId.set(sid, item)
  }

  for (const r of episodeRows) {
    const show = bySequelId.get(get(r, idx.showId))
    const season = Number(get(r, idx.season))
    const episode = Number(get(r, idx.episode))
    if (!show || show.type !== 'tv' || !Number.isInteger(season) || !Number.isInteger(episode) || season < 0 || episode < 1) {
      result.orphanEpisodes++
      continue
    }
    const when = sequelTime(get(r, idx.completed)) ?? sequelTime(get(r, idx.added))
    const day = when ? toDay(when) : show.addedAt ? toDay(new Date(show.addedAt)) : toDay(new Date())
    const k = episodeKey(season, episode)
    if (!show.episodes[k] || day < show.episodes[k]) show.episodes[k] = day
  }

  // On your wishlist in Sequel but you've started it: that's Watching here.
  for (const item of result.items) {
    if (item.type === 'tv' && item.status === 'want' && Object.keys(item.episodes).length) item.status = 'watching'
  }
  return result
}

export interface ImportSummary {
  films: number
  shows: number
  episodes: number
  ratings: number
  notes: number
  /** How many are new to Eclipse (the rest are already in your library and get merged). */
  added: number
  merged: number
  byStatus: Record<WatchStatus, number>
  lists: Record<string, number>
  skippedOther: number
  skippedNoId: string[]
}

export function summarizeImport(data: SequelImport, library: Library): ImportSummary {
  const s: ImportSummary = {
    films: 0,
    shows: 0,
    episodes: 0,
    ratings: 0,
    notes: 0,
    added: 0,
    merged: 0,
    byStatus: { want: 0, watching: 0, watched: 0, stopped: 0 },
    lists: {},
    skippedOther: data.skippedOther,
    skippedNoId: data.skippedNoId
  }
  for (const item of data.items) {
    if (item.type === 'movie') s.films++
    else s.shows++
    s.episodes += Object.keys(item.episodes).length
    if (item.rating !== null) s.ratings++
    if (item.note) s.notes++
    if (library.entries[item.key]) s.merged++
    else s.added++
    s.byStatus[item.status]++
    for (const l of item.lists) s.lists[l] = (s.lists[l] ?? 0) + 1
  }
  return s
}

/**
 * Merges an import into your library. Anything already in Eclipse keeps its status, dates, note
 * and rating (Sequel only fills gaps); episodes from both are combined, keeping the earlier day.
 * Running it twice changes nothing the second time.
 */
export function mergeSequel(library: Library, data: SequelImport, now: Date = new Date()): Library {
  const entries = { ...library.entries }
  const stamp = now.toISOString()
  for (const item of data.items) {
    const old = entries[item.key]
    if (!old) {
      const entry: LibraryEntry = {
        key: item.key,
        type: item.type,
        id: item.id,
        status: item.status,
        addedAt: item.addedAt ?? stamp,
        updatedAt: item.addedAt ?? stamp,
        title: { name: item.name, year: item.year, posterPath: item.posterPath }
      }
      if (item.watchedOn) entry.watchedOn = item.watchedOn
      if (item.rating !== null) entry.rating = item.rating
      if (item.note) entry.note = item.note
      if (Object.keys(item.episodes).length) entry.episodes = { ...item.episodes }
      entries[item.key] = entry
      continue
    }
    const next: LibraryEntry = { ...old }
    let changed = false
    if (!next.watchedOn && item.watchedOn) {
      next.watchedOn = item.watchedOn
      changed = true
    }
    if (next.rating === undefined && item.rating !== null) {
      next.rating = item.rating
      changed = true
    }
    if (!next.note && item.note) {
      next.note = item.note
      changed = true
    }
    const episodes = { ...(old.episodes ?? {}) }
    for (const [k, day] of Object.entries(item.episodes)) {
      if (!episodes[k] || day < episodes[k]) {
        episodes[k] = day
        changed = true
      }
    }
    if (Object.keys(episodes).length) next.episodes = episodes
    if (!next.title.posterPath && item.posterPath) next.title = { ...next.title, posterPath: item.posterPath }
    if (changed) next.updatedAt = stamp
    entries[item.key] = next
  }
  // Sequel's collections become your own lists (adding to one with the same name if you have it).
  let lib: Library = { ...library, entries }
  const byList = new Map<string, string[]>()
  for (const item of data.items) for (const l of item.lists) byList.set(l, [...(byList.get(l) ?? []), item.key])
  for (const [name, keys] of byList) lib = addToListNamed(lib, name, keys.map((k) => refOf(entries[k])), now)
  return lib
}
