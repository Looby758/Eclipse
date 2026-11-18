import { localDate, setEpisodes, setStatus, type LibraryItem } from './library'
import { answerRecommendation, hideRecommendation } from './recommend'
import { STATUS_LABELS, UNDATED, parseEpisodeKey, parseTitleKey, type Library, type Trait, type WatchStatus, WATCH_STATUSES } from './types'

/**
 * Eclipse on your phone (Phase 45). The phone page reads library.json from Google Drive but never
 * writes it: everything you do on the phone goes into its own file, from-phone.json, in the same
 * folder. When Eclipse on the PC or Mac opens (or sees that file sync in), it folds those changes
 * into the library and notes their ids in `phoneApplied`; the phone then tidies them out of its
 * file. So each file only ever has one writer, and Drive never makes clashing copies.
 *
 * Anything that clashes with what you did on the computer (an episode ticked on both with
 * different days, a title removed on the computer but ticked on the phone) isn't folded in until
 * you choose which to keep.
 */

export const PHONE_FILE = 'from-phone.json'

/** How many folded-in ids library.json remembers (the phone tidies its file long before this). */
const APPLIED_KEEP = 1000

interface ChangeBase {
  /** Random, made on the phone. */
  id: string
  /** When you did it on the phone (ISO). */
  at: string
}

export type PhoneChange = ChangeBase &
  (
    | {
        /** Added a title, or changed its status. */
        kind: 'status'
        item: LibraryItem
        status: WatchStatus
        /** The status the phone saw before (null: it wasn't in your library). */
        was: WatchStatus | null
      }
    | {
        kind: 'episodes'
        item: LibraryItem
        keys: string[]
        watched: boolean
        /** The day you ticked them, on the phone (YYYY-MM-DD). */
        day: string
        /** The title was in your library when you ticked them on the phone. */
        had: boolean
      }
    | {
        /** "Not for me" on a recommendation. */
        kind: 'notForMe'
        key: string
      }
  )

/** A change as the phone records it, before it's given an id and a time. */
export type NewPhoneChange = PhoneChange extends infer C ? (C extends PhoneChange ? Omit<C, 'id' | 'at'> : never) : never

export interface PhoneFile {
  version: 1
  changes: PhoneChange[]
}

export type PhoneConflict =
  | { id: string; kind: 'removed'; key: string; name: string; what: string }
  | { id: string; kind: 'episodeDay'; key: string; name: string; episodes: { key: string; phone: string; computer: string }[] }
  | { id: string; kind: 'status'; key: string; name: string; phone: WatchStatus; computer: WatchStatus }

export type PhoneChoice = 'phone' | 'computer'

export const emptyPhoneFile = (): PhoneFile => ({ version: 1, changes: [] })

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function cleanItem(raw: unknown): LibraryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<LibraryItem>
  const parsed = typeof r.key === 'string' ? parseTitleKey(r.key) : null
  if (!parsed) return null
  const t = (r.title ?? {}) as Partial<LibraryItem['title']>
  return {
    key: r.key as LibraryItem['key'],
    type: parsed.type,
    id: parsed.id,
    title: {
      name: typeof t.name === 'string' ? t.name.slice(0, 300) : 'Untitled',
      year: typeof t.year === 'number' ? t.year : null,
      posterPath: typeof t.posterPath === 'string' ? t.posterPath : null
    }
  }
}

/** Reads from-phone.json, keeping only changes that make sense (a hand edit or half sync never breaks anything). */
export function normalizePhoneFile(raw: unknown): PhoneFile {
  const out = emptyPhoneFile()
  const list = raw && typeof raw === 'object' ? (raw as { changes?: unknown }).changes : null
  if (!Array.isArray(list)) return out
  const seen = new Set<string>()
  for (const c of list) {
    if (!c || typeof c !== 'object') continue
    const x = c as Record<string, unknown>
    if (typeof x.id !== 'string' || !x.id || seen.has(x.id) || typeof x.at !== 'string' || Number.isNaN(Date.parse(x.at))) continue
    const base = { id: x.id, at: x.at }
    if (x.kind === 'status') {
      const item = cleanItem(x.item)
      const was = x.was === null || WATCH_STATUSES.includes(x.was as WatchStatus) ? (x.was as WatchStatus | null) : undefined
      if (!item || !WATCH_STATUSES.includes(x.status as WatchStatus) || was === undefined) continue
      out.changes.push({ ...base, kind: 'status', item, status: x.status as WatchStatus, was })
    } else if (x.kind === 'episodes') {
      const item = cleanItem(x.item)
      const keys = Array.isArray(x.keys) ? x.keys.filter((k): k is string => typeof k === 'string' && !!parseEpisodeKey(k)) : []
      if (!item || item.type !== 'tv' || !keys.length || typeof x.watched !== 'boolean' || !isDay(x.day)) continue
      out.changes.push({ ...base, kind: 'episodes', item, keys, watched: x.watched, day: x.day, had: x.had === true })
    } else if (x.kind === 'notForMe') {
      if (typeof x.key !== 'string' || !parseTitleKey(x.key)) continue
      out.changes.push({ ...base, kind: 'notForMe', key: x.key })
    } else continue
    seen.add(x.id)
  }
  out.changes.sort((a, b) => a.at.localeCompare(b.at))
  return out
}

const markApplied = (library: Library, id: string): Library => ({
  ...library,
  phoneApplied: [...(library.phoneApplied ?? []).filter((x) => x !== id), id].slice(-APPLIED_KEEP)
})

/** The moment to stamp a tick with: when it happened on the phone, on the day the phone said. */
function tickTime(change: { at: string; day: string }): Date {
  const at = new Date(change.at)
  return localDate(at) === change.day ? at : new Date(`${change.day}T12:00:00`)
}

/** The ticks the computer has for a show right now (on the current rewatch, if there is one). */
function ticksOf(library: Library, key: string): Record<string, string> {
  const e = library.entries[key]
  const rewatch = e?.rewatches?.find((r) => !r.finishedOn && !r.with)
  return (rewatch ? rewatch.episodes : e?.episodes) ?? {}
}

const episodeLabel = (key: string): string => {
  const ep = parseEpisodeKey(key)
  return ep ? `S${ep.season} E${ep.episode}` : key
}

/** "ticked S2 E4" or "ticked S2 E4 to S2 E6", for the "removed on the computer" question. */
function describe(change: PhoneChange): string {
  if (change.kind === 'status') return `marked it ${STATUS_LABELS[change.status]}`
  if (change.kind === 'episodes') {
    const verb = change.watched ? 'ticked' : 'unticked'
    const keys = change.keys
    return keys.length === 1 ? `${verb} ${episodeLabel(keys[0])}` : `${verb} ${episodeLabel(keys[0])} to ${episodeLabel(keys[keys.length - 1])}`
  }
  return 'said Not for me'
}

/**
 * The phone's answers recommendations learn from (phase 43): Not for me, and adding something new
 * to Want to watch (Interested). Their titles' traits are fetched by the computer before folding in.
 */
export function learnableKeys(changes: PhoneChange[]): string[] {
  const keys = changes.map((c) => (c.kind === 'notForMe' ? c.key : c.kind === 'status' && c.status === 'want' && c.was === null ? c.item.key : null))
  return [...new Set(keys.filter((k): k is string => !!k))]
}

/** Applies one change the phone's way, with no questions. With `traits` for its title, an answer also teaches recommendations. */
function applyPhone(library: Library, change: PhoneChange, traits: Record<string, Trait[]> = {}): Library {
  if (change.kind === 'notForMe') {
    const t = traits[change.key]
    return t ? answerRecommendation(library, change.key, false, t) : hideRecommendation(library, change.key)
  }
  if (change.kind === 'status') {
    const t = traits[change.item.key]
    const isNew = change.status === 'want' && change.was === null && !library.entries[change.item.key]
    const lib = setStatus(library, change.item, change.status, new Date(change.at))
    return isNew && t ? answerRecommendation(lib, change.item.key, true, t) : lib
  }
  if (!change.watched) return library.entries[change.item.key] ? setEpisodes(library, change.item, change.keys, false, new Date(change.at)) : library
  // A day already there is kept by setEpisodes, so clear the ones the phone dated differently first.
  const ticks = ticksOf(library, change.item.key)
  const differ = change.keys.filter((k) => ticks[k] && ticks[k] !== change.day)
  let lib = differ.length ? setEpisodes(library, change.item, differ, false, new Date(change.at)) : library
  lib = setEpisodes(lib, change.item, change.keys, true, tickTime(change))
  return lib
}

/** Whether a change clashes with the library as it is now (null: it can be folded in). */
function conflictOf(library: Library, change: PhoneChange): PhoneConflict | null {
  if (change.kind === 'notForMe') return null
  const entry = library.entries[change.item.key]
  const name = change.item.title.name
  const key = change.item.key
  if (change.kind === 'status') {
    if (!entry) return change.was !== null ? { id: change.id, kind: 'removed', key, name, what: describe(change) } : null
    if (entry.status === change.status || entry.status === change.was) return null
    return { id: change.id, kind: 'status', key, name, phone: change.status, computer: entry.status }
  }
  if (!entry) return change.had && change.watched ? { id: change.id, kind: 'removed', key, name, what: describe(change) } : null
  if (!change.watched) return null
  const ticks = ticksOf(library, key)
  const episodes = change.keys.filter((k) => ticks[k] && ticks[k] !== change.day).map((k) => ({ key: k, phone: change.day, computer: ticks[k] }))
  return episodes.length ? { id: change.id, kind: 'episodeDay', key, name, episodes } : null
}

/**
 * Folds the phone's changes into the library, oldest first. Ones already folded in are skipped.
 * Clashes are left out (and not marked as folded in) so they can be asked about.
 */
export function foldPhone(library: Library, changes: PhoneChange[], traits: Record<string, Trait[]> = {}): { library: Library; conflicts: PhoneConflict[]; applied: number } {
  const done = new Set(library.phoneApplied ?? [])
  let lib = library
  let applied = 0
  const conflicts: PhoneConflict[] = []
  for (const change of [...changes].sort((a, b) => a.at.localeCompare(b.at))) {
    if (done.has(change.id)) continue
    const conflict = conflictOf(lib, change)
    if (conflict) {
      conflicts.push(conflict)
      continue
    }
    lib = markApplied(applyPhone(lib, change, traits), change.id)
    applied++
  }
  return { library: lib, conflicts, applied }
}

/** Settles one clash: the phone's way, or keep the computer's (the phone's change is then dropped). */
export function resolvePhone(library: Library, change: PhoneChange, choice: PhoneChoice, traits: Record<string, Trait[]> = {}): Library {
  return markApplied(choice === 'phone' ? applyPhone(library, change, traits) : library, change.id)
}

/** The phone's changes the computer hasn't folded in yet. */
export const pendingChanges = (library: Library, changes: PhoneChange[]): PhoneChange[] => {
  const done = new Set(library.phoneApplied ?? [])
  return changes.filter((c) => !done.has(c.id))
}

/** What the phone shows: the library from Drive with its own not-yet-folded changes on top. */
export function phoneView(library: Library, changes: PhoneChange[]): Library {
  let lib = library
  for (const c of pendingChanges(library, changes).sort((a, b) => a.at.localeCompare(b.at))) lib = applyPhone(lib, c)
  return lib
}

/** A plain-words line for a clash, e.g. "Andor S2 E4: ticked on 12 Nov on your phone, 10 Nov here". */
export function conflictText(c: PhoneConflict, formatDay: (day: string) => string = (d) => d): string {
  if (c.kind === 'removed') return `You removed ${c.name} on this computer, but on your phone you ${c.what}.`
  if (c.kind === 'status') return `${c.name} is ${STATUS_LABELS[c.computer]} here, but your phone marked it ${STATUS_LABELS[c.phone]}.`
  const day = (d: string): string => (d === UNDATED ? 'seen with no date' : formatDay(d))
  const eps = c.episodes.map((e) => `${episodeLabel(e.key)} (phone: ${day(e.phone)}, here: ${day(e.computer)})`)
  return `${c.name}: ${eps.length === 1 ? 'an episode was' : 'episodes were'} ticked on both on different days: ${eps.join(', ')}.`
}

/** A random id for a new change. */
export function newChangeId(): string {
  const bytes = new Uint8Array(9)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')
}
