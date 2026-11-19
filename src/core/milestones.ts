import { formatMonth } from './format'
import { UNDATED, parseEpisodeKey, type Library, type LibraryEntry, type TitleKey } from './types'

/**
 * Phase 53, milestones: quiet moments, not badges or points. "That was your 1,000th episode" or
 * "100 hours of The Walking Dead", shown once as a small note when a tick takes you past one.
 * Which ones have been shown is kept in the library (`milestones`), so both computers agree and
 * unticking and ticking again never shows the same one twice.
 */

/** Episodes, counting every tick (first watches, rewatches and watching with someone). */
const EPISODE_STEPS = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000]
/** Different films you've watched. */
const FILM_STEPS = [25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000]
/** Hours with one show. */
const SHOW_HOUR_STEPS = [24, 50, 100, 200, 300, 500, 750, 1000]

/** Every step at or below `n`: the fixed ones, then every `every` after the last. */
function stepsUpTo(n: number, fixed: number[], every: number): number[] {
  const out = fixed.filter((s) => s <= n)
  for (let s = fixed[fixed.length - 1] + every; s <= n; s += every) out.push(s)
  return out
}
const episodeSteps = (n: number): number[] => stepsUpTo(n, EPISODE_STEPS, 1000)
const filmSteps = (n: number): number[] => stepsUpTo(n, FILM_STEPS, 500)
const hourSteps = (n: number): number[] => stepsUpTo(n, SHOW_HOUR_STEPS, 500)

/** The steps passed going from `before` to `after` (none when it went down or stayed). */
function crossed(steps: (n: number) => number[], before: number, after: number): number[] {
  if (after <= before) return []
  const had = new Set(steps(before))
  return steps(after).filter((s) => !had.has(s))
}

export interface Milestone {
  /** "episodes:1000", "films:100" or "hours:tv:1402:100". */
  id: string
  kind: 'episodes' | 'films' | 'hours'
  /** "That was your 1,000th episode." */
  text: string
  /** A quieter second line: the episode or film it was, or since when. */
  detail?: string
  key?: TitleKey
}

export const MILESTONE_ID = /^(episodes|films):\d+$|^hours:tv:\d+:\d+$/

/** Every tick on a show, first watch and rewatches together, with the day each was ticked. */
function ticksOf(e: LibraryEntry): string[] {
  const out = Object.values(e.episodes ?? {})
  for (const r of e.rewatches ?? []) out.push(...Object.values(r.episodes ?? {}))
  return out
}

/** Every tick on a show, by "S1E3" or "S1E3#2" for the second rewatch, so new ones can be told apart. */
function tickKeys(e: LibraryEntry): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(e.episodes ?? {})) out.set(k, v)
  ;(e.rewatches ?? []).forEach((r, i) => {
    for (const [k, v] of Object.entries(r.episodes ?? {})) out.set(`${k}#${i}`, v)
  })
  return out
}

const isFilm = (e: LibraryEntry): boolean => e.type === 'movie' && e.status === 'watched'

export interface Tally {
  episodes: number
  films: number
  /** Ticks per show, by title key. */
  shows: Record<string, number>
}

export function tally(library: Library): Tally {
  const t: Tally = { episodes: 0, films: 0, shows: {} }
  for (const e of Object.values(library.entries)) {
    if (e.type === 'tv') {
      const n = ticksOf(e).length
      if (n) t.shows[e.key] = n
      t.episodes += n
    } else if (isFilm(e)) t.films++
  }
  return t
}

/** Shows with more ticks than before: the ones whose hours could have passed a milestone. */
export function showsTickedSince(before: Library, after: Library): TitleKey[] {
  const a = tally(before).shows
  return Object.entries(tally(after).shows)
    .filter(([k, n]) => n > (a[k] ?? 0))
    .map(([k]) => k as TitleKey)
}

/** More than this many new ticks (or films) at once is an import or a different library, not an evening's watching. */
const TOO_MANY_TICKS = 200
const TOO_MANY_FILMS = 20

const ordinal = (n: number): string => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n.toLocaleString('en-GB')}${suffix}`
}

/** Minutes an episode when TMDB doesn't say (DEFAULT_EPISODE_MINUTES in time.ts, kept apart so library.ts can import this file). */
const MINUTES_EACH = 45

const showHours = (ticks: number, minutesEach: number | null | undefined): number => Math.floor((ticks * (minutesEach || MINUTES_EACH)) / 60)

/** "Since March 2023": when the first dated tick on a show was. */
function since(e: LibraryEntry): string | undefined {
  const days = ticksOf(e)
    .filter((d) => d !== UNDATED)
    .sort()
  return days.length ? `Since ${formatMonth(days[0])}` : undefined
}

/**
 * The milestones a change to the library passed that haven't been shown before, the one to show
 * first at the front. `quiet` says to note them as passed without showing anything: the change
 * wasn't an evening's watching (only "seen before" ticks, or an import of hundreds at once).
 * `runtimes` are minutes an episode, by show, for the shows that got new ticks.
 */
export function milestonesBetween(before: Library, after: Library, runtimes: Record<string, number | null | undefined> = {}): { milestones: Milestone[]; quiet: boolean } {
  const seen = new Set(after.milestones ?? [])
  const a = tally(before)
  const b = tally(after)
  const out: Milestone[] = []

  // What was just watched: new ticks with a day (not "seen before"), and newly watched films.
  const fresh: { key: TitleKey; tick: string }[] = []
  let newTicks = 0
  for (const e of Object.values(after.entries)) {
    if (e.type !== 'tv') continue
    const old = before.entries[e.key]
    const had = old ? tickKeys(old) : new Map<string, string>()
    for (const [k, v] of tickKeys(e)) {
      if (had.has(k)) continue
      newTicks++
      if (v !== UNDATED) fresh.push({ key: e.key, tick: k })
    }
  }
  const newFilms = Object.values(after.entries).filter((e) => isFilm(e) && !(before.entries[e.key] && isFilm(before.entries[e.key])))
  const freshFilms = newFilms.filter((e) => !e.seenBefore)
  const quiet = (!fresh.length && !freshFilms.length) || newTicks > TOO_MANY_TICKS || newFilms.length > TOO_MANY_FILMS

  const lastFresh = fresh[fresh.length - 1]
  const lastEpisode = (() => {
    if (!lastFresh) return undefined
    const ep = parseEpisodeKey(lastFresh.tick.split('#')[0])
    const name = after.entries[lastFresh.key]?.title.name
    return ep && name ? `${name} · S${ep.season} E${ep.episode}` : name
  })()
  for (const n of crossed(episodeSteps, a.episodes, b.episodes).reverse()) {
    out.push({ id: `episodes:${n}`, kind: 'episodes', text: `That was your ${ordinal(n)} episode.`, ...(lastEpisode ? { detail: lastEpisode } : {}) })
  }

  for (const key of showsTickedSince(before, after)) {
    const e = after.entries[key]
    const mins = runtimes[key]
    for (const h of crossed(hourSteps, showHours(a.shows[key] ?? 0, mins), showHours(b.shows[key], mins)).reverse()) {
      const name = e.title.name
      const text = h === 24 ? `A whole day of ${name}.` : `${h.toLocaleString('en-GB')} hours of ${name}.`
      const detail = since(e)
      out.push({ id: `hours:${key}:${h}`, kind: 'hours', text, key, ...(detail ? { detail } : {}) })
    }
  }

  const lastFilm = freshFilms[freshFilms.length - 1]?.title.name
  for (const n of crossed(filmSteps, a.films, b.films).reverse()) {
    out.push({ id: `films:${n}`, kind: 'films', text: `That was your ${ordinal(n)} film.`, ...(lastFilm ? { detail: lastFilm } : {}) })
  }

  return { milestones: out.filter((m) => !seen.has(m.id)), quiet }
}

/** Notes milestones as shown, so they never show again (on either computer). */
export function markMilestones(library: Library, ids: string[]): Library {
  const add = ids.filter((id) => MILESTONE_ID.test(id))
  const had = library.milestones ?? []
  if (add.every((id) => had.includes(id))) return library
  return { ...library, milestones: [...new Set([...had, ...add])].slice(-500) }
}

/** Reads the shown milestones from whatever was in the file. */
export function normalizeMilestones(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && MILESTONE_ID.test(x)))].slice(-500)
  return ids.length ? ids : undefined
}
