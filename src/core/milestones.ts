import { formatMonth } from './format'
import { longestRun, minutesEach, seasonsFinished, watchEvents, type StatDetails, type WatchEvent } from './stats'
import { MILESTONE_ID, UNDATED, parseEpisodeKey, type Library, type LibraryEntry, type TitleKey } from './types'

/**
 * Phase 53, milestones: quiet moments, not badges or points. "That was your 1,000th episode" or
 * "100 hours of The Walking Dead", shown once as a small note when something you watch takes you
 * past one, and all of them on the Stats page. Which have been shown is kept in the library
 * (`milestones`), so both computers agree and unticking and ticking again never shows one twice.
 *
 * Each kind of milestone measures one number (episodes, hours with a show, days in a row…); a
 * milestone is that number passing one of its steps. Its id is the measure and the step:
 * "episodes:1000", "hours:tv:1402:100", "genre:Drama:25".
 */

type Details = Record<string, StatDetails | undefined>

interface Kind {
  id: string
  /** For the Stats page: "Episodes", "Hours with one show". */
  title: string
  /** The steps: these, then every `every` after the last. */
  steps: number[]
  every: number
  /** The note: "That was your 1,000th episode." */
  text(step: number, name: string): string
  /** The number now, for the Stats page: "1,234 episodes". */
  unit(n: number, name: string): string
}

const fmt = (n: number): string => n.toLocaleString('en-GB')
const ordinal = (n: number): string => {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${fmt(n)}${suffix}`
}
const words = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number): string => words[n] ?? fmt(n)

/** Every kind of milestone, in the order they're shown first when several come at once. */
export const KINDS: Kind[] = [
  {
    id: 'episodes',
    title: 'Episodes',
    steps: [10, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000],
    every: 500,
    text: (n) => `That was your ${ordinal(n)} episode.`,
    unit: (n) => `${fmt(n)} episodes`
  },
  {
    id: 'films',
    title: 'Films',
    steps: [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000],
    every: 250,
    text: (n) => `That was your ${ordinal(n)} film.`,
    unit: (n) => `${fmt(n)} films`
  },
  {
    id: 'time',
    title: 'Hours watched',
    steps: [24, 50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000],
    every: 1000,
    text: (n) => (n === 24 ? 'A whole day of watching, all told.' : `${fmt(n)} hours of watching, all told.`),
    unit: (n) => `${fmt(n)} hours`
  },
  {
    id: 'hours',
    title: 'Hours with one show',
    steps: [24, 50, 100, 200, 300, 500, 750, 1000],
    every: 500,
    text: (n, name) => (n === 24 ? `A whole day of ${name}.` : `${fmt(n)} hours of ${name}.`),
    unit: (n, name) => `${fmt(n)} hours of ${name}`
  },
  {
    id: 'show',
    title: 'Episodes of one show',
    steps: [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000],
    every: 500,
    text: (n, name) => `Your ${ordinal(n)} episode of ${name}.`,
    unit: (n, name) => `${fmt(n)} episodes of ${name}`
  },
  {
    id: 'finished',
    title: 'Shows finished',
    steps: [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300],
    every: 100,
    text: (n) => (n === 1 ? 'Your first show watched all the way through.' : `That’s ${fmt(n)} shows watched all the way through.`),
    unit: (n) => `${fmt(n)} shows finished`
  },
  {
    id: 'seasons',
    title: 'Seasons finished',
    steps: [10, 25, 50, 100, 150, 200, 300, 400, 500],
    every: 250,
    text: (n) => `That’s your ${ordinal(n)} season finished.`,
    unit: (n) => `${fmt(n)} seasons`
  },
  {
    id: 'streak',
    title: 'Days in a row',
    steps: [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365],
    every: 365,
    text: (n) => (n === 7 ? 'A whole week in a row with something on.' : n === 365 ? 'A whole year in a row with something on.' : `${fmt(n)} days in a row with something on.`),
    unit: (n) => `${fmt(n)} days in a row`
  },
  {
    id: 'binge',
    title: 'Episodes in one day',
    steps: [5, 8, 10, 13, 15, 20, 25],
    every: 5,
    text: (n) => `${fmt(n)} episodes in one day.`,
    unit: (n) => `${fmt(n)} in a day`
  },
  {
    id: 'bill',
    title: 'Films in one day',
    steps: [2, 3, 4, 5],
    every: 1,
    text: (n) => (n === 2 ? 'A double bill: two films in one day.' : n === 3 ? 'A triple bill: three films in one day.' : `${say(n).replace(/^./, (c) => c.toUpperCase())} films in one day.`),
    unit: (n) => `${fmt(n)} in a day`
  },
  {
    id: 'days',
    title: 'Days with something on',
    steps: [30, 50, 100, 200, 365, 500, 750, 1000, 1500, 2000],
    every: 500,
    text: (n) => (n === 365 ? 'Something on 365 different days: a year’s worth.' : `Something on ${fmt(n)} different days.`),
    unit: (n) => `${fmt(n)} days`
  },
  {
    id: 'started',
    title: 'Shows started',
    steps: [10, 25, 50, 75, 100, 150, 200, 300],
    every: 100,
    text: (n) => `You’ve now started ${fmt(n)} different shows.`,
    unit: (n) => `${fmt(n)} shows`
  },
  {
    id: 'rewatches',
    title: 'Rewatches finished',
    steps: [1, 5, 10, 25, 50, 100],
    every: 50,
    text: (n) => (n === 1 ? 'Your first rewatch, all the way through.' : `Your ${ordinal(n)} rewatch, all the way through.`),
    unit: (n) => `${fmt(n)} rewatches`
  },
  {
    id: 'with',
    title: 'Watching with someone',
    steps: [10, 25, 50, 100, 250, 500, 1000],
    every: 500,
    text: (n, name) => `${fmt(n)} episodes and films with ${name}.`,
    unit: (n, name) => `${fmt(n)} with ${name}`
  },
  {
    id: 'genre',
    title: 'Genres',
    steps: [10, 25, 50, 100, 150, 200, 300, 500],
    every: 250,
    text: (n, name) => `${fmt(n)} films and shows in ${name}.`,
    unit: (n, name) => `${fmt(n)} in ${name}`
  },
  {
    id: 'decades',
    title: 'Decades',
    steps: [3, 4, 5, 6, 7, 8, 9, 10],
    every: 1,
    text: (n) => `Films and shows from ${say(n)} different decades.`,
    unit: (n) => `${fmt(n)} decades`
  },
  {
    id: 'library',
    title: 'Your library',
    steps: [50, 100, 250, 500, 750, 1000, 1500, 2000],
    every: 500,
    text: (n) => `${fmt(n)} films and shows in your library.`,
    unit: (n) => `${fmt(n)} titles`
  }
]
const KIND = new Map(KINDS.map((k) => [k.id, k]))

/** Every step at or below `n`. */
function stepsUpTo(n: number, k: Kind): number[] {
  const out = k.steps.filter((s) => s <= n)
  for (let s = k.steps[k.steps.length - 1] + k.every; s <= n; s += k.every) out.push(s)
  return out
}
/** The next step above `n`. */
function nextStep(n: number, k: Kind): number {
  const fixed = k.steps.find((s) => s > n)
  if (fixed) return fixed
  const last = k.steps[k.steps.length - 1]
  return last + Math.floor((n - last) / k.every + 1) * k.every
}

/** One number a milestone is measured on: the whole library's, or one show's, person's or genre's. */
export interface Measure {
  /** "episodes", "hours:tv:1402", "genre:Drama". */
  id: string
  kind: string
  value: number
  /** The show, person or genre it's about. */
  name: string
  key?: TitleKey
}

const isFilm = (e: LibraryEntry): boolean => e.type === 'movie' && e.status === 'watched'
/** Names can't hold a ":" in an id. */
const idPart = (s: string): string => s.replace(/[:\n]/g, ' ').trim().slice(0, 80)

/** Everything milestones are measured on, from the library and TMDB's details for its titles. */
export function measure(library: Library, details: Details = {}): Measure[] {
  const events = watchEvents(library, details)
  const entries = Object.values(library.entries)
  const out: Measure[] = []
  const add = (kind: string, value: number, sub?: { id: string; name: string; key?: TitleKey }): void => {
    if (value > 0) out.push({ id: sub ? `${kind}:${sub.id}` : kind, kind, value, name: sub?.name ?? '', ...(sub?.key ? { key: sub.key } : {}) })
  }

  const episodes = events.filter((w) => w.episode)
  add('episodes', episodes.length)
  add('films', entries.filter(isFilm).length)
  add('time', Math.floor(events.reduce((a, w) => a + w.minutes, 0) / 60))

  const perShow = new Map<string, number>()
  for (const w of episodes) perShow.set(w.key, (perShow.get(w.key) ?? 0) + 1)
  for (const e of entries) {
    if (e.type !== 'tv') continue
    const n = perShow.get(e.key) ?? 0
    add('hours', Math.floor((n * minutesEach(e, details[e.key])) / 60), { id: e.key, name: e.title.name, key: e.key })
    add('show', n, { id: e.key, name: e.title.name, key: e.key })
  }
  add('finished', entries.filter((e) => e.type === 'tv' && e.status === 'watched').length)
  add('seasons', entries.reduce((a, e) => a + seasonsFinished(e, details[e.key]), 0))

  const dated = events.filter((w): w is WatchEvent & { day: string } => !!w.day)
  const days = [...new Set(dated.map((w) => w.day))].sort()
  add('streak', longestRun(days)?.days ?? 0)
  add('days', days.length)
  const perShowDay = new Map<string, number>()
  const filmsDay = new Map<string, number>()
  for (const w of dated) {
    if (w.episode) perShowDay.set(`${w.key}@${w.day}`, (perShowDay.get(`${w.key}@${w.day}`) ?? 0) + 1)
    else filmsDay.set(w.day, (filmsDay.get(w.day) ?? 0) + 1)
  }
  add('binge', Math.max(0, ...perShowDay.values()))
  add('bill', Math.max(0, ...filmsDay.values()))

  add('started', entries.filter((e) => e.type === 'tv' && Object.keys(e.episodes ?? {}).length > 0).length)
  add('rewatches', entries.reduce((a, e) => a + (e.rewatches ?? []).filter((r) => r.finishedOn).length, 0))

  const people = new Map<string, { name: string; n: number }>()
  for (const w of events) {
    if (!w.with) continue
    const p = people.get(w.with.toLowerCase()) ?? { name: w.with, n: 0 }
    p.n++
    people.set(w.with.toLowerCase(), p)
  }
  for (const p of people.values()) add('with', p.n, { id: idPart(p.name.toLowerCase()), name: p.name })

  // Titles you've watched something of: films watched, shows with a tick.
  const watched = entries.filter((e) => isFilm(e) || (e.type === 'tv' && Object.keys(e.episodes ?? {}).length > 0))
  const genres = new Map<string, number>()
  for (const e of watched) for (const g of details[e.key]?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
  for (const [g, n] of genres) add('genre', n, { id: idPart(g), name: g })
  add('decades', new Set(watched.map((e) => e.title.year).filter((y): y is number => !!y).map((y) => Math.floor(y / 10))).size)

  add('library', entries.length)
  return out
}

export interface Milestone {
  /** "episodes:1000", "hours:tv:1402:100". */
  id: string
  kind: string
  /** "That was your 1,000th episode." */
  text: string
  /** A quieter second line: the episode or film it was, or since when. */
  detail?: string
  key?: TitleKey
  /** A smaller step passed at the same time as a bigger one: noted, not shown. */
  hidden?: boolean
}

/** Every milestone a set of measures has reached. */
function reached(measures: Measure[]): Map<string, { m: Measure; step: number }> {
  const out = new Map<string, { m: Measure; step: number }>()
  for (const m of measures) {
    const k = KIND.get(m.kind)
    if (k) for (const step of stepsUpTo(m.value, k)) out.set(`${m.id}:${step}`, { m, step })
  }
  return out
}

/** Every tick and watch with a key of its own, so new ones can be told apart. */
function activity(library: Library): Map<string, { key: TitleKey; day: string; tick: string | null }> {
  const out = new Map<string, { key: TitleKey; day: string; tick: string | null }>()
  for (const e of Object.values(library.entries)) {
    for (const [k, v] of Object.entries(e.episodes ?? {})) out.set(`${e.key}/${k}`, { key: e.key, day: v, tick: k })
    ;(e.rewatches ?? []).forEach((r, i) => {
      for (const [k, v] of Object.entries(r.episodes ?? {})) out.set(`${e.key}/${k}#${i}`, { key: e.key, day: v, tick: k })
      if (r.finishedOn) out.set(`${e.key}/done#${i}`, { key: e.key, day: r.finishedOn, tick: null })
    })
    if (isFilm(e)) out.set(`${e.key}/film`, { key: e.key, day: e.seenBefore ? UNDATED : (e.watchedOn ?? UNDATED), tick: null })
  }
  return out
}

/** More than this many new watches (or titles) at once is an import or a different library, not an evening's watching. */
const TOO_MANY = 200
const TOO_MANY_TITLES = 20

/** "Since March 2023": the first dated tick on a show. */
function since(e: LibraryEntry | undefined): string | undefined {
  if (!e) return undefined
  const days = Object.values(e.episodes ?? {})
    .filter((d) => d !== UNDATED)
    .sort()
  return days.length ? `Since ${formatMonth(days[0])}` : undefined
}

/**
 * The milestones a change to the library passed that haven't been shown before, the one to show
 * first at the front. `quiet` says to note them as passed without showing anything: the change
 * wasn't something you just watched (only "seen before" ticks, or an import of hundreds at once).
 * Both sides are measured with the same details, so details arriving never looks like a milestone.
 */
export function milestonesBetween(before: Library, after: Library, details: Details = {}): { milestones: Milestone[]; quiet: boolean } {
  const seen = new Set(after.milestones ?? [])
  const had = reached(measure(before, details))
  const now = reached(measure(after, details))

  const old = activity(before)
  const added = [...activity(after)].filter(([id]) => !old.has(id)).map(([, a]) => a)
  const fresh = added.filter((a) => a.day !== UNDATED)
  const newTitles = Object.keys(after.entries).filter((k) => !before.entries[k]).length
  const quiet = added.length > TOO_MANY || newTitles > TOO_MANY_TITLES || (!fresh.length && !newTitles)

  const last = fresh[fresh.length - 1]
  const lastName = last ? after.entries[last.key]?.title.name : undefined
  const lastEp = last?.tick ? parseEpisodeKey(last.tick) : null
  const lastWatch = lastName && lastEp ? `${lastName} · S${lastEp.season} E${lastEp.episode}` : lastName

  const out: Milestone[] = []
  for (const [id, { m, step }] of now) {
    if (had.has(id) || seen.has(id)) continue
    const k = KIND.get(m.kind)!
    let detail: string | undefined
    if (m.kind === 'hours' || m.kind === 'show') detail = since(m.key ? after.entries[m.key] : undefined)
    else if (['episodes', 'films', 'time', 'binge', 'bill', 'streak', 'days', 'with'].includes(m.kind)) detail = lastWatch
    out.push({ id, kind: m.kind, text: k.text(step, m.name), ...(detail ? { detail } : {}), ...(m.key ? { key: m.key } : {}) })
  }
  const order = (x: Milestone): number => KINDS.findIndex((k) => k.id === x.kind)
  const stepOf = (x: Milestone): number => Number(x.id.split(':').pop())
  out.sort((a, b) => order(a) - order(b) || stepOf(b) - stepOf(a))
  // Only the biggest step of each measure is worth a note (the rest are noted quietly).
  const top = new Set<string>()
  const shown: Milestone[] = []
  const rest: Milestone[] = []
  for (const x of out) {
    const measureId = x.id.slice(0, x.id.lastIndexOf(':'))
    if (top.has(measureId)) rest.push(x)
    else {
      top.add(measureId)
      shown.push(x)
    }
  }
  return { milestones: [...shown, ...rest.map((x) => ({ ...x, hidden: true }))], quiet }
}

/** Notes milestones as shown, so they never show again (on either computer). */
export function markMilestones(library: Library, ids: string[]): Library {
  const add = ids.filter((id) => MILESTONE_ID.test(id))
  const had = library.milestones ?? []
  if (add.every((id) => had.includes(id))) return library
  return { ...library, milestones: [...new Set([...had, ...add])].slice(-2000) }
}

// ---- The Stats page ----

export interface MilestoneTrack {
  id: string
  kind: string
  title: string
  /** "1,234 episodes", or "312 hours of The Walking Dead". */
  label: string
  value: number
  /** Steps reached, smallest first. */
  reached: number[]
  next: number
  /** The note each reached step gave (or would have given), newest first. */
  notes: string[]
  key?: TitleKey
}

/** Every milestone track: reached steps and the next one. Shows, people and genres are the top few each. */
export function milestoneBoard(library: Library, details: Details = {}, perKind = 6): MilestoneTrack[] {
  const measures = measure(library, details)
  const out: MilestoneTrack[] = []
  for (const k of KINDS) {
    const ms = measures.filter((m) => m.kind === k.id).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    for (const m of ms.slice(0, perKind)) {
      const steps = stepsUpTo(m.value, k)
      out.push({
        id: m.id,
        kind: k.id,
        title: k.title,
        label: k.unit(m.value, m.name),
        value: m.value,
        reached: steps,
        next: nextStep(m.value, k),
        notes: steps
          .slice()
          .reverse()
          .map((s) => k.text(s, m.name)),
        ...(m.key ? { key: m.key } : {})
      })
    }
  }
  return out
}

/** The title keys whose TMDB details milestones use (runtimes, seasons and genres). */
export function milestoneKeys(library: Library): string[] {
  return Object.values(library.entries)
    .filter((e) => isFilm(e) || Object.keys(e.episodes ?? {}).length > 0 || (e.rewatches ?? []).length > 0)
    .map((e) => e.key)
}
