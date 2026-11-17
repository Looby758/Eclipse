/**
 * The two-computer guard. Your library lives in a synced folder, and two copies of Eclipse saving
 * it at once (one on the PC, one on the Mac) would overwrite each other's changes. So while
 * Eclipse is open it keeps a small marker file in the data folder, refreshed every minute. A copy
 * that finds a fresh marker from another computer opens read-only until that one closes, or until
 * you take over.
 */

export const MARKER_FILE = 'eclipse-open.json'
/** How often the open copy refreshes its marker. */
export const REFRESH_MS = 60_000
/** A marker not refreshed for this long was left behind (a crash, a sleeping laptop, Drive offline). */
export const STALE_MS = 5 * 60_000

export interface Marker {
  /** The computer's name, e.g. "Loobys-MacBook-Air" or "DESKTOP-4F2K9". */
  computer: string
  platform: 'mac' | 'win' | 'linux'
  /** Different every time Eclipse starts. */
  session: string
  /** ISO times: when this copy opened, and when it last said it's still open. */
  since: string
  seen: string
}

export interface Me {
  computer: string
  session: string
}

/**
 * Whose the folder is right now. "mine": this copy's marker. "free": no marker, or one that was
 * left behind (stale, or from an earlier run on this same computer). "other": another computer
 * has Eclipse open.
 */
export function judge(marker: Marker | null, me: Me, now: Date): 'mine' | 'free' | 'other' {
  if (!marker) return 'free'
  if (marker.session === me.session) return 'mine'
  if (marker.computer === me.computer) return 'free'
  const seen = Date.parse(marker.seen)
  if (!Number.isFinite(seen) || now.getTime() - seen > STALE_MS) return 'free'
  return 'other'
}

/** Reads a marker file's text, or null if it's missing, half-synced or not a marker. */
export function parseMarker(text: string | null): Marker | null {
  if (!text) return null
  try {
    const m = JSON.parse(text) as Partial<Marker>
    if (typeof m.computer !== 'string' || typeof m.session !== 'string' || typeof m.since !== 'string' || typeof m.seen !== 'string') return null
    const platform = m.platform === 'mac' || m.platform === 'win' ? m.platform : 'linux'
    return { computer: m.computer.slice(0, 80), platform, session: m.session, since: m.since, seen: m.seen }
  } catch {
    return null
  }
}

/** "Loobys-MacBook-Air.local" → "Loobys-MacBook-Air". */
export const computerName = (hostname: string): string => hostname.replace(/\.(local|lan|home)$/i, '') || 'another computer'
