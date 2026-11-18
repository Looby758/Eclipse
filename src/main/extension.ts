import { app, shell } from 'electron'
import { createServer, type Server } from 'http'
import { join } from 'path'
import { fromExtension } from '@core/watching'
import { addExtensionItem, removeExtensionItem } from './nowplaying'

/**
 * The Eclipse extension for Chrome (extension/ in the repository, shipped with the app): while a
 * Disney+, NOW or other player is open, it reads which episode the player says is on and how far in
 * you are, and sends it here. Only this computer can reach it (127.0.0.1), and only a browser
 * extension can send to it: a web page can't fake the chrome-extension:// origin.
 */

export const EXTENSION_PORT = 47615

let server: Server | null = null
let lastAt: number | null = null
let error: string | null = null

const fromExtensionOrigin = (origin: string | undefined): boolean => !!origin && /^(chrome|moz)-extension:\/\//.test(origin)

export function startExtensionLink(onUpdate: () => void): void {
  if (server) return
  error = null
  const s = createServer((req, res) => {
    const send = (code: number, body: object): void => {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    // The popup's "Connected?" check says only that Eclipse is here (Chrome may not label it).
    if (req.method === 'GET' && req.url === '/hello' && (!req.headers.origin || fromExtensionOrigin(req.headers.origin))) return send(200, { ok: true, app: 'Eclipse' })
    if (!fromExtensionOrigin(req.headers.origin)) return send(403, { ok: false })
    if (req.method !== 'POST' || (req.url !== '/playing' && req.url !== '/gone')) return send(404, { ok: false })
    const gone = req.url === '/gone'
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 32_000) req.destroy()
    })
    req.on('end', () => {
      let item = null
      try {
        const parsed = JSON.parse(body)
        // A tab was closed or went elsewhere: it isn't playing any more.
        if (gone) {
          if (typeof parsed?.url === 'string') removeExtensionItem(parsed.url)
          onUpdate()
          return send(200, { ok: true })
        }
        item = fromExtension(parsed)
      } catch {
        // Not JSON: ignored below.
      }
      if (!item) return send(400, { ok: false })
      lastAt = Date.now()
      addExtensionItem(item)
      onUpdate()
      send(200, { ok: true })
    })
  })
  s.on('error', (err: NodeJS.ErrnoException) => {
    error = err.code === 'EADDRINUSE' ? `Port ${EXTENSION_PORT} is in use by another app, so the Chrome extension can’t reach Eclipse.` : err.message
    if (server === s) server = null
  })
  s.listen(EXTENSION_PORT, '127.0.0.1')
  server = s
}

export function stopExtensionLink(): void {
  server?.close()
  server = null
}

/** Where the extension's files are: shipped beside the app, or the repository's folder in development. */
export const extensionFolder = (): string => (app.isPackaged ? join(process.resourcesPath, 'extension') : join(app.getAppPath(), 'extension'))

export function showExtensionFolder(): void {
  void shell.openPath(extensionFolder())
}

/** When the extension last sent something, and anything stopping it from reaching Eclipse. */
export const extensionLink = (): { lastAt: number | null; error: string | null; folder: string } => ({ lastAt, error, folder: extensionFolder() })
