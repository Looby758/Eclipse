import type { Library, LibraryEntry, MediaType, TitleDetails, TitleKey } from './types'
import { UNDATED } from './types'

/**
 * The shelf: a box set for everything you've finished, and (phase 59) the seasons and films you're
 * waiting for, shrink-wrapped with their date. On release day the wrap comes off; a week later the
 * box leaves "Coming soon".
 */

/** How long a released box stays on "Coming soon", unwrapped, before it leaves. */
export const OUT_FOR_DAYS = 7

export interface ComingSoon {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  posterPath: string | null
  /** Shows: the season coming. */
  season: number | null
  /** The UK release day (cinemas first for films), YYYY-MM-DD, or null when it's announced with no date yet. */
  date: string | null
  /** "Season 5", "In cinemas" or "Film". */
  label: string
  /** Released today or in the last week: the wrap is off. */
  out: boolean
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Which titles might have something coming: shows you've started or finished (not stopped), and films on your watchlist. */
export function comingSoonCandidates(library: Library): string[] {
  return Object.values(library.entries)
    .filter((e) => (e.type === 'tv' ? e.status === 'watching' || e.status === 'watched' : e.status === 'want'))
    .map((e) => e.key)
}

/** A film's release day in your country: in cinemas if TMDB knows it, otherwise its first release there, otherwise anywhere. */
export function filmRelease(d: TitleDetails, region: string): { date: string | null; cinema: boolean } {
  const r = d.releases?.[region]
  if (r?.cinema) return { date: r.cinema, cinema: true }
  if (r?.any) return { date: r.any, cinema: false }
  return { date: d.date, cinema: false }
}

/**
 * Announced seasons and films you're waiting for, soonest first (undated ones last). A show gives
 * its next season that hasn't started (or started in the last week); a film on your watchlist
 * gives itself while it's not out (or came out in the last week).
 */
export function comingSoon(library: Library, details: Record<string, TitleDetails>, today: string, region = 'GB'): ComingSoon[] {
  const recent = addDays(today, -OUT_FOR_DAYS)
  const out: ComingSoon[] = []
  for (const key of comingSoonCandidates(library)) {
    const d = details[key]
    const e = library.entries[key]
    if (!d || !e) continue
    const base = { key: d.key, type: d.type, id: d.id, name: d.name, posterPath: e.title.posterPath ?? d.posterPath }
    if (d.type === 'movie') {
      const { date, cinema } = filmRelease(d, region)
      if (date && date < recent) continue
      if (!date && d.status === 'Released') continue
      out.push({ ...base, season: null, date, label: cinema ? 'In cinemas' : 'Film', out: !!date && date <= today })
      continue
    }
    const next = nextSeason(d, e, recent)
    if (next) out.push({ ...base, season: next.season, date: next.date, label: `Season ${next.season}`, out: !!next.date && next.date <= today })
  }
  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.name.localeCompare(b.name))
}

/** A show's next season you're waiting for: the first one after what's out that hasn't started, or started in the last week. */
function nextSeason(d: TitleDetails, e: LibraryEntry, recent: string): { season: number; date: string | null } | null {
  if (d.status === 'Ended' || d.status === 'Canceled') return null
  const ticked = Object.keys(e.episodes ?? {}).map((k) => Number(/^S(\d+)E/.exec(k)?.[1] ?? 0))
  const furthest = Math.max(0, ...ticked)
  for (const s of [...d.seasons].filter((x) => x.number > 0).sort((a, b) => a.number - b.number)) {
    // Seasons you've started aren't "coming": you're in them already.
    if (s.number <= furthest) continue
    const date = d.nextEpisode && d.nextEpisode.season === s.number && d.nextEpisode.episode === 1 ? (d.nextEpisode.airDate ?? s.airDate) : s.airDate
    if (date && date < recent) continue
    if (!date && s.episodeCount > 0 && d.nextEpisode?.season !== s.number) continue
    return { season: s.number, date }
  }
  // TMDB sometimes knows the next episode before it lists the season.
  if (d.nextEpisode && d.nextEpisode.episode === 1 && d.nextEpisode.season > furthest && !d.seasons.some((s) => s.number === d.nextEpisode!.season)) {
    const date = d.nextEpisode.airDate
    if (!date || date >= recent) return { season: d.nextEpisode.season, date }
  }
  return null
}

/** One box set on the shelf of everything you've finished. */
export interface FinishedBox {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  year: number | null
  posterPath: string | null
  /** The day you finished it (the last tick for a show), or null when it was seen before Eclipse. */
  finishedOn: string | null
}

/** Everything you've finished, most recently finished first (ones with no date last, A to Z). */
export function finishedShelf(library: Library): FinishedBox[] {
  return Object.values(library.entries)
    .filter((e) => e.status === 'watched' || (e.rewatches ?? []).some((r) => r.finishedOn && !r.with))
    .map((e) => {
      const days = Object.values(e.episodes ?? {}).filter((v) => v !== UNDATED)
      const last = e.type === 'tv' && days.length ? days.reduce((a, b) => (a > b ? a : b)) : null
      return { key: e.key, type: e.type, id: e.id, name: e.title.name, year: e.title.year, posterPath: e.title.posterPath, finishedOn: e.watchedOn ?? last }
    })
    .sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? '') || a.name.localeCompare(b.name))
}
