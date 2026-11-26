import { randomUUID } from 'crypto'
import { existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { computerName } from '@core/guard'
import { changesBetween, foldHandoffs, handoffFileName, isHandoffFileName, stampChange } from '@core/handoff'
import { normalizePhoneFile, pendingChanges, phoneView, type NewPhoneChange, type PhoneChange } from '@core/phone'
import type { Library } from '@core/types'
import { getLibrary, getSavedLibrary, refreshLibraryView, saveLibrary, setHandOff, setLibraryView } from './library'
import { log, report } from './health'

/**
 * See src/core/handoff.ts. While this copy is read-only, ticks and status changes go into this
 * computer's from-computer-<name>.json instead of being refused; the copy that's saving folds
 * every computer's file into library.json.
 */

/** How often the saving copy looks for handed-over changes from the other computer. */
const LOOK_MS = 3000

let folder: string | null = null
let mine: string | null = null
/** This copy's handed-over changes not yet folded in (shown on top of the library meanwhile). */
let pending: PhoneChange[] = []
let readOnly: () => string | null = () => null
let changed: () => void = () => undefined
let timer: NodeJS.Timeout | null = null
/** Each file's last-seen modified time, so the saving copy only re-reads what's changed. */
const seen = new Map<string, number>()

function readFile(file: string): PhoneChange[] {
  try {
    return existsSync(file) ? normalizePhoneFile(JSON.parse(readFileSync(file, 'utf8'))).changes : []
  } catch {
    // Half-synced: try again next time.
    return []
  }
}

function writeMine(): void {
  if (!mine) return
  if (!pending.length) {
    try {
      if (existsSync(mine)) unlinkSync(mine)
    } catch {
      // Left behind it's harmless: everything in it is already folded in.
    }
    return
  }
  writeFileSync(`${mine}.tmp`, JSON.stringify({ version: 1, changes: pending }, null, 2) + '\n', 'utf8')
  renameSync(`${mine}.tmp`, mine)
}

/** Drops this copy's changes that the saving copy has folded in. */
function tidyMine(): void {
  const left = pendingChanges(getSavedLibrary(), pending)
  if (left.length === pending.length) return
  pending = left
  refreshLibraryView()
  try {
    writeMine()
  } catch {
    // Tidied next time.
  }
}

/** Whether a change made now should be handed over instead of saved. */
export const handingOver = (): boolean => !!folder && !!readOnly()

/** Hands changes to the copy that's saving, and shows them here straight away. */
export function handOver(...changes: NewPhoneChange[]): Library {
  if (!folder || !mine) throw new Error('Choose a data folder first.')
  const before = pending
  const now = new Date()
  pending = [...pending, ...changes.map((c) => stampChange(c, randomUUID(), now))]
  try {
    writeMine()
  } catch (err) {
    pending = before
    throw err
  }
  refreshLibraryView()
  report('sync', true, 'Handed a change to your other computer to save')
  return getLibrary()
}

/**
 * Brings handed-over changes in. While read-only that's just tidying this copy's file; while
 * saving it folds every computer's file (this one's too, from when it was read-only) into the library.
 */
export function foldHandoffsNow(): void {
  if (!folder) return
  tidyMine()
  if (readOnly()) return
  let names: string[]
  try {
    names = readdirSync(folder).filter(isHandoffFileName)
  } catch {
    return
  }
  const changes: PhoneChange[] = []
  let fresh = false
  for (const name of names) {
    const file = join(folder, name)
    let mtime = 0
    try {
      mtime = statSync(file).mtimeMs
    } catch {
      continue
    }
    if (seen.get(file) !== mtime) fresh = true
    seen.set(file, mtime)
    changes.push(...readFile(file))
  }
  // Nothing's changed in the files since last time, and this copy has nothing of its own waiting.
  if (!fresh && !pending.length) return
  const todo = pendingChanges(getSavedLibrary(), changes)
  if (!todo.length) return
  try {
    const { library, applied, kept } = foldHandoffs(getSavedLibrary(), todo)
    saveLibrary(library)
    tidyMine()
    if (applied) report('sync', true, `Saved ${applied} change${applied === 1 ? '' : 's'} made while Eclipse was read-only on another computer`)
    if (kept) log(`[sync] kept this computer's version for ${kept} handed-over change${kept === 1 ? '' : 's'} that clashed`)
    changed()
  } catch (err) {
    log(`[sync] couldn't save handed-over changes: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Starts handing over (and folding in) for `dataFolder`; null stops. */
export function startHandoff(dataFolder: string | null, isReadOnly: () => string | null, onChange: () => void): void {
  if (timer) clearInterval(timer)
  timer = null
  seen.clear()
  readOnly = isReadOnly
  changed = onChange
  folder = dataFolder
  mine = folder ? join(folder, handoffFileName(computerName(hostname()))) : null
  pending = mine ? readFile(mine) : []
  setLibraryView((lib) => (pending.length ? phoneView(lib, pending) : lib))
  // Any save made while read-only: hand it over if it's only ticks and statuses.
  setHandOff((from, to) => {
    if (!handingOver()) return null
    const changes = changesBetween(from, to, new Date())
    return changes ? handOver(...changes) : null
  })
  if (!folder) return
  // The first look waits a moment, until the guard has said whether this copy may save.
  timer = setInterval(foldHandoffsNow, LOOK_MS)
}
