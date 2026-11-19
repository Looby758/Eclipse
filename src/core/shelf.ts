import type { Library, LibraryEntry, MediaType, TitleDetails, TitleKey } from './types'
import { UNDATED, parseEpisodeKey } from './types'

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

// ---- Phase 52: pull a box set out ----

/** The shelves of finished box sets, one per year you finished things in (newest first), then "Seen before Eclipse". */
export interface ShelfOfYear {
  /** "2026", or null for the shelf of things seen before Eclipse. */
  year: string | null
  boxes: FinishedBox[]
}

export function shelvesByYear(boxes: FinishedBox[]): ShelfOfYear[] {
  const by = new Map<string | null, FinishedBox[]>()
  for (const b of boxes) {
    const y = b.finishedOn ? b.finishedOn.slice(0, 4) : null
    by.set(y, [...(by.get(y) ?? []), b])
  }
  return [...by.entries()].sort((a, b) => (b[0] ?? '0000').localeCompare(a[0] ?? '0000')).map(([year, list]) => ({ year, boxes: list }))
}

/** One time through it, on the back of the box: your first time, a rewatch, or with someone. */
export interface BoxWatch {
  label: string
  /** First and last dated watch, or null when it had no dates (seen before Eclipse). */
  from: string | null
  to: string | null
  /** Still going. */
  going: boolean
  /** Shows: episodes seen in this watch. */
  episodes: number
}

/** The back of the box: your history with something you've finished, and its credits. */
export interface BoxSetCard {
  key: TitleKey
  type: MediaType
  id: number
  name: string
  year: number | null
  posterPath: string | null
  tagline: string
  /** Your first time: the first and last day (a film's watch day is both). Null when seen before Eclipse. */
  started: string | null
  finished: string | null
  /** Days from first to last, counting both (shows only, when both are known). */
  days: number | null
  /** All the time you've spent on it, every watch counted. */
  minutes: number
  /** True when some of that is a guess (TMDB has no runtime). */
  estimated: boolean
  /** Shows: episodes in your first watch, and how many the show has. */
  episodes: number
  totalEpisodes: number | null
  seasons: number
  /** Times you've seen it all the way through (your first time and finished rewatches on your own). */
  timesThrough: number
  watches: BoxWatch[]
  /** Who you've watched it with. */
  with: string[]
  rating: number | null
  from: string | null
  note: string | null
  /** Shows: the best-rated episode you've seen (TMDB's rating, with enough votes to count). */
  best: { season: number; episode: number; name: string; rating: number } | null
  /** Shows: the most episodes you watched in one day. */
  binge: { day: string; episodes: number } | null
  /** Films: the director(s). Shows: none (TMDB lists one per episode). */
  directors: string[]
  /** The main cast, with who they played. */
  starring: { name: string; role: string }[]
  seenBefore: boolean
}

/** Least TMDB votes for an episode to count as your best-rated one. */
export const BEST_MIN_VOTES = 20

const isDay = (d: string | undefined | null): d is string => !!d && d !== UNDATED && /^\d{4}-\d{2}-\d{2}$/.test(d)
const span = (days: string[]): { from: string | null; to: string | null } => {
  const s = days.filter(isDay).sort()
  return { from: s[0] ?? null, to: s[s.length - 1] ?? null }
}
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * What's on the back of a box set you pull off the shelf. Works from your library alone (dates,
 * who with, your note); TMDB's details, credits and seasons add the hours, the cast and your
 * best-rated episode when they're there.
 */
export function boxSetCard(
  entry: LibraryEntry,
  details?: TitleDetails,
  credits?: { directors: { name: string }[]; cast: { name: string; role: string }[] },
  seasons: { number: number; episodes: { number: number; name: string; runtime: number | null; voteAverage: number | null; voteCount: number }[] }[] = []
): BoxSetCard {
  const rewatches = entry.rewatches ?? []
  const fallback = entry.type === 'movie' ? 120 : 45
  const perEpisode = details?.runtime || fallback
  const episodeInfo = new Map<string, { name: string; runtime: number | null; voteAverage: number | null; voteCount: number }>()
  for (const s of seasons) for (const e of s.episodes) episodeInfo.set(`S${s.number}E${e.number}`, e)

  let minutes = 0
  let estimated = entry.type === 'movie' && !details?.runtime
  const watches: BoxWatch[] = []
  const withWho: string[] = []
  let timesThrough = 0

  if (entry.type === 'movie') {
    const first = entry.watchedOn ?? null
    const finishedRewatches = rewatches.filter((r) => r.finishedOn)
    const count = (entry.status === 'watched' || first ? 1 : 0) + finishedRewatches.length
    minutes = count * perEpisode
    if (entry.status === 'watched' || first) watches.push({ label: 'First time', from: first, to: first, going: false, episodes: 0 })
    let n = 0
    for (const r of rewatches) {
      if (r.with && !withWho.includes(r.with)) withWho.push(r.with)
      const day = r.finishedOn ?? null
      watches.push({ label: r.with ? `With ${r.with}` : ++n === 1 ? 'Rewatch' : `Rewatch ${n}`, from: day ?? r.startedOn, to: day, going: !r.finishedOn, episodes: 0 })
    }
    timesThrough = (entry.status === 'watched' || first ? 1 : 0) + finishedRewatches.filter((r) => !r.with).length
    return {
      ...head(entry, details),
      started: first,
      finished: first,
      days: null,
      minutes,
      estimated: estimated && count > 0,
      episodes: 0,
      totalEpisodes: null,
      seasons: 0,
      timesThrough,
      watches,
      with: withWho,
      ...yours(entry),
      best: null,
      binge: null,
      directors: (credits?.directors ?? []).slice(0, 2).map((d) => d.name),
      starring: (credits?.cast ?? []).slice(0, 5).map((c) => ({ name: c.name, role: c.role })),
      seenBefore: !!entry.seenBefore || !first
    }
  }

  // Shows: every tick counts towards the hours, at that episode's own length when TMDB knows it.
  const timeOf = (ticks: Record<string, string>): number => {
    let m = 0
    for (const k of Object.keys(ticks)) {
      const info = episodeInfo.get(k)
      if (info?.runtime) m += info.runtime
      else {
        m += perEpisode
        if (!details?.runtime) estimated = true
      }
    }
    return m
  }
  const own = entry.episodes ?? {}
  minutes += timeOf(own)
  const first = span(Object.values(own))
  if (Object.keys(own).length) watches.push({ label: 'First time', ...first, going: entry.status === 'watching', episodes: Object.keys(own).length })
  let n = 0
  for (const r of rewatches) {
    const ticks = r.episodes ?? {}
    minutes += timeOf(ticks)
    if (r.with && !withWho.includes(r.with)) withWho.push(r.with)
    const s = span([r.startedOn, ...Object.values(ticks), r.finishedOn ?? ''])
    watches.push({ label: r.with ? `With ${r.with}` : ++n === 1 ? 'Rewatch' : `Rewatch ${n}`, ...s, to: r.finishedOn ? s.to : null, going: !r.finishedOn, episodes: Object.keys(ticks).length })
  }
  timesThrough = (entry.status === 'watched' ? 1 : 0) + rewatches.filter((r) => r.finishedOn && !r.with).length

  // Your best-rated episode: of everything you've seen in any watch.
  const seen = new Set([...Object.keys(own), ...rewatches.flatMap((r) => Object.keys(r.episodes ?? {}))])
  let best: BoxSetCard['best'] = null
  for (const k of seen) {
    const info = episodeInfo.get(k)
    const p = parseEpisodeKey(k)
    if (!info || !p || info.voteAverage == null || info.voteCount < BEST_MIN_VOTES) continue
    if (!best || info.voteAverage > best.rating) best = { season: p.season, episode: p.episode, name: info.name, rating: Math.round(info.voteAverage * 10) / 10 }
  }

  // The most in one day, your first time through.
  const perDay = new Map<string, number>()
  for (const d of Object.values(own)) if (isDay(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1)
  let binge: BoxSetCard['binge'] = null
  for (const [day, count] of perDay) if (!binge || count > binge.episodes || (count === binge.episodes && day < binge.day)) binge = { day, episodes: count }

  // The same day the shelf shows: the day you marked it Watched, otherwise your last tick.
  const finished = isDay(entry.watchedOn) ? entry.watchedOn : first.to
  const started = first.from
  const seasonsSeen = new Set([...seen].map((k) => parseEpisodeKey(k)?.season ?? 0).filter((s) => s > 0)).size
  return {
    ...head(entry, details),
    started,
    finished,
    days: started && finished ? daysBetween(started, finished) + 1 : null,
    minutes,
    estimated: estimated && minutes > 0,
    episodes: Object.keys(own).length,
    totalEpisodes: details?.numberOfEpisodes ?? null,
    seasons: seasonsSeen,
    timesThrough,
    watches,
    with: withWho,
    ...yours(entry),
    best,
    binge: binge && binge.episodes >= 2 ? binge : null,
    directors: [],
    starring: (credits?.cast ?? []).slice(0, 5).map((c) => ({ name: c.name, role: c.role })),
    seenBefore: !!entry.seenBefore || (!started && Object.keys(own).length > 0)
  }
}

const head = (entry: LibraryEntry, d?: TitleDetails): Pick<BoxSetCard, 'key' | 'type' | 'id' | 'name' | 'year' | 'posterPath' | 'tagline'> => ({
  key: entry.key,
  type: entry.type,
  id: entry.id,
  name: entry.title.name,
  year: entry.title.year,
  posterPath: entry.title.posterPath,
  tagline: d?.tagline ?? ''
})

const yours = (e: LibraryEntry): Pick<BoxSetCard, 'rating' | 'from' | 'note'> => ({ rating: e.rating ?? null, from: e.from?.trim() || null, note: e.note?.trim() || null })
