import type { Recognised } from './watching'

/**
 * Phase 44: the Discord status while you watch ("Watching The Walking Dead · S9 E4"). This part
 * only decides what the status says and how a message to the Discord app is packed; talking to
 * Discord on this computer is in src/main/discord.ts.
 */

/** What Discord calls a status (a "Rich Presence activity"). Only the fields Eclipse uses. */
export interface DiscordActivity {
  /** 3 is "Watching". */
  type: 3
  /** 2: the member list shows the details line ("Watching The Walking Dead · S9 E4") instead of the app's name. */
  status_display_type?: 2
  details: string
  state?: string
  timestamps?: { start: number; end?: number }
  assets?: { large_image?: string; large_text?: string }
  instance: false
}

/** A paused episode keeps its status this long, then it's cleared (you've probably walked off). */
export const PAUSED_FOR = 10 * 60_000

const clip = (s: string): string => (s.length > 128 ? `${s.slice(0, 127)}…` : s)

/**
 * The status for what's playing, or null for none. The episode is only named when the player named
 * it (a guess would be shown to your friends as fact). While it plays, Discord counts down the time
 * left; paused, it says so and the countdown goes.
 */
export function activityFor(r: Recognised | null, posterPath: string | null | undefined, now: number = Date.now()): DiscordActivity | null {
  if (!r) return null
  const ep = r.type === 'tv' && r.season && r.episode && r.sure ? ` · S${r.season} E${r.episode}` : ''
  // Discord wants at least 2 characters in each line.
  const name = r.name.trim().length >= 2 ? r.name.trim() : `${r.name.trim()} `.padEnd(2, ' ')
  const parts = [r.playing ? null : 'Paused', r.service ? `on ${r.service}` : null].filter(Boolean)
  const activity: DiscordActivity = { type: 3, status_display_type: 2, details: clip(`${name}${ep}`), instance: false }
  if (parts.length) activity.state = clip(parts.join(' · '))
  if (r.playing && r.position != null) {
    const start = Math.round(now - r.position * 1000)
    activity.timestamps = r.duration != null && r.duration > r.position ? { start, end: Math.round(start + r.duration * 1000) } : { start }
  }
  if (posterPath) activity.assets = { large_image: `https://image.tmdb.org/t/p/w342${posterPath}`, large_text: clip(r.name) }
  return activity
}

/**
 * Whether the status needs sending again. Discord allows about one change every four seconds, so a
 * clock that has only moved on as expected isn't resent; a jump (you skipped ahead) of over 20
 * seconds is.
 */
export function needsSending(prev: DiscordActivity | null, next: DiscordActivity | null): boolean {
  if (!prev || !next) return prev !== next
  const { timestamps: a, ...restA } = prev
  const { timestamps: b, ...restB } = next
  if (JSON.stringify(restA) !== JSON.stringify(restB)) return true
  if (!a || !b) return !!a !== !!b
  return Math.abs(a.start - b.start) > 20_000 || !!a.end !== !!b.end
}

// ---- The Discord app's local connection ----

/** Message kinds on Discord's local connection. */
export const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const

/** One message: its kind and length (4 bytes each, little-endian), then the JSON. */
export function encodeFrame(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32LE(op, 0)
  head.writeInt32LE(json.length, 4)
  return Buffer.concat([head, json])
}

/** Takes whole messages off the front of what's arrived so far; the rest waits for more. */
export function decodeFrames(buffer: Buffer): { frames: { op: number; data: unknown }[]; rest: Buffer } {
  const frames: { op: number; data: unknown }[] = []
  let at = 0
  while (buffer.length - at >= 8) {
    const op = buffer.readInt32LE(at)
    const len = buffer.readInt32LE(at + 4)
    if (len < 0 || len > 1_000_000) return { frames, rest: Buffer.alloc(0) } // Garbled: drop it.
    if (buffer.length - at - 8 < len) break
    const text = buffer.subarray(at + 8, at + 8 + len).toString('utf8')
    let data: unknown = null
    try {
      data = JSON.parse(text)
    } catch {
      // Not JSON: passed on as null.
    }
    frames.push({ op, data })
    at += 8 + len
  }
  return { frames, rest: buffer.subarray(at) }
}

/** Where the Discord app listens on this computer: Discord, then PTB and Canary take the next numbers. */
export function ipcPaths(platform: string, env: Record<string, string | undefined>): string[] {
  const nums = Array.from({ length: 10 }, (_, i) => i)
  if (platform === 'win32') return nums.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  const dir = (env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp').replace(/\/+$/, '')
  // Linux packages in a sandbox (Flatpak, Snap) put it one folder down.
  const dirs = [dir, ...(platform === 'linux' ? [`${dir}/app/com.discordapp.Discord`, `${dir}/snap.discord`] : [])]
  return dirs.flatMap((d) => nums.map((i) => `${d}/discord-ipc-${i}`))
}

/** A Discord application ID is a long number (17 to 20 digits). */
export const validAppId = (id: string): boolean => /^\d{17,20}$/.test(id.trim())
