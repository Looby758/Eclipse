import { create } from 'zustand'
import { createTmdb, type Tmdb } from '@core/tmdb'
import { emptyLibrary, normalizeLibrary } from '@core/library'
import { PHONE_FILE, newChangeId, normalizePhoneFile, pendingChanges, phoneView, type NewPhoneChange, type PhoneChange } from '@core/phone'
import type { Library } from '@core/types'
import { NotFound, SignInNeeded, createJson, exists, findFile, readJson, signIn, writeJson } from './google'

/**
 * Everything the phone page keeps: where your files are in Drive, the TMDB key, the last library
 * it read (so it opens instantly and works on the Tube), and the changes you've made that the
 * computer hasn't folded in yet. All of it stays on the phone.
 */

export interface DriveSetup {
  folderId: string
  folderName: string
  libraryId: string
  phoneFileId?: string
}

const KEYS = { drive: 'eclipse.phone.drive', tmdb: 'eclipse.phone.tmdbKey', library: 'eclipse.phone.library', queue: 'eclipse.phone.queue', written: 'eclipse.phone.written', synced: 'eclipse.phone.syncedAt' }

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
export function save(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Full or private browsing: carries on for this visit.
  }
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signIn' | 'error'

interface PhoneState {
  drive: DriveSetup | null
  tmdbKey: string | null
  tmdb: Tmdb | null
  /** The library as last read from Drive. */
  library: Library
  /** Your changes the computer hasn't folded in yet (also written to from-phone.json). */
  queue: PhoneChange[]
  /** What the screens show: the library with your queue on top. */
  view: Library
  sync: SyncState
  syncError: string | null
  syncedAt: number | null
  /** The library file is gone (or was replaced): pick it again. */
  libraryMissing: boolean

  setDrive(d: DriveSetup | null): void
  setTmdbKey(key: string | null): void
  /** Reads library.json, tidies out what the computer has folded in, and writes the queue. */
  refresh(): Promise<void>
  /** Records something you did. */
  act(change: NewPhoneChange): void
}

const makeTmdb = (key: string | null): Tmdb | null => (key ? createTmdb({ key, fetch: (url, init) => fetch(url, init) }) : null)

const initialLibrary = normalizeLibrary(load<unknown>(KEYS.library, emptyLibrary()))
const initialQueue = normalizePhoneFile({ changes: load<unknown[]>(KEYS.queue, []) }).changes

let running: Promise<void> | null = null
let again = false

export const usePhone = create<PhoneState>((set, get) => ({
  drive: load<DriveSetup | null>(KEYS.drive, null),
  tmdbKey: load<string | null>(KEYS.tmdb, null),
  tmdb: makeTmdb(load<string | null>(KEYS.tmdb, null)),
  library: initialLibrary,
  queue: initialQueue,
  view: phoneView(initialLibrary, initialQueue),
  sync: 'idle',
  syncError: null,
  syncedAt: load<number | null>(KEYS.synced, null),
  libraryMissing: false,

  setDrive(d) {
    save(KEYS.drive, d)
    set({ drive: d, libraryMissing: false })
  },

  setTmdbKey(key) {
    save(KEYS.tmdb, key)
    set({ tmdbKey: key, tmdb: makeTmdb(key) })
  },

  refresh() {
    // One at a time; a refresh asked for while one runs happens straight after.
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        await refreshOnce(get, set)
      } while (again)
    })().finally(() => (running = null))
    return running
  },

  act(partial) {
    const change = { ...partial, id: newChangeId(), at: new Date().toISOString() } as PhoneChange
    const queue = [...get().queue, change]
    save(KEYS.queue, queue)
    set({ queue, view: phoneView(get().library, queue) })
    void get().refresh()
  }
}))

type Get = () => PhoneState
type Set = (p: Partial<PhoneState>) => void

async function refreshOnce(get: Get, set: Set): Promise<void> {
  const d = get().drive
  if (!d) return
  if (!navigator.onLine) return set({ sync: 'offline' })
  set({ sync: 'syncing', syncError: null })
  try {
    let library: Library
    try {
      library = normalizeLibrary(await readJson(d.libraryId))
    } catch (err) {
      if (err instanceof NotFound) return set({ sync: 'error', libraryMissing: true, syncError: 'Can’t find library.json in your Drive any more.' })
      throw err
    }
    save(KEYS.library, library)
    // Anything the computer has folded in (or settled) is done with.
    const queue = pendingChanges(library, get().queue)
    save(KEYS.queue, queue)
    set({ library, queue, view: phoneView(library, queue) })
    await writeQueue(get, queue)
    const now = Date.now()
    save(KEYS.synced, now)
    set({ sync: 'idle', syncedAt: now })
  } catch (err) {
    if (err instanceof SignInNeeded) {
      set({ sync: 'signIn' })
      // Back to Google quietly for a new token, unless that just failed (then you tap Sign in).
      if (!sessionStorage.getItem('eclipse.phone.quietFailed')) signIn(true)
      return
    }
    set({ sync: navigator.onLine ? 'error' : 'offline', syncError: err instanceof Error ? err.message : String(err) })
  }
}

/** Writes your queue to from-phone.json (only when it's changed since the last write). */
async function writeQueue(get: Get, queue: PhoneChange[]): Promise<void> {
  const d = get().drive!
  const body = { version: 1 as const, changes: queue }
  const text = JSON.stringify(body)
  if (load<string | null>(KEYS.written, null) === text && d.phoneFileId) return
  let id = d.phoneFileId
  if (id && !(await exists(id))) id = undefined
  id ??= (await findFile(d.folderId, PHONE_FILE)) ?? undefined
  if (id) await writeJson(id, body)
  else id = await createJson(d.folderId, PHONE_FILE, body)
  if (id !== d.phoneFileId) get().setDrive({ ...d, phoneFileId: id })
  save(KEYS.written, text)
}
