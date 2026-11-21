import { activeEntry, nextEpisodeFor, showProgress } from './library'
import type { Library, LibraryEntry, TitleDetails } from './types'
import { parseEpisodeKey } from './types'

/**
 * How a poster looks for where you are with it.
 *
 * Phase 63, "Posters that fill in as I go": a show you're part-way through shows its poster partly
 * in colour (filling from the bottom up, as far as you've got) and the rest in grey. Finished
 * shows, watched films and things not started look as they always did.
 *
 * Phase 66, "The poster for the season I'm on": a show you're watching uses the poster of the
 * season you're on, so it changes as you go. A poster you chose yourself (phase 55) always wins.
 */

/** What posters need to know about a show from TMDB. */
export type PosterDetails = Pick<TitleDetails, 'seasons'>

/** What a title's poster should show: how much of it is in colour, and the season poster to use. */
export interface PosterInfo {
  /** Between 0 and 1 while you're part-way through; null when the poster looks as usual. */
  fill: number | null
  /** The current season's TMDB poster, or null to use the title's own. */
  season: string | null
}

/** Shows whose posters can change: ones you're watching or stopped part-way through, or rewatching. */
export function posterKeys(library: Library): string[] {
  return Object.values(library.entries)
    .filter((e) => e.type === 'tv' && (e.status === 'watching' || e.status === 'stopped' || activeEntry(e) !== e))
    .map((e) => e.key)
}

/** The season you're on: the one your next episode is in, or the last one you ticked when you're through. */
export function currentSeason(entry: LibraryEntry, d: PosterDetails): number | null {
  const counts = d.seasons.map((s) => ({ number: s.number, episodeCount: s.episodeCount }))
  const next = nextEpisodeFor(entry, counts)
  if (next) return next.season
  let last: number | null = null
  for (const k of Object.keys(entry.episodes ?? {})) {
    const p = parseEpisodeKey(k)
    if (p && p.season > 0 && (last === null || p.season > last)) last = p.season
  }
  return last
}

export function posterInfo(entry: LibraryEntry | undefined, d: PosterDetails | undefined): PosterInfo {
  const none: PosterInfo = { fill: null, season: null }
  if (!entry || entry.type !== 'tv' || !d) return none
  const view = activeEntry(entry)!
  const going = view.status === 'watching' || view.status === 'stopped'
  if (!going) return none
  const { watched, total } = showProgress(view, d.seasons)
  const fill = total > 0 && watched > 0 && watched < total ? watched / total : null
  // Only once you've started: a show added as Watching with nothing ticked keeps its own poster.
  const n = watched > 0 && view.status === 'watching' ? currentSeason(view, d) : null
  const season = n === null ? null : (d.seasons.find((s) => s.number === n)?.posterPath ?? null)
  return { fill, season }
}

/** Every changeable poster in the library, by title key (titles that look as usual are left out). */
export function posterInfos(library: Library, details: Record<string, PosterDetails | undefined>): Record<string, PosterInfo> {
  const out: Record<string, PosterInfo> = {}
  for (const key of posterKeys(library)) {
    const info = posterInfo(library.entries[key], details[key])
    if (info.fill !== null || info.season) out[key] = info
  }
  return out
}

/** The poster to show: the one you chose, else the season you're on, else the given one (TMDB's default). */
export function shownPoster<T extends string | null | undefined>(library: Library, key: string, fallback: T, info?: PosterInfo): string | T {
  return library.posters?.[key] ?? info?.season ?? fallback
}
