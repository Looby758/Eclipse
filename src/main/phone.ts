import { existsSync, readFileSync, unwatchFile, watchFile } from 'fs'
import { join } from 'path'
import { PHONE_FILE, conflictText, foldPhone, normalizePhoneFile, pendingChanges, resolvePhone, type PhoneChange, type PhoneChoice, type PhoneConflict } from '@core/phone'
import { getLibrary, saveLibrary } from './library'
import { log, report } from './health'
import type { PhoneAsk } from '@shared/api'

/**
 * Eclipse on your phone (Phase 45): folds from-phone.json (written by the phone page, synced in
 * by Google Drive) into the library when Eclipse opens and whenever the file changes. This side
 * only reads that file; the phone tidies out what's been folded in once it sees `phoneApplied`.
 * Clashes wait for you to choose (see PhoneAsk in the window).
 */

let file: string | null = null
let stop: (() => void) | null = null
let waiting: { conflict: PhoneConflict; change: PhoneChange }[] = []
let notify: (asks: PhoneAsk[], libraryChanged: boolean) => void = () => undefined
let readOnly: () => string | null = () => null

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const formatDay = (day: string): string => fmt.format(new Date(`${day}T12:00:00`))

export const phoneAsks = (): PhoneAsk[] => waiting.map(({ conflict }) => ({ ...conflict, text: conflictText(conflict, formatDay) }))

function readChanges(): PhoneChange[] {
  if (!file || !existsSync(file)) return []
  try {
    return normalizePhoneFile(JSON.parse(readFileSync(file, 'utf8'))).changes
  } catch {
    // Half-synced: the watcher tries again when it settles.
    return []
  }
}

/** Folds in whatever's new from the phone. Safe to call any time. */
export function foldFromPhone(): void {
  if (!file || readOnly()) return
  const changes = readChanges()
  const pending = pendingChanges(getLibrary(), changes)
  if (!pending.length) {
    if (waiting.length) {
      waiting = []
      notify([], false)
    }
    return
  }
  try {
    const { library, conflicts, applied } = foldPhone(getLibrary(), pending)
    if (applied) {
      saveLibrary(library)
      report('phone', true, `Added ${applied} change${applied === 1 ? '' : 's'} from your phone`)
    }
    const byId = new Map(pending.map((c) => [c.id, c]))
    waiting = conflicts.map((conflict) => ({ conflict, change: byId.get(conflict.id)! }))
    notify(phoneAsks(), applied > 0)
  } catch (err) {
    log(`[phone] couldn't add the phone's changes: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Starts watching the data folder's from-phone.json (null stops). */
export function startPhone(dataFolder: string | null, onChange: typeof notify, isReadOnly: () => string | null): void {
  stop?.()
  stop = null
  waiting = []
  notify = onChange
  readOnly = isReadOnly
  file = dataFolder ? join(dataFolder, PHONE_FILE) : null
  if (!file) return
  const watched = file
  const listener = (): void => foldFromPhone()
  watchFile(watched, { interval: 2000 }, listener)
  stop = () => unwatchFile(watched, listener)
  foldFromPhone()
}

/** You chose which to keep for one clash. */
export function resolveAsk(id: string, choice: PhoneChoice): PhoneAsk[] {
  const found = waiting.find((w) => w.conflict.id === id)
  if (!found || (choice !== 'phone' && choice !== 'computer')) return phoneAsks()
  saveLibrary(resolvePhone(getLibrary(), found.change, choice))
  waiting = waiting.filter((w) => w !== found)
  // A later change may now go through (or clash differently).
  foldFromPhone()
  return phoneAsks()
}
