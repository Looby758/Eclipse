import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * The app's own settings (settings.json in the app's data folder, not synced), the same way Orbit
 * keeps its settings. Your library lives in the data folder you pick instead.
 */
export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export interface Settings {
  /** Where library.json lives: a folder you pick, e.g. inside Google Drive. */
  dataFolder: string | null
  /** The TMDB key, encrypted with the system's own protection (see tmdbKey.ts). */
  tmdbKey?: string
  window?: WindowBounds
  /** Phase 23: the phone remote is switched on (this computer only), and its pairing code. */
  remoteOn?: boolean
  remoteToken?: string
  /** Phase 26: show Eclipse in the menu bar / tray, and keep running there when the window is closed. */
  trayOn?: boolean
  /** Phases 27 to 29: notice what you watch (browser history, what's playing) and the bedtime guard. */
  noticeHistory?: boolean
  noticePlaying?: boolean
  bedtimeGuard?: boolean
  /** Browser history has been read up to here (milliseconds). */
  historySince?: number
}

const defaults: Settings = { dataFolder: null }

export const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = existsSync(settingsFile()) ? { ...defaults, ...JSON.parse(readFileSync(settingsFile(), 'utf8')) } : { ...defaults }
  } catch {
    cache = { ...defaults }
  }
  return cache!
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cache = { ...loadSettings(), ...patch }
  // Write to a temp file then rename, so a crash mid-write never corrupts settings.
  const file = settingsFile()
  writeFileSync(`${file}.tmp`, JSON.stringify(cache, null, 2), 'utf8')
  renameSync(`${file}.tmp`, file)
  return cache
}
