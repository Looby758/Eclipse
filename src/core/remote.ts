import type { Library, Preferences, TitleDetails } from './types'
import { activeEntry, localDate } from './library'
import { episodeMinutes, fitTonight, startBy, tonight } from './time'
import { remainingEpisodes, soonItem, watchSoonOf } from './watchsoon'
import { lastTicked } from './nudges'

/**
 * Phase 23: your phone as a remote. What the little page on your phone shows: the next episode of
 * each show you're watching (with a tick button), how much fits before bed, and Watch soon.
 */

export interface RemoteShow {
  key: string
  name: string
  posterPath: string | null
  next: { season: number; episode: number } | null
  /** Episodes left that are out. */
  left: number
  minutesEach: number
  /** How many more fit before bed tonight. */
  fits: number
}

export interface RemoteSoon {
  key: string
  name: string
  film: boolean
  minutes: number
  episodes: number
  done: boolean
}

export interface RemoteState {
  /** "HH:MM" bedtime, and minutes of the evening left from now. */
  bedtime: string
  minutesLeft: number
  /** Start a 45-minute episode by this time to be in bed on time. */
  startBy: string
  shows: RemoteShow[]
  soon: RemoteSoon[]
}

export function remoteState(library: Library, details: Record<string, TitleDetails>, prefs: Preferences, now: Date): RemoteState {
  const today = localDate(now)
  const watching = Object.values(library.entries)
    .map((raw) => ({ raw, e: activeEntry(raw)! }))
    .filter(({ e }) => e.type === 'tv' && e.status === 'watching')
    .sort((a, b) => (lastTicked(b.e.episodes) ?? b.e.updatedAt).localeCompare(lastTicked(a.e.episodes) ?? a.e.updatedAt))
  const shows: RemoteShow[] = watching.map(({ e }) => {
    const d = details[e.key]
    const rest = d ? remainingEpisodes(d, e, today) : []
    const each = d ? episodeMinutes(d) : 45
    return { key: e.key, name: e.title.name, posterPath: e.title.posterPath, next: rest[0] ?? null, left: rest.length, minutesEach: each, fits: Math.min(rest.length, fitTonight(now, prefs, each)) }
  })
  const soon: RemoteSoon[] = watchSoonOf(library).map((ref) => {
    const i = soonItem(ref, details[ref.key], activeEntry(library.entries[ref.key]), today)
    return { key: ref.key, name: ref.name, film: i.film, minutes: i.minutes, episodes: i.episodes.length, done: i.done }
  })
  return { bedtime: prefs.bedtime, minutesLeft: tonight(now, prefs).minutesLeft, startBy: startBy(45, prefs), shows, soon }
}

/** A random pairing code for the page's address, so only someone who scanned the QR code can use it. */
export function newRemoteToken(random: (n: number) => Uint8Array): string {
  return [...random(16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compares two tokens without leaking where they differ through timing. */
export function sameToken(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Phase 26: the menu bar / tray menu's words, from the same state as the phone page. */
export interface TrayMenu {
  shows: { key: string; season: number; episode: number; label: string; done: string }[]
  tonight: string
  startBy: string | null
  minutesLeft: number
}

const hm = (m: number): string => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`)

export function trayMenuOf(s: RemoteState, max = 8): TrayMenu {
  const shows = s.shows
    .filter((x) => x.next)
    .slice(0, max)
    .map((x) => {
      const ep = `S${x.next!.season} E${x.next!.episode}`
      return { key: x.key, season: x.next!.season, episode: x.next!.episode, label: `${x.name}: ${ep}`, done: `${x.name} ${ep} is marked watched.` }
    })
  return {
    shows,
    tonight: s.minutesLeft > 0 ? `Tonight: ${hm(s.minutesLeft)} left before bed (${s.bedtime})` : `Past bedtime (${s.bedtime})`,
    startBy: s.minutesLeft > 0 ? `Start an episode by ${s.startBy}` : null,
    minutesLeft: s.minutesLeft
  }
}
