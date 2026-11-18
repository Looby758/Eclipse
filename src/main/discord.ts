import { connect, type Socket } from 'net'
import { randomUUID } from 'crypto'
import { activityFor, decodeFrames, encodeFrame, ipcPaths, needsSending, OP, PAUSED_FOR, validAppId, type DiscordActivity } from '@core/discord'
import type { Recognised } from '@core/watching'
import type { DiscordStatus } from '@shared/api'
import { loadSettings, saveSettings } from './settings'

/**
 * Phase 44: "Watching The Walking Dead · S9 E4" on your Discord profile while it plays. Eclipse
 * talks to the Discord app on this computer through the same local connection games use, so
 * nothing goes online from Eclipse (Discord shows it to your friends). Off by default, per computer.
 *
 * Discord needs an "application" to show a status under: you make one, free, on Discord's developer
 * site and paste its ID into Settings. Its name is what Discord shows if someone opens your profile.
 */

type State = 'off' | 'needs-id' | 'not-running' | 'connecting' | 'connected' | 'error'

let socket: Socket | null = null
let ready = false
let state: State = 'off'
let error: string | null = null
let sent: DiscordActivity | null = null
let wanted: DiscordActivity | null = null
let showing: string | null = null
let lastTry = 0
let retry: NodeJS.Timeout | null = null
/** Older Discord apps turn down the "show the details line" field: leave it out after that. */
let plainOnly = false
/** When the current thing was first seen paused. */
let pausedSince: { id: string; at: number } | null = null
let changed: () => void = () => undefined

export const discordOn = (): boolean => !!loadSettings().discordOn
const appId = (): string => (loadSettings().discordAppId ?? '').trim()

export function discordStatus(): DiscordStatus {
  return { on: discordOn(), appId: appId(), state: discordOn() ? state : 'off', error, showing }
}

function setState(next: State, err: string | null = null): void {
  if (next === state && err === error) return
  state = next
  error = err
  changed()
}

function close(): void {
  retry && clearTimeout(retry)
  retry = null
  socket?.removeAllListeners()
  socket?.destroy()
  socket = null
  ready = false
  sent = null
}

function send(activity: DiscordActivity | null): void {
  if (!socket || !ready) return
  const a = activity && plainOnly ? (({ status_display_type: _, ...rest }) => rest)(activity) : activity
  socket.write(encodeFrame(OP.frame, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, ...(a ? { activity: a } : {}) }, nonce: randomUUID() }))
  sent = activity
  showing = activity?.details ?? null
  changed()
}

function flush(): void {
  if (ready && needsSending(sent, wanted)) send(wanted)
}

/** Tries each place the Discord app might be listening, in turn. */
function tryConnect(paths: string[], i = 0): void {
  if (i >= paths.length) {
    setState('not-running', null)
    scheduleRetry()
    return
  }
  const s = connect(paths[i])
  let buffer = Buffer.alloc(0)
  let opened = false
  s.once('connect', () => {
    opened = true
    socket = s
    s.write(encodeFrame(OP.handshake, { v: 1, client_id: appId() }))
  })
  s.on('data', (chunk: Buffer) => {
    const { frames, rest } = decodeFrames(Buffer.concat([buffer, chunk]))
    buffer = Buffer.from(rest)
    for (const f of frames) onFrame(f.op, f.data as Record<string, unknown> | null)
  })
  s.on('error', () => {
    // Not listening here: try the next one. Once connected, 'close' follows and handles it.
    if (!opened) {
      s.destroy()
      tryConnect(paths, i + 1)
    }
  })
  s.on('close', () => {
    if (!opened || socket !== s) return
    socket = null
    ready = false
    sent = null
    // Discord quit (or turned the ID down, already reported): try again later.
    if (state !== 'error') setState('not-running')
    scheduleRetry()
  })
}

function onFrame(op: number, data: Record<string, unknown> | null): void {
  if (op === OP.ping) return void socket?.write(encodeFrame(OP.pong, data ?? {}))
  if (op === OP.close) {
    const code = Number(data?.code)
    const message = String(data?.message ?? '')
    setState('error', code === 4000 || /client id/i.test(message) ? 'Discord didn’t recognise that application ID. Check it’s the Application ID from the General Information page.' : `Discord closed the connection${message ? `: ${message}` : ''}.`)
    return
  }
  if (op !== OP.frame || !data) return
  if (data.evt === 'READY') {
    ready = true
    setState('connected')
    sent = null
    flush()
    return
  }
  if (data.evt === 'ERROR' && data.cmd === 'SET_ACTIVITY') {
    // Turned down: once without the newer field, then say what Discord said.
    if (!plainOnly) {
      plainOnly = true
      sent = null
      flush()
    } else setState('error', `Discord didn’t accept the status: ${String((data.data as { message?: string } | undefined)?.message ?? 'no reason given')}`)
  }
}

function scheduleRetry(): void {
  if (retry || !discordOn()) return
  // Look for Discord again in 30 seconds while something is playing; otherwise wait for it.
  if (wanted) retry = setTimeout(() => {
    retry = null
    ensure()
  }, 30_000)
}

/** Connected when there's something to show, or connecting if it's been a while since the last try. */
function ensure(): void {
  if (!discordOn()) return
  if (!validAppId(appId())) return setState('needs-id')
  if (socket) return flush()
  if (!wanted || Date.now() - lastTry < 15_000) return
  // Discord turned the ID down: don't keep asking (and hide the reason) until a few minutes have passed.
  if (state === 'error' && Date.now() - lastTry < 5 * 60_000) return
  lastTry = Date.now()
  setState('connecting')
  tryConnect(ipcPaths(process.platform, process.env))
}

/** What's playing changed (or was checked again): update the status, or clear it. */
export function updateDiscord(r: Recognised | null, posterPath?: string | null): void {
  if (!discordOn()) return
  const id = r ? `${r.key}@${r.season}:${r.episode}` : ''
  if (r && !r.playing) {
    if (pausedSince?.id !== id) pausedSince = { id, at: Date.now() }
  } else pausedSince = null
  const tooLong = !!pausedSince && Date.now() - pausedSince.at > PAUSED_FOR
  wanted = tooLong ? null : activityFor(r, posterPath)
  if (!wanted && !sent) {
    showing = null
    return
  }
  ensure()
}

export function setupDiscord(onChange: () => void): void {
  changed = onChange
  if (discordOn()) setState(validAppId(appId()) ? 'not-running' : 'needs-id')
}

/** Switches the status on or off, or changes the application ID. Turning it off clears it at once. */
export function setDiscord(patch: { on?: boolean; appId?: string }): DiscordStatus {
  const prevId = appId()
  saveSettings({
    ...(patch.on !== undefined ? { discordOn: !!patch.on } : {}),
    ...(patch.appId !== undefined ? { discordAppId: patch.appId.trim().slice(0, 32) } : {})
  })
  if (!discordOn() || appId() !== prevId) {
    if (socket && ready) send(null)
    // Give the clear a moment to reach Discord before hanging up.
    const s = socket
    socket = null
    ready = false
    sent = null
    setTimeout(() => {
      s?.removeAllListeners()
      s?.destroy()
    }, 300)
    retry && clearTimeout(retry)
    retry = null
    showing = null
    plainOnly = false
    lastTry = 0
    setState(discordOn() ? 'not-running' : 'off')
  }
  if (discordOn()) {
    if (!validAppId(appId())) setState('needs-id')
    else {
      lastTry = 0
      ensure()
    }
  }
  changed()
  return discordStatus()
}

export function stopDiscord(): void {
  if (socket && ready) send(null)
  close()
}
