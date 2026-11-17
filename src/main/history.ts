import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { localDate } from '@core/library'
import { SERVICES, type Visit } from '@core/watching'

/**
 * Phase 27: Eclipse notices what you watched. Chrome and Edge keep your browsing history in a small
 * database file on this computer. Eclipse copies it (the browser keeps the original locked while
 * it's open) and reads only visits to streaming sites from it. It never changes the browser's files,
 * and nothing leaves this computer.
 */

export interface Browser {
  name: string
  /** Each profile's History file. */
  files: string[]
}

function profileFiles(root: string): string[] {
  if (!existsSync(root)) return []
  try {
    return readdirSync(root)
      .filter((d) => d === 'Default' || /^Profile \d+$/.test(d))
      .map((d) => join(root, d, 'History'))
      .filter((f) => existsSync(f))
  } catch {
    return []
  }
}

export function browsers(): Browser[] {
  const home = homedir()
  const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const roots: [string, string][] =
    process.platform === 'win32'
      ? [
          ['Chrome', join(local, 'Google', 'Chrome', 'User Data')],
          ['Edge', join(local, 'Microsoft', 'Edge', 'User Data')]
        ]
      : process.platform === 'darwin'
        ? [
            ['Chrome', join(home, 'Library', 'Application Support', 'Google', 'Chrome')],
            ['Edge', join(home, 'Library', 'Application Support', 'Microsoft Edge')]
          ]
        : [
            ['Chrome', join(home, '.config', 'google-chrome')],
            ['Edge', join(home, '.config', 'microsoft-edge')]
          ]
  return roots.map(([name, root]) => ({ name, files: profileFiles(root) })).filter((b) => b.files.length)
}

// Chrome counts time in microseconds since 1 January 1601.
const EPOCH_GAP_MS = 11_644_473_600_000
const toChrome = (ms: number): bigint => BigInt(ms + EPOCH_GAP_MS) * 1000n
const fromChrome = (t: number | bigint): number => Number(BigInt(t) / 1000n) - EPOCH_GAP_MS

/** The sites to look for in history ("disneyplus.com", "nowtv.com" …). */
export const STREAMING_HOSTS = ['disneyplus.com', 'nowtv.com', 'netflix.com', 'primevideo.com', 'bbc.co.uk/iplayer', 'itv.com', 'channel4.com', 'tv.apple.com', 'paramountplus.com']

/** Visits to streaming sites since a time (milliseconds), from every Chrome and Edge profile. */
export async function streamingVisits(sinceMs: number): Promise<{ visits: Visit[]; browsers: string[]; errors: string[] }> {
  // node:sqlite is built into Electron's Node (marked experimental, so loaded only when needed).
  const { DatabaseSync } = await import('node:sqlite')
  const like = STREAMING_HOSTS.map(() => 'u.url LIKE ?').join(' OR ')
  const dir = join(app.getPath('temp') || tmpdir(), `eclipse-history-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  const visits: Visit[] = []
  const found: string[] = []
  const errors: string[] = []
  try {
    for (const b of browsers()) {
      for (const [i, file] of b.files.entries()) {
        const copy = join(dir, `${b.name}-${i}.sqlite`)
        try {
          copyFileSync(file, copy)
          const db = new DatabaseSync(copy, { readOnly: true })
          try {
            const rows = db
              .prepare(`SELECT u.url AS url, u.title AS title, v.visit_time AS t FROM visits v JOIN urls u ON v.url = u.id WHERE v.visit_time > ? AND (${like}) ORDER BY v.visit_time LIMIT 5000`)
              .all(toChrome(sinceMs), ...STREAMING_HOSTS.map((h) => `%${h}%`)) as { url: string; title: string | null; t: number | bigint }[]
            for (const r of rows) {
              const at = fromChrome(r.t)
              visits.push({ url: r.url, title: r.title ?? '', at, day: localDate(new Date(at)) })
            }
            if (!found.includes(b.name)) found.push(b.name)
          } finally {
            db.close()
          }
        } catch (err) {
          errors.push(`${b.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return { visits: visits.filter((v) => SERVICES.some((s) => s.hosts.test(new URL(v.url).hostname))), browsers: found, errors }
}
