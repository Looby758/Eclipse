import { randomUUID } from 'crypto'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import { MARKER_FILE, REFRESH_MS, computerName, judge, parseMarker, type Marker } from '@core/guard'
import type { GuardStatus } from '@shared/api'

/** See src/core/guard.ts. This side reads and writes the marker file and decides when to go read-only. */

const me = { computer: computerName(hostname()), session: randomUUID() }
const platform: Marker['platform'] = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'
const since = new Date().toISOString()

let folder: string | null = null
let timer: NodeJS.Timeout | null = null
let state: GuardStatus = { readOnly: false }
/** This copy has had the folder (so if another computer shows up now, it took over). */
let held = false
let onChange: (s: GuardStatus) => void = () => {}

const file = (): string => join(folder!, MARKER_FILE)

function read(): Marker | null {
  try {
    return existsSync(file()) ? parseMarker(readFileSync(file(), 'utf8')) : null
  } catch {
    return null
  }
}

function write(): void {
  try {
    const marker: Marker = { ...me, platform, since, seen: new Date().toISOString() }
    writeFileSync(`${file()}.tmp`, JSON.stringify(marker, null, 2) + '\n', 'utf8')
    renameSync(`${file()}.tmp`, file())
    held = true
  } catch {
    // The folder may be offline for a moment; try again next minute.
  }
}

function set(next: GuardStatus): void {
  const changed = next.readOnly !== state.readOnly || next.other?.session !== state.other?.session || next.takenOver !== state.takenOver
  state = next
  if (changed) onChange(state)
}

const view = (m: Marker): NonNullable<GuardStatus['other']> => ({ computer: m.computer, platform: m.platform, since: m.since, seen: m.seen, session: m.session })

/** Looks at the marker: claims the folder if it's free, steps back if another computer has it. */
function check(): void {
  if (!folder) return
  const marker = read()
  const who = judge(marker, me, new Date())
  if (who === 'other') {
    // Someone else has it: if we had it, they took over.
    set({ readOnly: true, other: view(marker!), takenOver: held || state.takenOver })
    return
  }
  write()
  set({ readOnly: false })
}

/** Starts guarding `dataFolder` (or stops, with null). Calling it again for the same folder just checks. */
export function startGuard(dataFolder: string | null, changed: (s: GuardStatus) => void): void {
  onChange = changed
  if (dataFolder === folder && timer) return check()
  stopGuard()
  folder = dataFolder
  state = { readOnly: false }
  held = false
  if (!folder) return
  check()
  timer = setInterval(check, REFRESH_MS)
}

/** Takes the folder from the other computer (it was left open by mistake). That copy goes read-only within a minute. */
export function takeOver(): GuardStatus {
  if (!folder) return state
  write()
  set({ readOnly: false })
  return state
}

/** On quit: takes our marker away, so the other computer can open straight away. */
export function stopGuard(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (!folder) return
  try {
    if (read()?.session === me.session) unlinkSync(file())
  } catch {
    // Leaving it is fine: it goes stale in a few minutes.
  }
  folder = null
}

export const guardStatus = (): GuardStatus => state
/** Why a save is refused, or null when this copy may save. */
export const readOnlyReason = (): string | null => (state.readOnly ? `Eclipse is open on ${state.other?.computer ?? 'your other computer'}, so this copy is read-only.` : null)
