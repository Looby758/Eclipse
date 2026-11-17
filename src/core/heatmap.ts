import type { LibraryEntry, SeasonDetails } from './types'
import { episodeKey } from './types'
import { nextEpisodeFor } from './library'

/**
 * "Does it get good?": a show's episodes as a grid, one row per season, coloured by TMDB rating.
 * Specials are left out. Episodes with too few votes to trust are greyed out, and titles past
 * where you've got to are hidden (ratings still show).
 */

/** Fewer votes than this and a rating isn't trusted (greyed out, left out of averages and colours). */
export const MIN_VOTES = 20

export interface HeatCell {
  season: number
  episode: number
  /** Null when there's no rating yet (not aired, or no votes). */
  rating: number | null
  votes: number
  trusted: boolean
  aired: boolean
  watched: boolean
  /** Your next episode: where you are in the show. */
  next: boolean
  /** Past where you've got to: the title stays hidden. */
  spoiler: boolean
  title: string
}

export interface HeatRow {
  season: number
  cells: HeatCell[]
  /** Average of the trusted ratings, or null if there aren't any. */
  average: number | null
}

export interface Heatmap {
  rows: HeatRow[]
  /** The rating range the colours stretch across (at least 1.5 wide, so a steady show doesn't look wild). */
  low: number
  high: number
  best: HeatCell | null
  worst: HeatCell | null
}

export function buildHeatmap(seasons: SeasonDetails[], entry: LibraryEntry | undefined, today: string, minVotes = MIN_VOTES): Heatmap {
  const regular = seasons.filter((s) => s.number > 0).sort((a, b) => a.number - b.number)
  const next = entry ? nextEpisodeFor(entry, regular.map((s) => ({ number: s.number, episodeCount: s.episodes.length }))) : null
  const seen = entry?.episodes ?? {}
  // Spoilers only matter once you're tracking it; before that every title shows.
  const past = (s: number, e: number): boolean => !!entry && !!next && (s > next.season || (s === next.season && e > next.episode))

  const trusted: HeatCell[] = []
  const rows = regular.map((s) => {
    const cells = s.episodes.map((ep) => {
      const aired = !!ep.airDate && ep.airDate <= today
      const rating = aired && ep.voteCount > 0 && ep.voteAverage ? Math.round(ep.voteAverage * 10) / 10 : null
      const cell: HeatCell = {
        season: s.number,
        episode: ep.number,
        rating,
        votes: ep.voteCount,
        trusted: rating !== null && ep.voteCount >= minVotes,
        aired,
        watched: !!seen[episodeKey(s.number, ep.number)],
        next: !!next && next.season === s.number && next.episode === ep.number,
        spoiler: past(s.number, ep.number) && !seen[episodeKey(s.number, ep.number)],
        title: ep.name
      }
      if (cell.trusted) trusted.push(cell)
      return cell
    })
    const rated = cells.filter((c) => c.trusted)
    const average = rated.length ? Math.round((rated.reduce((n, c) => n + c.rating!, 0) / rated.length) * 10) / 10 : null
    return { season: s.number, cells, average }
  })

  let low = Math.min(...trusted.map((c) => c.rating!))
  let high = Math.max(...trusted.map((c) => c.rating!))
  if (!trusted.length) {
    low = 7
    high = 9
  } else if (high - low < 1.5) {
    const mid = (high + low) / 2
    low = mid - 0.75
    high = mid + 0.75
  }
  const best = trusted.reduce<HeatCell | null>((b, c) => (!b || c.rating! > b.rating! ? c : b), null)
  const worst = trusted.reduce<HeatCell | null>((w, c) => (!w || c.rating! < w.rating! ? c : w), null)
  return { rows, low, high, best, worst }
}

/**
 * A rating's colour, from deep pink-violet (the show's low) through violet to bright cyan (its
 * high). Cool colours only, to match the app.
 */
export function heatColour(rating: number, low: number, high: number): { h: number; s: number; l: number } {
  const t = Math.min(1, Math.max(0, (rating - low) / (high - low || 1)))
  return { h: Math.round(330 - t * 140), s: 85, l: Math.round(34 + t * 26) }
}
