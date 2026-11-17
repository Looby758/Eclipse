import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import { randomBytes } from 'crypto'
import { preferencesOf, setEpisodes, setPreferences } from '@core/library'
import { newRemoteToken, remoteState, sameToken, tonightChange, type RemoteState, type TonightAction } from '@core/remote'
import { episodeKey } from '@core/types'
import { watchSoonOf } from '@core/watchsoon'
import type { RemoteStatus } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { getLibrary, saveLibrary } from './library'
import * as tmdb from './tmdb'
import { remotePage } from './remotePage'

/**
 * Phase 23: your phone as a remote. While it's switched on, Eclipse serves a small page on your home
 * Wi-Fi. The address carries a random pairing code (shown as a QR code in Settings), so other
 * people on the network can't use it. Nothing goes online, and it stops when Eclipse quits.
 */

export const REMOTE_PORT = 47823

let server: Server | null = null
let error: string | null = null
let onChange: () => void = () => undefined

/** This computer's address on the home network (192.168…, 10…, 172.16–31…). */
export function lanAddress(): string | null {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address)
  const home = all.find((a) => /^192\.168\./.test(a)) ?? all.find((a) => /^10\./.test(a)) ?? all.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a))
  return home ?? all[0] ?? null
}

function token(): string {
  const s = loadSettings()
  if (s.remoteToken) return s.remoteToken
  const t = newRemoteToken((n) => randomBytes(n))
  saveSettings({ remoteToken: t })
  return t
}

export function remoteStatus(): RemoteStatus {
  const on = !!loadSettings().remoteOn
  const address = lanAddress()
  return {
    on,
    running: !!server?.listening,
    url: on && address && server?.listening ? `http://${address}:${REMOTE_PORT}/?t=${token()}` : null,
    error
  }
}

/** Ticks one episode (on your rewatch, if you're on one). False if the show has gone. Throws while read-only. */
export function tickEpisode(key: string, season: number, episode: number): boolean {
  const e = getLibrary().entries[key]
  if (!e || !Number.isInteger(season) || !Number.isInteger(episode)) return false
  saveLibrary(setEpisodes(getLibrary(), { key: e.key, type: e.type, id: e.id, title: e.title }, [episodeKey(season, episode)], true))
  return true
}

/** What the phone page (and the tray menu) shows. */
export async function state(): Promise<RemoteState> {
  const lib = getLibrary()
  const keys = [...Object.values(lib.entries).filter((e) => e.type === 'tv' && e.status === 'watching').map((e) => e.key as string), ...watchSoonOf(lib).map((r) => r.key as string)]
  const details = tmdb.hasKey() ? await tmdb.detailsMany(keys) : {}
  return remoteState(getLibrary(), details, preferencesOf(getLibrary()), new Date())
}

function send(res: ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
  res.end(body)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 4096) {
        reject(new Error('Too big'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://remote')
  if (!sameToken(url.searchParams.get('t') ?? '', token())) return send(res, 403, 'Scan the QR code in Eclipse (Settings → Your phone as a remote) to open this.', 'text/plain; charset=utf-8')
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, remotePage(), 'text/html; charset=utf-8')
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, JSON.stringify(await state()))
  if (req.method === 'POST' && url.pathname === '/api/tick') {
    try {
      const { key, season, episode } = JSON.parse(await readBody(req)) as { key: string; season: number; episode: number }
      if (!tickEpisode(key, season, episode)) return send(res, 400, JSON.stringify({ error: 'That show isn’t in your library any more.' }))
      onChange()
      return send(res, 200, JSON.stringify(await state()))
    } catch (err) {
      // Read-only (open on the other computer) or no data folder: say why.
      return send(res, 409, JSON.stringify({ error: err instanceof Error ? err.message : 'Couldn’t tick it.' }))
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/tonight') {
    try {
      const { action } = JSON.parse(await readBody(req)) as { action: TonightAction }
      if (!['off', 'later', 'usual'].includes(action)) return send(res, 400, JSON.stringify({ error: 'Unknown change.' }))
      const lib = getLibrary()
      saveLibrary(setPreferences(lib, { justTonight: tonightChange(preferencesOf(lib), new Date(), action) }))
      onChange()
      return send(res, 200, JSON.stringify(await state()))
    } catch (err) {
      return send(res, 409, JSON.stringify({ error: err instanceof Error ? err.message : 'Couldn’t change tonight.' }))
    }
  }
  send(res, 404, JSON.stringify({ error: 'Not found' }))
}

function start(notify: (s: RemoteStatus) => void): Promise<void> {
  if (server) return Promise.resolve()
  error = null
  const s = createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, JSON.stringify({ error: 'Something went wrong.' })))
  })
  server = s
  return new Promise((resolve) => {
    s.on('error', (e: NodeJS.ErrnoException) => {
      error = e.code === 'EADDRINUSE' ? `Port ${REMOTE_PORT} is already in use by something else on this computer.` : e.message
      server = null
      notify(remoteStatus())
      resolve()
    })
    s.listen(REMOTE_PORT, '0.0.0.0', () => {
      notify(remoteStatus())
      resolve()
    })
  })
}

function stop(): void {
  server?.close()
  server = null
}

/** Starts the remote if it was left on. `changed` is called after a tick from the phone. */
export function setupRemote(changed: () => void, notify: (s: RemoteStatus) => void): void {
  onChange = changed
  if (loadSettings().remoteOn) void start(notify)
}

export async function setRemote(on: boolean, notify: (s: RemoteStatus) => void): Promise<RemoteStatus> {
  saveSettings({ remoteOn: on })
  if (on) await start(notify)
  else stop()
  return remoteStatus()
}

/** A new pairing code: phones that scanned the old one can't use it any more. */
export function newRemoteCode(): RemoteStatus {
  saveSettings({ remoteToken: newRemoteToken((n) => randomBytes(n)) })
  return remoteStatus()
}

export const stopRemote = stop

