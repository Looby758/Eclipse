import type { Library, LibraryEntry, TitleDetails, TitleKey } from './types'
import { episodeIsOut } from './library'
import { timeLeft } from './time'

/**
 * New season announced: when a show you've caught up on (finished, or watched everything that's out)
 * gets another season on TMDB, Home says so once, with its date if there is one. "Got it" puts it
 * away for good; once the season is out, the premiere and "Back after a break" take over. A show
 * that's cancelled after the announcement drops off.
 */

/** How many at once, so a first look doesn't crowd Home. */
export const ANNOUNCED_MAX = 3

export interface AnnouncedSeason {
  /** "tv:1234@S4": what "Got it" remembers. */
  id: string
  key: TitleKey
  tvId: number
  name: string
  posterPath: string | null
  season: number
  /** The first episode's day, or null when it's announced without one. */
  date: string | null
}

export const ANNOUNCED_ID = /^tv:\d+@S\d+$/

const caughtUp = (e: LibraryEntry, d: TitleDetails, today: string): boolean => {
  if (e.status === 'watched') return true
  if (e.status !== 'watching' || !Object.keys(e.episodes ?? {}).length) return false
  return timeLeft(d, e, today).episodes === 0
}

/** The first season that isn't out yet at all, with its day (null when there isn't one yet). */
export function seasonComing(d: TitleDetails, today: string): { season: number; date: string | null } | null {
  const next = d.nextEpisode
  const dayOf = (n: number): string | null => (next && next.season === n && next.episode === 1 && next.airDate ? next.airDate : (d.seasons.find((s) => s.number === n)?.airDate ?? null))
  const coming = d.seasons
    .filter((s) => s.number > 0 && !episodeIsOut(d, today, s.number, 1))
    .sort((a, b) => a.number - b.number)[0]
  if (coming) return { season: coming.number, date: dayOf(coming.number) }
  // TMDB sometimes knows the next episode before it lists the season.
  if (next && next.episode === 1 && !d.seasons.some((s) => s.number === next.season) && (!next.airDate || next.airDate > today)) return { season: next.season, date: next.airDate }
  return null
}

/** Shows you're caught up on with a season announced that you haven't said "Got it" to, soonest first (undated last). */
export function announcedSeasons(library: Library, details: Record<string, TitleDetails | undefined>, today: string): AnnouncedSeason[] {
  const seen = new Set(library.announcedSeen ?? [])
  const out: AnnouncedSeason[] = []
  for (const e of Object.values(library.entries)) {
    const d = details[e.key]
    if (e.type !== 'tv' || !d || !caughtUp(e, d, today)) continue
    // Cancelled (or ended) after it was announced: TMDB can keep the season listed, but it isn't coming.
    if (d.status === 'Canceled' || d.status === 'Ended') continue
    const coming = seasonComing(d, today)
    if (!coming) continue
    // A season you've already ticked some of (a hand tick ahead of TMDB) isn't news.
    if (Object.keys(e.episodes ?? {}).some((k) => k.startsWith(`S${coming.season}E`))) continue
    const id = `${e.key}@S${coming.season}`
    if (seen.has(id)) continue
    out.push({ id, key: e.key, tvId: e.id, name: e.title.name || d.name, posterPath: e.title.posterPath ?? d.posterPath, season: coming.season, date: coming.date })
  }
  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.name.localeCompare(b.name))
}

/** Which shows to check: ones you've finished or are watching (not stopped). */
export function announcedCandidates(library: Library): string[] {
  return Object.values(library.entries)
    .filter((e) => e.type === 'tv' && (e.status === 'watched' || e.status === 'watching'))
    .map((e) => e.key)
}

/** "Got it": this season's news has been seen. */
export function markAnnouncedSeen(library: Library, id: string): Library {
  if (!ANNOUNCED_ID.test(id)) return library
  return { ...library, announcedSeen: [...new Set([...(library.announcedSeen ?? []), id])].slice(-500) }
}
