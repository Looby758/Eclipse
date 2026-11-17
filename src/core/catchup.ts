import { localDate } from './library'
import { lastTicked } from './nudges'
import { DEFAULT_EPISODE_MINUTES, dayBefore, eveningMinutes, fitTonight, mostAnEvening, nightsBetween, nextPremiere, planFor, tonight, type Evenings } from './time'
import { parseEpisodeKey, UNDATED, type CollectionDetails, type Library, type LibraryEntry, type MediaType, type TitleDetails, type TitleRef } from './types'

/**
 * Catch up before the sequel: when the next film in a series you've seen, or a new season of a
 * show you've seen, is coming out soon, find evenings before then to rewatch what comes before
 * it. "Dune: Part Three is in cinemas on Fri 18 Dec. Part Two is 2h 46m. It fits Sat 12 Dec."
 */

export interface CatchUp {
  /** "movie:438631>movie:1170608" or "tv:94997@S2>tv:94997@S3": what "Not now" remembers. */
  id: string
  kind: 'film' | 'season'
  /** What's coming out. */
  upcoming: { key: string; name: string; date: string; season?: number; cinema: boolean }
  /** What to rewatch first. */
  rewatch: TitleRef & { minutes: number }
  /** Shows: rewatch from this episode of the season (1 for all of it). */
  fromEpisode?: number
  /** Shows: episodes in the rewatch, and how many to watch a night. */
  episodes?: number
  perNight?: number
  /** Only the last few episodes fit before it starts. */
  partial: boolean
  /** The evenings suggested, oldest first. */
  nights: string[]
  /** It's longer than your usual evening: it runs past bedtime. */
  late: boolean
  /** When you last watched it (null when it was ticked with no date). */
  lastWatched: string | null
}

export interface CatchUpInput {
  library: Library
  /** Details of your films and shows, and of upcoming films in their series, by title key. */
  details: Record<string, TitleDetails>
  /** The series (TMDB collections) your films belong to, by collection id. */
  collections: Record<number, CollectionDetails>
  now: Date
  evenings: Evenings
  region: string
  /** How far ahead to look, in days. */
  aheadDays?: number
  /** Skip anything you watched within this many days (0 never skips). */
  skipDays?: number
}

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** When a film comes out where you live, and whether that's in cinemas. */
export function releaseIn(d: TitleDetails | undefined, fallback: string | null | undefined, region: string): { date: string; cinema: boolean } | null {
  const r = d?.releases?.[region]
  if (r?.cinema) return { date: r.cinema, cinema: true }
  if (r?.any) return { date: r.any, cinema: false }
  const date = d?.date ?? fallback
  return date ? { date, cinema: false } : null
}

/** The last time you finished a film: its watched day, or the end of a rewatch. */
function filmWatched(e: LibraryEntry): { seen: boolean; last: string | null } {
  const days = [e.watchedOn && e.watchedOn !== UNDATED ? e.watchedOn : null, ...(e.rewatches ?? []).map((r) => r.finishedOn ?? null)].filter((x): x is string => !!x)
  const seen = e.status === 'watched' || !!e.watchedOn || days.length > 0
  return { seen, last: days.sort().pop() ?? null }
}

const refOf = (e: LibraryEntry, d: TitleDetails | undefined): TitleRef => ({
  key: e.key,
  type: e.type as MediaType,
  id: e.id,
  name: e.title.name,
  year: e.title.year ?? null,
  posterPath: d?.posterPath ?? e.title.posterPath ?? null,
  date: d?.date ?? null
})

/** The evenings you could watch on, from tonight (if there's still time) to the night before. */
function nightsBefore(release: string, now: Date, ev: Evenings, firstLength: number): string[] {
  const t = tonight(now, ev)
  const nights = nightsBetween(t.day, dayBefore(release), ev)
  // Tonight only counts if there's still time for it.
  return nights[0] === t.day && t.minutesLeft < Math.min(firstLength, eveningMinutes(ev)) ? nights.slice(1) : nights
}

export function catchUps({ library, details, collections, now, evenings, region, aheadDays = 42, skipDays = 365 }: CatchUpInput): CatchUp[] {
  const today = localDate(now)
  const horizon = addDays(today, aheadDays)
  const dismissed = new Set(library.catchUpDismissed ?? [])
  const evening = eveningMinutes(evenings)
  const recent = (day: string | null): boolean => !!day && skipDays > 0 && daysBetween(day, today) < skipDays
  const out: CatchUp[] = []

  // ---- Films: the next one in a series ----
  for (const c of Object.values(collections)) {
    const parts = c.parts
      .map((p) => ({ p, when: releaseIn(details[p.key], p.date, region) }))
      .filter((x): x is { p: TitleRef; when: { date: string; cinema: boolean } } => !!x.when)
      .sort((a, b) => a.when.date.localeCompare(b.when.date))
    for (const { p: up, when } of parts) {
      if (when.date <= today || when.date > horizon) continue
      // The latest film before it that you've seen.
      const before = parts
        .filter((x) => x.when.date < when.date)
        .map((x) => library.entries[x.p.key])
        .filter((e): e is LibraryEntry => !!e && filmWatched(e).seen)
        .pop()
      if (!before) continue
      const id = `${before.key}>${up.key}`
      const { last } = filmWatched(before)
      if (dismissed.has(id) || recent(last)) continue
      const minutes = details[before.key]?.runtime || 120
      const nights = nightsBefore(when.date, now, evenings, minutes)
      if (!nights.length) continue
      // Work back from the release: the last evening before it, leaving a night spare when there's room.
      const night = nights.length > 2 ? nights[nights.length - 2] : nights[nights.length - 1]
      out.push({
        id,
        kind: 'film',
        upcoming: { key: up.key, name: details[up.key]?.name ?? up.name, date: when.date, cinema: when.cinema },
        rewatch: { ...refOf(before, details[before.key]), minutes },
        partial: false,
        nights: [night],
        late: minutes > evening,
        lastWatched: last
      })
    }
  }

  // ---- Shows: a new season ----
  for (const e of Object.values(library.entries)) {
    if (e.type !== 'tv' || e.status === 'stopped' || e.status === 'want') continue
    const d = details[e.key]
    if (!d) continue
    const premiere = nextPremiere(d, today)
    if (!premiere || premiere > horizon) continue
    const season = d.seasons.find((s) => s.number > 0 && s.airDate === premiere)?.number ?? (d.nextEpisode?.episode === 1 ? d.nextEpisode.season : null)
    if (!season || season < 2) continue
    const prev = d.seasons.find((s) => s.number === season - 1)
    if (!prev?.episodeCount) continue
    const eps = e.episodes ?? {}
    if (Object.keys(eps).some((k) => parseEpisodeKey(k)?.season === season)) continue
    let all = true
    for (let n = 1; n <= prev.episodeCount; n++) if (!eps[`S${prev.number}E${n}`]) all = false
    if (!all) continue
    const last = lastTicked(eps, prev.number)
    const id = `${e.key}@S${prev.number}>${e.key}@S${season}`
    if (dismissed.has(id) || recent(last)) continue
    const each = d.runtime || DEFAULT_EPISODE_MINUTES
    const perNight = Math.max(1, mostAnEvening(evenings, each))
    const nights = nightsBefore(premiere, now, evenings, each)
    if (!nights.length) continue
    // Tonight only has what's left of it.
    const t = tonight(now, evenings)
    const room = nights.map((n) => Math.max(1, n === t.day ? planFor(n, evenings, each, fitTonight(now, evenings, each)) : planFor(n, evenings, each)))
    // Work back from the night before it starts until the season fits (or the nights run out).
    const chosen: string[] = []
    let count = 0
    for (let i = nights.length - 1; i >= 0 && count < prev.episodeCount; i--) {
      chosen.unshift(nights[i])
      count = Math.min(prev.episodeCount, count + room[i])
    }
    out.push({
      id,
      kind: 'season',
      upcoming: { key: e.key, name: d.name, date: premiere, season, cinema: false },
      rewatch: { ...refOf(e, d), season: prev.number, episodes: prev.episodeCount, minutes: count * each },
      fromEpisode: prev.episodeCount - count + 1,
      episodes: count,
      perNight: Math.min(perNight, count),
      partial: count < prev.episodeCount,
      nights: chosen,
      late: false,
      lastWatched: last
    })
  }

  return out.sort((a, b) => a.upcoming.date.localeCompare(b.upcoming.date))
}

/** Adds a catch-up to the ones you said "Not now" to. */
export function dismissCatchUp(library: Library, id: string): Library {
  return { ...library, catchUpDismissed: [...new Set([...(library.catchUpDismissed ?? []), id])].slice(-300) }
}

export const CATCH_UP_ID = /^(movie|tv):\d+(@S\d+)?>(movie|tv):\d+(@S\d+)?$/
