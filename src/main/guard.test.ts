import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { emptyLibrary } from '@core/library'

/** Seconds since someone last used each computer. */
const idle: Record<string, number> = {}
let host = 'Loobys-MacBook-Air'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, powerMonitor: { getSystemIdleTime: () => idle[host] ?? 0 } }))
vi.mock('./health', () => ({ log: () => undefined, report: () => undefined }))
vi.mock('os', async (orig) => ({ ...(await orig<typeof import('os')>()), hostname: () => host }))

interface Copy {
  name: string
  guard: typeof import('./guard')
  library: typeof import('./library')
}

/** One copy of Eclipse, as if on its own computer. */
async function openCopy(folder: string, computer: string): Promise<Copy> {
  vi.resetModules()
  host = computer
  const library = await import('./library')
  const guard = await import('./guard')
  library.openLibrary(folder, () => undefined, guard.readOnlyReason)
  guard.startGuard(folder, () => undefined)
  return { name: computer, guard, library }
}

/** Lets a copy look again, as its timer would (with its own computer's idle time). */
function look(c: Copy): ReturnType<Copy['guard']['guardStatus']> {
  host = c.name
  c.guard.startGuard(dir, () => undefined)
  return c.guard.guardStatus()
}

let dir = ''
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('switching computers', () => {
  it('moves saving to the PC once you use it and the Mac has caught it up, and back again', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-11-26T20:00:00Z'))
    dir = mkdtempSync(join(tmpdir(), 'eclipse-guard-'))
    writeFileSync(join(dir, 'library.json'), JSON.stringify(emptyLibrary()))

    // The Mac's open and in use: it saves.
    idle['Loobys-MacBook-Air'] = 0
    const mac = await openCopy(dir, 'Loobys-MacBook-Air')
    expect(mac.guard.guardStatus().readOnly).toBe(false)
    mac.library.saveLibrary(mac.library.getLibrary())

    // The PC opens while you're still on the Mac: it waits.
    idle['DESKTOP-4F2K9'] = 600
    const pc = await openCopy(dir, 'DESKTOP-4F2K9')
    expect(pc.guard.guardStatus()).toMatchObject({ readOnly: true, waiting: 'in-use' })

    // You leave the Mac and use the PC.
    vi.setSystemTime(new Date('2026-11-26T20:02:00Z'))
    idle['Loobys-MacBook-Air'] = 120
    idle['DESKTOP-4F2K9'] = 0
    expect(look(pc)).toMatchObject({ readOnly: true, waiting: 'catching-up' })
    expect(look(mac).readOnly).toBe(true)
    // The PC has library.json with the Mac's save (same folder here), so it saves now.
    expect(look(pc).readOnly).toBe(false)
    expect(() => pc.library.saveLibrary(pc.library.getLibrary())).not.toThrow()

    // Back to the Mac: the PC steps back after a minute, and the Mac takes over once it has the PC's save.
    vi.setSystemTime(new Date('2026-11-26T20:05:00Z'))
    idle['DESKTOP-4F2K9'] = 180
    idle['Loobys-MacBook-Air'] = 0
    expect(look(mac)).toMatchObject({ readOnly: true, waiting: 'catching-up' })
    expect(look(pc).readOnly).toBe(true)
    // The Mac's library.json watcher would pick up the PC's save; here we reopen it.
    mac.library.openLibrary(dir, () => undefined, mac.guard.readOnlyReason)
    expect(look(mac).readOnly).toBe(false)
  })
})
