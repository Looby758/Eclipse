/**
 * The two-computer guard. Your library lives in one file, library.json, in a synced folder, and
 * two copies of Eclipse saving it at once (one on the PC, one on the Mac) would overwrite each
 * other's changes. So only one copy saves at a time, and it's the computer you're using.
 *
 * Each open copy keeps its own small file in the data folder, eclipse-open-<computer>.json, saying
 * when someone last used that computer (keyboard or mouse, in any app), whether it's saving, and
 * how many saves library.json had when it last saw it. Every copy reads the others' files and
 * comes to the same answer:
 *
 * - The copy that's saving keeps saving while you're using that computer. Once it's been left for
 *   a minute and you've used the other computer more recently, it steps back.
 * - The other one then starts saving, but only once Drive has brought it library.json with every
 *   save the first one made, so nothing is lost. Until then (usually seconds) ticks and status
 *   changes made there are handed over (see handoff.ts) rather than refused.
 * - A copy that's asleep, crashed or offline stops refreshing its file and is ignored after a few
 *   minutes. A copy that quits says so, so the other can carry on once it's caught up.
 *
 * Each file has one writer (its own computer), so Drive never makes clashing copies.
 */

export const PRESENCE_PREFIX = 'eclipse-open-'
/** The single marker earlier versions kept (one copy had the folder until it closed). */
export const OLD_MARKER_FILE = 'eclipse-open.json'
/** How often each copy looks at the others. */
export const CHECK_MS = 5_000
/** A copy writes its file at least this often, even when nothing's changed. */
export const HEARTBEAT_MS = 60_000
/** A file not refreshed for this long was left behind (asleep, crashed, Drive offline). */
export const STALE_MS = 3 * 60_000
/** Left this long, a computer counts as not in use, and the other may take over saving. */
export const IDLE_MS = 60_000

export type Platform = 'mac' | 'win' | 'linux'

export interface Presence {
  /** The computer's name, e.g. "Loobys-MacBook-Air" or "DESKTOP-4F2K9". */
  computer: string
  platform: Platform
  /** Different every time Eclipse starts. */
  session: string
  /** ISO times: when this copy opened, when it last wrote this file, and when someone last used the computer. */
  since: string
  seen: string
  active: string
  /** This copy is the one saving library.json. */
  saving: boolean
  /** How many saves library.json had when this copy last saved or read it. */
  saves: number
  /** Eclipse was closed here. */
  closed?: boolean
}

/** This copy, as it decides. */
export interface Me {
  computer: string
  session: string
  /** When someone last used this computer (ms). */
  active: number
  saving: boolean
  /** Saves in the library.json this copy has. */
  saves: number
  /** "Take over" was pressed: save here now, without waiting. */
  forced?: boolean
}

export interface Decision {
  saving: boolean
  /** The other computer's copy that matters right now (the one you were on, or the one being caught up with). */
  other: Presence | null
  /** Why this copy isn't saving: the other computer is in use, or this one's waiting for Drive to bring the latest library. */
  waiting: null | 'in-use' | 'catching-up'
}

/** "DESKTOP-4F2K9" → "eclipse-open-desktop-4f2k9.json". */
export function presenceFileName(computer: string): string {
  const slug = computer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${PRESENCE_PREFIX}${slug || 'computer'}.json`
}

/** Only exact names: Drive's "eclipse-open-x (1).json" conflict copies are left alone. */
export const isPresenceFileName = (name: string): boolean => /^eclipse-open-[a-z0-9-]+\.json$/.test(name)

const time = (iso: string): number => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** Whether this copy should be saving, given the other computers' files. */
export function decide(me: Me, others: Presence[], now: number): Decision {
  const peers = others.filter((p) => p.computer !== me.computer && now - time(p.seen) <= STALE_MS)
  // Every recent save, from a copy that's open or one that just closed, must have reached this copy before it saves.
  const ahead = peers.filter((p) => p.saves > me.saves).sort((a, b) => b.saves - a.saves)[0] ?? null
  const open = peers.filter((p) => !p.closed).sort((a, b) => time(b.active) - time(a.active))
  const other = open[0] ?? null

  if (!other) {
    if (ahead && !me.forced) return { saving: false, other: ahead, waiting: 'catching-up' }
    return { saving: true, other: null, waiting: null }
  }
  const there = time(other.active)

  if (me.saving) {
    // Both saving (they started at the same moment, or the other pressed Take over): the more recently used one keeps it.
    const clash = other.saving && there > me.active
    // You've moved to the other computer.
    const moved = there > me.active && now - me.active >= IDLE_MS
    return clash || moved ? { saving: false, other, waiting: 'in-use' } : { saving: true, other, waiting: null }
  }

  const tie = there === me.active && me.session > other.session
  const mine = me.forced || ((me.active > there || tie) && (!other.saving || now - there >= IDLE_MS))
  if (!mine) return { saving: false, other, waiting: 'in-use' }
  if (me.forced) return { saving: true, other, waiting: null }
  // It's this computer's turn: wait for the other to step back, and for its saves to sync in.
  if (other.saving || ahead) return { saving: false, other: other.saving ? other : ahead, waiting: 'catching-up' }
  return { saving: true, other, waiting: null }
}

/** Reads a presence file's text, or null if it's missing, half-synced or not one. */
export function parsePresence(text: string | null): Presence | null {
  if (!text) return null
  try {
    const p = JSON.parse(text) as Partial<Presence>
    if (typeof p.computer !== 'string' || typeof p.session !== 'string' || typeof p.since !== 'string' || typeof p.seen !== 'string' || typeof p.active !== 'string') return null
    const platform: Platform = p.platform === 'mac' || p.platform === 'win' ? p.platform : 'linux'
    const saves = typeof p.saves === 'number' && Number.isFinite(p.saves) && p.saves >= 0 ? Math.floor(p.saves) : 0
    return { computer: p.computer.slice(0, 80), platform, session: p.session, since: p.since, seen: p.seen, active: p.active, saving: p.saving === true, saves, ...(p.closed === true ? { closed: true } : {}) }
  } catch {
    return null
  }
}

/** "Loobys-MacBook-Air.local" → "Loobys-MacBook-Air". */
export const computerName = (hostname: string): string => hostname.replace(/\.(local|lan|home)$/i, '') || 'another computer'
