import type { Library, LibraryEntry } from './types'
import { STATUS_LABELS, UNDATED, parseEpisodeKey } from './types'
import { tmdbPageUrl } from './tmdb'
import { watchCount } from './library'

/**
 * Export everything: your library file as it is (JSON, which Eclipse can read back), plus CSV
 * spreadsheets of your titles, episodes, rewatches and lists for Excel or Google Sheets.
 */

export interface ExportFile {
  name: string
  text: string
}

/** One CSV cell: quoted when it needs to be, with spreadsheet formulas defused. */
function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'boolean' ? (v ? 'yes' : '') : String(v)
  // A note starting with "=" (or + - @) would run as a formula in Excel.
  if (/^[=+\-@]/.test(s) && typeof v === 'string') s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** A CSV file: a byte-order mark so Excel reads it as UTF-8, and Windows line endings. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

const day = (v: string | undefined): string => (!v ? '' : v === UNDATED ? 'seen before (no date)' : v)
const byName = (a: LibraryEntry, b: LibraryEntry): number => a.title.name.localeCompare(b.title.name) || a.key.localeCompare(b.key)

export function titlesCsv(library: Library): string {
  const rows: (string | number | boolean | null | undefined)[][] = [
    ['Title', 'Year', 'Type', 'Status', 'Watched on', 'Seen before (no date)', 'Times watched', 'Episodes ticked', 'Your rating', 'Note', 'From', 'Finish by', 'Added', 'TMDB id', 'TMDB page']
  ]
  for (const e of Object.values(library.entries).sort(byName)) {
    rows.push([
      e.title.name,
      e.title.year,
      e.type === 'movie' ? 'Film' : 'Show',
      STATUS_LABELS[e.status],
      e.watchedOn,
      e.seenBefore,
      watchCount(e) || '',
      e.type === 'tv' ? Object.keys(e.episodes ?? {}).length : '',
      e.rating,
      e.note,
      e.from,
      e.finishBy,
      e.addedAt.slice(0, 10),
      e.id,
      tmdbPageUrl(e.type, e.id)
    ])
  }
  return toCsv(rows)
}

/** Every episode you've ticked, first watch and rewatches, in order. */
export function episodesCsv(library: Library): string {
  const rows: (string | number | null | undefined)[][] = [['Show', 'Season', 'Episode', 'Watched on', 'Watch']]
  const order = (ticks: Record<string, string>): [number, number, string][] =>
    Object.entries(ticks)
      .map(([k, v]) => ({ ep: parseEpisodeKey(k), v }))
      .filter((x) => x.ep)
      .map((x) => [x.ep!.season, x.ep!.episode, x.v] as [number, number, string])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  for (const e of Object.values(library.entries).filter((x) => x.type === 'tv').sort(byName)) {
    for (const [s, n, v] of order(e.episodes ?? {})) rows.push([e.title.name, s, n, day(v), 'First watch'])
    ;(e.rewatches ?? []).forEach((r, i) => {
      for (const [s, n, v] of order(r.episodes ?? {})) rows.push([e.title.name, s, n, day(v), r.with ? `With ${r.with}` : `Rewatch ${i + 1}`])
    })
  }
  return toCsv(rows)
}

export function rewatchesCsv(library: Library): string {
  const rows: (string | number | null | undefined)[][] = [['Title', 'Type', 'Rewatch', 'Started', 'Finished', 'With']]
  for (const e of Object.values(library.entries).sort(byName)) {
    ;(e.rewatches ?? []).forEach((r, i) => rows.push([e.title.name, e.type === 'movie' ? 'Film' : 'Show', i + 1, r.startedOn, r.finishedOn ?? 'still going', r.with]))
  }
  return toCsv(rows)
}

/** Your own lists with their titles, Watch soon, and the lists you follow (their titles come from TMDB). */
export function listsCsv(library: Library): string {
  const rows: (string | number | null | undefined)[][] = [['List', 'Kind', 'Position', 'Title', 'Year', 'Type', 'Season']]
  ;(library.watchSoon ?? []).forEach((r, i) => rows.push(['Watch soon', 'Watch soon', i + 1, r.name, r.year, r.type === 'movie' ? 'Film' : 'Show', '']))
  for (const l of library.lists ?? []) {
    if (l.items) l.items.forEach((r, i) => rows.push([l.name, 'Your list', i + 1, r.name, r.year, r.type === 'movie' ? 'Film' : 'Show', r.season]))
    else rows.push([l.name, KIND[l.source.kind] ?? l.source.kind, '', '', '', '', ''])
  }
  return toCsv(rows)
}

const KIND: Record<string, string> = { person: 'Person (followed)', collection: 'Film series (followed)', tmdbList: 'TMDB list (followed)', guide: 'Watch order (followed)', custom: 'Your list' }

export function exportFiles(library: Library): ExportFile[] {
  return [
    { name: 'library.json', text: JSON.stringify(library, null, 2) + '\n' },
    { name: 'titles.csv', text: titlesCsv(library) },
    { name: 'episodes.csv', text: episodesCsv(library) },
    { name: 'rewatches.csv', text: rewatchesCsv(library) },
    { name: 'lists.csv', text: listsCsv(library) },
    { name: 'README.txt', text: README }
  ]
}

const README = `Your Eclipse data
=================

library.json   Everything, exactly as Eclipse saves it. Eclipse can open it again: put it in a
               folder and choose that folder in Settings > Data folder.
titles.csv     Every film and show in your library, with status, dates, ratings and notes.
episodes.csv   Every episode you've ticked, including rewatches.
rewatches.csv  Each time you watched something again.
lists.csv      Watch soon, your own lists with their titles, and the lists you follow.

The CSV files open in Excel, Numbers or Google Sheets.
Film and TV data from TMDB (themoviedb.org). Eclipse uses the TMDB API but is not endorsed or certified by TMDB.
`
