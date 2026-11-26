import { copyFileSync, existsSync, readFileSync, renameSync, statSync, unwatchFile, watchFile, writeFileSync } from 'fs'
import { join } from 'path'
import { emptyLibrary, normalizeLibrary } from '@core/library'
import type { Library } from '@core/types'

/**
 * library.json in your data folder: plain, readable JSON (so Orbit, or you, can read it too).
 * Google Drive syncs the folder between your computers; when the file changes underneath us (it
 * arrived from the other computer), the window is told so it shows the new copy.
 */

export const LIBRARY_FILE = 'library.json'

let folder: string | null = null
let current: Library = emptyLibrary()
/** The last text we wrote or read, so our own saves aren't mistaken for synced changes. */
let lastText = ''
let stopWatching: (() => void) | null = null
/** The file couldn't be read when opened: it's backed up before the first save replaces it. */
let unreadable = false
/** Says why saving isn't allowed right now (another computer has Eclipse open), or null. */
let blocked: () => string | null = () => null

export const isDirectory = (path: string | null | undefined): path is string => {
  try {
    return !!path && statSync(path).isDirectory()
  } catch {
    return false
  }
}

function readFromDisk(file: string): Library {
  if (!existsSync(file)) return emptyLibrary()
  const text = readFileSync(file, 'utf8')
  lastText = text
  return normalizeLibrary(JSON.parse(text))
}

/** Opens the library in `dataFolder` (or closes it with null). */
export function openLibrary(dataFolder: string | null, onChange: (library: Library) => void, readOnly: () => string | null = () => null): void {
  blocked = readOnly
  stopWatching?.()
  stopWatching = null
  folder = isDirectory(dataFolder) ? dataFolder : null
  current = emptyLibrary()
  lastText = ''
  unreadable = false
  if (!folder) return
  const file = join(folder, LIBRARY_FILE)
  try {
    current = readFromDisk(file)
  } catch {
    // Half-synced or hand-broken: start from what we can, and don't overwrite it until you change something.
    current = emptyLibrary()
    unreadable = true
  }
  const listener = (): void => {
    try {
      const text = readFileSync(file, 'utf8')
      if (text === lastText) return
      current = normalizeLibrary(JSON.parse(text))
      lastText = text
      unreadable = false
      onChange(current)
    } catch {
      // Mid-sync or invalid JSON: wait until it's valid again.
    }
  }
  watchFile(file, { interval: 1500 }, listener)
  stopWatching = () => unwatchFile(file, listener)
}

/**
 * What the library looks like here: the saved copy, with any changes this copy has handed to the
 * other computer (see handoff.ts) shown on top until they come back saved.
 */
let view: (library: Library) => Library = (library) => library
let viewStamp = 0
let cached: { base: Library; stamp: number; out: Library } | null = null

/** Hands a change over while read-only, returning the library as shown here, or null if it can't be. */
let handOff: (from: Library, to: Library) => Library | null = () => null
export const setHandOff = (fn: typeof handOff): void => void (handOff = fn)

export function setLibraryView(fn: (library: Library) => Library): void {
  view = fn
  refreshLibraryView()
}
/** What `view` shows has changed (a change was handed over or tidied away). */
export const refreshLibraryView = (): void => void viewStamp++

export function getLibrary(): Library {
  if (cached?.base !== current || cached.stamp !== viewStamp) cached = { base: current, stamp: viewStamp, out: view(current) }
  return cached.out
}
/** How many saves the library.json this copy has had. */
export const librarySaves = (): number => current.saves ?? 0
/** The library as saved in library.json, without handed-over changes on top. */
export const getSavedLibrary = (): Library => current

const saveListeners: (() => void)[] = []
/** Called after every save made here (the tray menu follows along). */
export const onSave = (fn: () => void): void => void saveListeners.push(fn)

export function saveLibrary(library: Library): Library {
  if (!folder) throw new Error('Choose a data folder first.')
  const reason = blocked()
  if (reason) {
    // Read-only: ticks and status changes are handed to the copy that's saving (see handoff.ts).
    const handed = handOff(getLibrary(), library)
    if (handed) return handed
    throw new Error(reason)
  }
  // Counted, so the other computer knows when it has every save before it takes over (see guard.ts).
  current = { ...library, saves: Math.max(current.saves ?? 0, library.saves ?? 0) + 1 }
  const file = join(folder, LIBRARY_FILE)
  if (unreadable && existsSync(file)) {
    copyFileSync(file, join(folder, `library.unreadable-${Date.now()}.json`))
    unreadable = false
  }
  lastText = JSON.stringify(current, null, 2) + '\n'
  // Temp file then rename, so a crash (or Drive) never sees half a file.
  writeFileSync(`${file}.tmp`, lastText, 'utf8')
  renameSync(`${file}.tmp`, file)
  for (const fn of saveListeners) fn()
  return current
}

/** Copies library.json aside (e.g. library.before-sequel-<time>.json) before a big change. */
export function backupLibrary(label: string): void {
  if (!folder) return
  const file = join(folder, LIBRARY_FILE)
  if (existsSync(file)) copyFileSync(file, join(folder, `library.${label}-${Date.now()}.json`))
}
