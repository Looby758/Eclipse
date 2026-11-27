import { randomUUID } from 'crypto'
import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { powerMonitor } from 'electron'
import { CHECK_MS, HEARTBEAT_MS, OLD_MARKER_FILE, computerName, decide, isPresenceFileName, parsePresence, presenceFileName, type Decision, type Platform, type Presence } from '@core/guard'
import type { GuardStatus } from '@shared/api'
import { librarySaves } from './library'

/**
 * See src/core/guard.ts. This side keeps this computer's eclipse-open-<name>.json up to date,
 * reads the other computer's, and decides whether this copy saves.
 */

const me = { computer: computerName(hostname()), session: randomUUID() }
const platform: Platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'
const since = new Date().toISOString()
/** Written this far apart at most while the computer's in use, so the other sees you've moved quickly. */
const ACTIVE_STEP_MS = 15_000

let folder: string | null = null
let timer: NodeJS.Timeout | null = null
let saving = false
/** When someone last used this computer (ms), as far as this copy knows. */
let active = Date.now()
/** "Take over" was pressed, until this copy is saving. */
let forced = false
let written: Presence | null = null
let decision: Decision = { saving: true, other: null, waiting: null }
let state: GuardStatus = { readOnly: false }
let onChange: (s: GuardStatus) => void = () => {}

const mine = (): string => join(folder!, presenceFileName(me.computer))

/** When someone last pressed a key or moved the mouse on this computer, in any app. */
function lastUsed(now: number): number {
  try {
    return now - powerMonitor.getSystemIdleTime() * 1000
  } catch {
    return now
  }
}

function others(): Presence[] {
  try {
    return readdirSync(folder!)
      .filter((name) => isPresenceFileName(name) && name !== presenceFileName(me.computer))
      .map((name) => {
        try {
          return parsePresence(readFileSync(join(folder!, name), 'utf8'))
        } catch {
          return null
        }
      })
      .filter((p): p is Presence => !!p)
  } catch {
    // The folder may be offline for a moment.
    return []
  }
}

function write(now: number, closed = false): void {
  const p: Presence = { ...me, platform, since, seen: new Date(now).toISOString(), active: new Date(active).toISOString(), saving: saving && !closed, saves: librarySaves(), ...(closed ? { closed: true } : {}) }
  try {
    writeFileSync(`${mine()}.tmp`, JSON.stringify(p, null, 2) + '\n', 'utf8')
    renameSync(`${mine()}.tmp`, mine())
    written = p
  } catch {
    // The folder may be offline for a moment; try again next time.
  }
}

/** Whether this copy's file is out of date enough to write again. */
function due(now: number): boolean {
  if (!written) return true
  if (written.saving !== saving || written.saves !== librarySaves()) return true
  if (active - Date.parse(written.active) >= ACTIVE_STEP_MS) return true
  return now - Date.parse(written.seen) >= HEARTBEAT_MS
}

const view = (p: Presence): NonNullable<GuardStatus['other']> => ({ computer: p.computer, platform: p.platform, since: p.since, seen: p.seen, session: p.session })

function set(next: GuardStatus): void {
  const changed = next.readOnly !== state.readOnly || next.other?.session !== state.other?.session || next.waiting !== state.waiting
  state = next
  if (changed) onChange(state)
}

/** Looks at the other computer's file and decides whether this copy saves. */
function check(): void {
  if (!folder) return
  const now = Date.now()
  active = Math.max(active, lastUsed(now))
  const was = saving
  decision = decide({ ...me, active, saving, saves: librarySaves(), forced }, others(), now)
  saving = decision.saving
  if (saving) forced = false
  // Stepping back is written straight away, so the other computer can start saving sooner.
  if (due(now) || was !== saving) write(now)
  set(saving ? { readOnly: false } : { readOnly: true, other: decision.other ? view(decision.other) : undefined, waiting: decision.waiting ?? undefined })
}

/** Starts guarding `dataFolder` (or stops, with null). Calling it again for the same folder just checks. */
export function startGuard(dataFolder: string | null, changed: (s: GuardStatus) => void): void {
  onChange = changed
  if (dataFolder === folder && timer) return check()
  stopGuard()
  folder = dataFolder
  // Read-only until the first look says otherwise, so nothing's saved before this copy knows whose turn it is.
  saving = false
  written = null
  state = { readOnly: false }
  if (!folder) return
  // The marker earlier versions left on this computer.
  try {
    const old = join(folder, OLD_MARKER_FILE)
    if (existsSync(old) && JSON.parse(readFileSync(old, 'utf8')).computer === me.computer) unlinkSync(old)
  } catch {
    // Harmless if it stays.
  }
  check()
  timer = setInterval(check, CHECK_MS)
}

/** Save here now, without waiting (the other computer was left mid-change, or Drive's stuck). The other copy steps back. */
export function takeOver(): GuardStatus {
  if (!folder) return state
  forced = true
  active = Date.now()
  check()
  return state
}

/** On quit: says this copy has closed (with how many saves it made), so the other carries on once it has them. */
export function stopGuard(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (!folder) return
  saving = false
  write(Date.now(), true)
  folder = null
}

export const guardStatus = (): GuardStatus => state
/** Why a save is refused, or null when this copy may save. */
export function readOnlyReason(): string | null {
  if (!state.readOnly) return null
  const other = state.other?.computer ?? 'your other computer'
  if (state.waiting === 'catching-up') return `Eclipse is getting your latest changes from ${other} before it saves here, so this copy is read-only for a moment.`
  return `${other} was used in the last minute, so Eclipse is saving there and this copy is read-only for now.`
}
