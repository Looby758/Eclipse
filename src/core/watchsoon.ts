import type { Library, LibraryEntry, TitleDetails, TitleRef } from './types'
import { episodeKey } from './types'
import { localDate } from './library'
import { DEFAULT_EPISODE_MINUTES, budgetPerNight, dayMinutes, fitIn, slotsOn, tonight, type Evenings } from './time'

/**
 * Watch soon: a short list of films and shows you want to get to next. Eclipse adds up how long
 * they take, lays them out over your watching evenings in your order, and says what fits tonight.
 */

// ---- The list ----

export const watchSoonOf = (library: Library): TitleRef[] => library.watchSoon ?? []
export const isWatchSoon = (library: Library, key: string): boolean => watchSoonOf(library).some((r) => r.key === key)

/** Adds a title to the end of Watch soon, or takes it off. */
export function setWatchSoon(library: Library, ref: TitleRef, on: boolean): Library {
  const list = watchSoonOf(library)
  const { season: _s, episodes: _e, sections: _x, ...clean } = ref
  const next = on ? (list.some((r) => r.key === ref.key) ? list : [...list, clean]) : list.filter((r) => r.key !== ref.key)
  return next === list ? library : { ...library, watchSoon: next }
}

/** Moves a title within Watch soon. */
export function moveWatchSoon(library: Library, from: number, to: number): Library {
  const list = [...watchSoonOf(library)]
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return library
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return { ...library, watchSoon: list }
}

// ---- How long each one takes ----

export interface Ep {
  season: number
  episode: number
}

/**
 * The episodes left to watch, in order: everything after the furthest one you've ticked that's
 * already out (specials and unaired episodes don't count).
 */
export function remainingEpisodes(d: Pick<TitleDetails, 'seasons' | 'nextEpisode'>, entry: LibraryEntry | undefined, today: string): Ep[] {
  if (entry?.status === 'watched') return []
  const next = d.nextEpisode
  const aired = (s: number, e: number): boolean => !next || (!!next.airDate && next.airDate <= today) || s < next.season || (s === next.season && e < next.episode)
  const order: Ep[] = []
  for (const s of [...d.seasons].filter((x) => x.number > 0 && (!x.airDate || x.airDate <= today)).sort((a, b) => a.number - b.number)) {
    for (let e = 1; e <= s.episodeCount; e++) if (aired(s.number, e)) order.push({ season: s.number, episode: e })
  }
  const seen = entry?.episodes ?? {}
  let last = -1
  order.forEach((ep, i) => {
    if (seen[episodeKey(ep.season, ep.episode)]) last = i
  })
  return order.slice(last + 1)
}

export interface SoonItem {
  ref: TitleRef
  film: boolean
  /** A film's length, or one episode's. */
  minutesEach: number
  /** Shows: what's left, in order. */
  episodes: Ep[]
  minutes: number
  /** TMDB doesn't know the length, so it's a guess. */
  estimated: boolean
  /** Nothing left (watched, or caught up with what's out). */
  done: boolean
  /** Details haven't loaded yet. */
  unknown: boolean
}

export function soonItem(ref: TitleRef, d: TitleDetails | undefined, entry: LibraryEntry | undefined, today: string): SoonItem {
  const film = ref.type === 'movie'
  if (!d) return { ref, film, minutesEach: 0, episodes: [], minutes: 0, estimated: true, done: entry?.status === 'watched', unknown: true }
  if (film) {
    const minutesEach = d.runtime || 120
    const done = entry?.status === 'watched'
    return { ref, film, minutesEach, episodes: [], minutes: done ? 0 : minutesEach, estimated: !d.runtime, done, unknown: false }
  }
  const minutesEach = d.runtime || DEFAULT_EPISODE_MINUTES
  const episodes = remainingEpisodes(d, entry, today)
  return { ref, film, minutesEach, episodes, minutes: episodes.length * minutesEach, estimated: !d.runtime, done: episodes.length === 0, unknown: false }
}

// ---- Laying it out over your evenings ----

export interface Slot {
  key: string
  name: string
  film: boolean
  /** Shows: the episodes watched that night. */
  episodes: Ep[]
  minutes: number
}

export interface Night {
  day: string
  tonight: boolean
  slots: Slot[]
  minutes: number
}

export interface SoonPlan {
  nights: Night[]
  /** The evening you'd finish everything, or null if it can't be planned (no watching nights). */
  finish: string | null
  totalMinutes: number
}

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}

/**
 * Fills your watching evenings in your order: tonight's time left first, then whole evenings.
 * A film goes on a night it fits (or on its own, if it's longer than a whole evening); a show
 * carries on over as many nights as it takes.
 */
export function planEvenings(items: SoonItem[], now: Date, ev: Evenings, maxNights = 120): SoonPlan {
  const queue = items.filter((i) => !i.done && !i.unknown && i.minutes > 0).map((i) => ({ item: i, left: [...i.episodes] }))
  const totalMinutes = queue.reduce((n, q) => n + q.item.minutes, 0)
  const t = tonight(now, ev)
  const nights: Night[] = []
  const gap = ev.gapMinutes ?? 0
  // With a weekly budget, each night gets its share (and never less than one thing).
  const share = budgetPerNight(ev)
  if (!queue.length) return { nights, finish: null, totalMinutes }
  if (![0, 1, 2, 3, 4, 5, 6].some((n) => slotsOn(addDays(t.day, n), ev, true).length)) return { nights, finish: null, totalMinutes }

  for (let day = t.day, i = 0; queue.length && nights.length < maxNights && i < 3660; day = addDays(day, 1), i++) {
    if (!slotsOn(day, ev).length) continue
    const isTonight = day === t.day
    const full = dayMinutes(day, ev)
    const raw = isTonight ? t.minutesLeft : full
    const cap = share === null ? raw : Math.min(raw, share)
    if (cap <= 0) continue
    let room = cap
    const slots: Slot[] = []
    while (queue.length) {
      const q = queue[0]
      const it = q.item
      if (it.film) {
        // Longer than a whole evening: it gets a whole evening to itself.
        // The first thing of a night always goes on (tonight only if there's time for it), even past the budget's share.
        const fits = it.minutesEach <= room || (room === cap && (!isTonight || it.minutesEach <= raw))
        if (!fits) break
        slots.push({ key: it.ref.key, name: it.ref.name, film: true, episodes: [], minutes: it.minutesEach })
        room -= it.minutesEach + gap
        queue.shift()
        continue
      }
      let n = fitIn(room, it.minutesEach, gap)
      if (n === 0 && room === cap && (!isTonight || it.minutesEach <= raw)) n = 1
      if (n === 0) break
      const eps = q.left.splice(0, n)
      slots.push({ key: it.ref.key, name: it.ref.name, film: false, episodes: eps, minutes: eps.length * it.minutesEach })
      room -= eps.length * (it.minutesEach + gap)
      if (!q.left.length) queue.shift()
      else break
    }
    if (slots.length) nights.push({ day, tonight: isTonight, slots, minutes: slots.reduce((n, s) => n + s.minutes, 0) })
  }
  return { nights, finish: queue.length ? null : (nights[nights.length - 1]?.day ?? null), totalMinutes }
}

/** What you could put on tonight instead: each title on its own, if it fits what's left of the evening. */
export function tonightOptions(items: SoonItem[], now: Date, ev: Evenings): { key: string; name: string; film: boolean; episodes: number; minutes: number }[] {
  const left = tonight(now, ev).minutesLeft
  return items
    .filter((i) => !i.done && !i.unknown)
    .map((i) => {
      if (i.film) return i.minutesEach <= left ? { key: i.ref.key, name: i.ref.name, film: true, episodes: 0, minutes: i.minutesEach } : null
      const n = Math.min(i.episodes.length, fitIn(left, i.minutesEach, ev.gapMinutes))
      return n > 0 ? { key: i.ref.key, name: i.ref.name, film: false, episodes: n, minutes: n * i.minutesEach } : null
    })
    .filter((o): o is NonNullable<typeof o> => !!o)
}

/** "S5 E1", "S5 E1–E3" or "S1 E9 – S2 E2". */
export function episodeRange(eps: Ep[]): string {
  if (!eps.length) return ''
  const a = eps[0]
  const b = eps[eps.length - 1]
  if (eps.length === 1) return `S${a.season} E${a.episode}`
  if (a.season === b.season) return `S${a.season} E${a.episode}–E${b.episode}`
  return `S${a.season} E${a.episode} – S${b.season} E${b.episode}`
}
