import type { Library, LibraryEntry } from './types'
import { episodeKey, parseEpisodeKey } from './types'
import type { SeasonCounts } from './library'

/**
 * Phase 54: sound design. A soft click when you tick an episode and a richer chime when a tick
 * finishes a season. Finishing a whole show has its own send-off (phase 46), so it gets the click
 * but not the season chime. Nothing low or rumbling, and no theme tunes (those play only in the
 * send-off).
 *
 * Plain data only: which shows just got ticks today (ticksToday), and which seasons those ticks
 * finished (seasonsFinished). The renderer makes the sounds.
 */

/** A watch's ticks: your first time through, or one rewatch (or watch with someone). */
const watchTicks = (e: LibraryEntry | undefined): Record<string, string>[] =>
  e ? [e.episodes ?? {}, ...(e.rewatches ?? []).map((r) => r.episodes ?? {})] : []

/**
 * Shows that gained at least one episode tick dated today between two versions of the library.
 * Ticks marked as seen before (no date), old ticks a sync brings in, and unticking never count.
 */
export function ticksToday(before: Library, after: Library, today: string): string[] {
  const out: string[] = []
  for (const e of Object.values(after.entries)) {
    if (e.type !== 'tv') continue
    const prev = watchTicks(before.entries[e.key])
    const now = watchTicks(e)
    const added = now.some((ticks, i) => Object.entries(ticks).some(([k, day]) => day === today && !prev[i]?.[k]))
    if (added) out.push(e.key)
  }
  return out
}

/** Whether every episode of a regular season is ticked in this watch. */
const seasonDone = (ticks: Record<string, string>, season: number, count: number): boolean => {
  if (count <= 0) return false
  for (let n = 1; n <= count; n++) if (!ticks[episodeKey(season, n)]) return false
  return true
}

/**
 * Seasons (regular ones, not specials) that a tick dated today has just finished, in any watch:
 * complete now, not complete before, and at least one of the season's new ticks is from today.
 */
export function seasonsFinished(before: LibraryEntry | undefined, after: LibraryEntry | undefined, seasons: SeasonCounts, today: string): number[] {
  const prev = watchTicks(before)
  const out = new Set<number>()
  watchTicks(after).forEach((ticks, i) => {
    const was = prev[i] ?? {}
    for (const s of seasons) {
      if (s.number <= 0 || out.has(s.number)) continue
      if (!seasonDone(ticks, s.number, s.episodeCount) || seasonDone(was, s.number, s.episodeCount)) continue
      const freshToday = Object.entries(ticks).some(([k, day]) => day === today && !was[k] && parseEpisodeKey(k)?.season === s.number)
      if (freshToday) out.add(s.number)
    }
  })
  return [...out].sort((a, b) => a - b)
}
