/**
 * Claude Desktop connection (main/claudeDesktop.ts): a small MCP server inside Eclipse, reachable
 * only from this computer, that the Claude Desktop app talks to (through a bridge it starts, see
 * BRIDGE_SCRIPT), so you can ask Claude to tick episodes, add things to your watchlist, look at your
 * stats and so on. Built the same way as Orbit's. Off until you switch it on in Settings, and each
 * part can be left out.
 */

// ---------- The parts of Eclipse Claude can use ----------

export type ClaudeArea = 'library' | 'tracking' | 'discover' | 'evenings' | 'settings'

export const CLAUDE_AREAS: readonly { id: ClaudeArea; label: string; what: string; onAtStart: boolean }[] = [
  {
    id: 'library',
    label: 'Your library and stats',
    what: 'Read what you’re watching, your watchlist, Watch soon, lists, what’s up next, what you watched when, your stats and your release calendar.',
    onAtStart: true
  },
  {
    id: 'tracking',
    label: 'Ticking and changing things',
    what: 'Tick episodes and films, change statuses, ratings, notes, reactions and dates, rewatches, Watch soon, countdowns, favourites and your own lists. Every change can be undone with the Undo bar or Ctrl+Z.',
    onAtStart: true
  },
  {
    id: 'discover',
    label: 'Search and recommendations',
    what: 'Search TMDB for films, shows and people, see where to watch, your recommendations, and answer them (Interested or Not for me).',
    onAtStart: true
  },
  {
    id: 'evenings',
    label: 'Your evenings',
    what: 'Tonight’s time before bed, your week, your weekly budget, and changing tonight (“not watching tonight”, “bed 30 min later”) or your usual evenings and services.',
    onAtStart: true
  },
  {
    id: 'settings',
    label: 'App settings',
    what: 'Switch the tray, Discord status, noticing what you watch and starting with the computer on or off, and change the text size.',
    onAtStart: true
  }
]

export const defaultAreas = (): Record<ClaudeArea, boolean> => Object.fromEntries(CLAUDE_AREAS.map((a) => [a.id, a.onAtStart])) as Record<ClaudeArea, boolean>

/** Saved switches, with anything missing or odd put back to its default. */
export function cleanAreas(raw: unknown): Record<ClaudeArea, boolean> {
  const out = defaultAreas()
  if (raw && typeof raw === 'object') for (const a of CLAUDE_AREAS) if (typeof (raw as Record<string, unknown>)[a.id] === 'boolean') out[a.id] = (raw as Record<string, boolean>)[a.id]
  return out
}

export interface ClaudeDesktopStatus {
  on: boolean
  areas: Record<ClaudeArea, boolean>
  /** Eclipse has been added to Claude Desktop's settings file on this computer. */
  connected: boolean
  /** This computer can encrypt the secret code (needed to switch it on). */
  canEncrypt: boolean
  error?: string
}

export interface ConnectResult {
  /** Eclipse wrote Claude Desktop's settings file itself. */
  written: boolean
  /** The file it wrote (or where the text below goes). */
  file: string
  /** What to paste, when Eclipse couldn't write it. */
  text?: string
  message: string
}

// ---------- Connecting Claude Desktop ----------

/** The name Eclipse has in Claude Desktop's list of connectors. */
export const SERVER_NAME = 'eclipse'

export interface BridgeEntry {
  command: string
  args: string[]
  env: Record<string, string>
}

/**
 * How Claude Desktop starts the bridge: Eclipse's own program, run as plain Node (so nothing else
 * needs installing), with the bridge script and where to find Eclipse.
 */
export function bridgeEntry(execPath: string, script: string, portFile: string, token: string): BridgeEntry {
  return { command: execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1', ECLIPSE_PORT_FILE: portFile, ECLIPSE_TOKEN: token } }
}

/**
 * Claude Desktop's settings with Eclipse added (or updated), keeping everything else as it was
 * (Orbit's entry included). Throws when the file isn't valid JSON, so a hand-edited file is never
 * overwritten.
 */
export function withEclipseServer(existing: string | null, entry: BridgeEntry): string {
  let config: Record<string, unknown> = {}
  if (existing && existing.trim()) {
    const parsed = JSON.parse(existing) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Claude Desktop’s settings file isn’t in the form Eclipse expected.')
    config = parsed as Record<string, unknown>
  }
  const servers = config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers) ? (config.mcpServers as Record<string, unknown>) : {}
  return JSON.stringify({ ...config, mcpServers: { ...servers, [SERVER_NAME]: entry } }, null, 2) + '\n'
}

/** Claude Desktop's settings without Eclipse (when you remove it), or null when it isn't there. */
export function withoutEclipseServer(existing: string): string | null {
  const config = JSON.parse(existing) as Record<string, unknown>
  const servers = config.mcpServers as Record<string, unknown> | undefined
  if (!servers || typeof servers !== 'object' || !(SERVER_NAME in servers)) return null
  const { [SERVER_NAME]: _gone, ...rest } = servers
  return JSON.stringify({ ...config, mcpServers: rest }, null, 2) + '\n'
}

/** Whether Claude Desktop's settings already start Eclipse's bridge with this secret code. */
export function hasEclipseServer(existing: string | null, token: string): boolean {
  if (!existing) return false
  try {
    const entry = (JSON.parse(existing) as { mcpServers?: Record<string, BridgeEntry> }).mcpServers?.[SERVER_NAME]
    return !!entry && entry.env?.ECLIPSE_TOKEN === token
  } catch {
    return false
  }
}

/**
 * The bridge Claude Desktop runs: it reads Claude's messages (one JSON message a line) and passes
 * each to Eclipse's server on this computer, and Eclipse's answers back. Plain Node with nothing to
 * install, written next to Eclipse's settings when you connect. The port is read from a file each
 * time, so it keeps working if the port changes after a restart.
 */
export const BRIDGE_SCRIPT = `// Eclipse's bridge for Claude Desktop. Eclipse writes this file; changes are replaced.
'use strict'
const http = require('http')
const fs = require('fs')
const readline = require('readline')

const portFile = process.env.ECLIPSE_PORT_FILE
const token = process.env.ECLIPSE_TOKEN || ''
const CLOSED = 'Eclipse isn’t open, or its Claude Desktop connection is switched off. Open Eclipse and try again.'
let session = null

function port() {
  try {
    const p = JSON.parse(fs.readFileSync(portFile, 'utf8')).port
    return Number.isInteger(p) ? p : null
  } catch (e) {
    return null
  }
}

function reply(id, message) {
  if (id === undefined || id === null) return
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32000, message: message } }) + '\\n')
}

function send(line) {
  return new Promise(function (resolve) {
    let msg
    try {
      msg = JSON.parse(line)
    } catch (e) {
      return resolve()
    }
    const p = port()
    if (!p) {
      reply(msg.id, CLOSED)
      return resolve()
    }
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + token }
    if (session) headers['Mcp-Session-Id'] = session
    const req = http.request({ host: '127.0.0.1', port: p, path: '/mcp', method: 'POST', headers: headers }, function (res) {
      const sid = res.headers['mcp-session-id']
      if (sid) session = String(sid)
      let body = ''
      res.setEncoding('utf8')
      res.on('data', function (c) { body += c })
      res.on('end', function () {
        if (res.statusCode === 401) reply(msg.id, 'Eclipse didn’t accept the connection. In Eclipse, open Settings → Claude Desktop and press Connect to Claude Desktop again, then restart Claude Desktop.')
        else if (res.statusCode === 404 && session) {
          session = null
          reply(msg.id, 'Eclipse restarted. Ask again.')
        } else if (body.trim()) {
          const type = String(res.headers['content-type'] || '')
          if (type.indexOf('text/event-stream') !== -1) {
            body.split('\\n').forEach(function (l) {
              if (l.indexOf('data:') === 0 && l.slice(5).trim()) process.stdout.write(l.slice(5).trim() + '\\n')
            })
          } else process.stdout.write(body.trim() + '\\n')
        }
        resolve()
      })
    })
    req.on('error', function () {
      reply(msg.id, CLOSED)
      resolve()
    })
    req.end(line)
  })
}

let queue = Promise.resolve()
const lines = readline.createInterface({ input: process.stdin })
lines.on('line', function (line) {
  if (line.trim()) queue = queue.then(function () { return send(line) })
})
// Claude Desktop closed the pipe: finish what's asked, let the last answers reach it, then stop.
lines.on('close', function () {
  queue.then(function () {
    process.stdout.write('', function () { process.exit(0) })
  })
})
`

/** Where Claude Desktop keeps its settings on Windows (both installs), Mac and Linux. */
export function claudeConfigPaths(platform: NodeJS.Platform, env: { home: string; appData?: string; localAppData?: string; packages?: string[] }): string[] {
  if (platform === 'darwin') return [`${env.home}/Library/Application Support/Claude/claude_desktop_config.json`]
  if (platform === 'win32') {
    const out: string[] = []
    if (env.appData) out.push(`${env.appData}\\Claude\\claude_desktop_config.json`)
    // The Microsoft Store version keeps its own copy.
    for (const p of env.packages ?? []) if (env.localAppData) out.push(`${env.localAppData}\\Packages\\${p}\\LocalCache\\Roaming\\Claude\\claude_desktop_config.json`)
    return out
  }
  return [`${env.home}/.config/Claude/claude_desktop_config.json`]
}

/** What a page of Eclipse Claude can open. */
export type ClaudePage = 'home' | 'library' | 'search' | 'settings' | 'lists' | 'soon' | 'stats' | 'timeline' | 'year' | 'shelf' | 'favourites' | 'picks' | 'services'

export const CLAUDE_PAGES: readonly ClaudePage[] = ['home', 'library', 'search', 'settings', 'lists', 'soon', 'stats', 'timeline', 'year', 'shelf', 'favourites', 'picks', 'services']

/** What the window is asked to show: a page, or a film or show's page. */
export type ClaudeShow = { page: ClaudePage } | { title: { type: 'movie' | 'tv'; id: number } }
