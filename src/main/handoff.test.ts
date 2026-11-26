import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { emptyLibrary, setEpisodes, setStatus, type LibraryItem } from '@core/library'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('./health', () => ({ log: () => undefined, report: () => undefined }))
let host = 'Loobys-MacBook-Air'
vi.mock('os', async (orig) => ({ ...(await orig<typeof import('os')>()), hostname: () => host }))

const andor: LibraryItem = { key: 'tv:83867', type: 'tv', id: 83867, title: { name: 'Andor', year: 2022, posterPath: '/a.jpg' } }

interface Copy {
  library: typeof import('./library')
  handoff: typeof import('./handoff')
  remote: { readOnly: boolean }
}

/** One copy of Eclipse: its own library and handoff modules, as if on its own computer. */
async function openCopy(folder: string, computer: string, readOnly: boolean): Promise<Copy> {
  vi.resetModules()
  host = computer
  const library = await import('./library')
  const handoff = await import('./handoff')
  const copy: Copy = { library, handoff, remote: { readOnly } }
  library.openLibrary(folder, () => undefined, () => (copy.remote.readOnly ? 'read-only' : null))
  handoff.startHandoff(folder, () => (copy.remote.readOnly ? 'read-only' : null), () => undefined)
  return copy
}

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('ticking on a read-only copy', () => {
  it('hands over a plain save of a tick (as the tray, the window or Claude’s tools make)', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'eclipse-handoff-'))
    dirs.push(folder)
    writeFileSync(join(folder, 'library.json'), JSON.stringify(setStatus(emptyLibrary(), andor, 'watching', new Date('2026-11-20T12:00:00'))))
    const pc = await openCopy(folder, 'DESKTOP-4F2K9', true)
    const shown = pc.library.saveLibrary(setEpisodes(pc.library.getLibrary(), andor, ['S1E2'], true))
    expect(Object.keys(shown.entries['tv:83867'].episodes ?? {})).toEqual(['S1E2'])
    expect(existsSync(join(folder, 'from-computer-desktop-4f2k9.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(folder, 'library.json'), 'utf8')).entries['tv:83867'].episodes).toBeUndefined()
  })

  it('hands the tick to the copy that’s open, which saves it, and the file is tidied away', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'eclipse-handoff-'))
    dirs.push(folder)
    writeFileSync(join(folder, 'library.json'), JSON.stringify(setStatus(emptyLibrary(), andor, 'watching', new Date('2026-11-20T12:00:00'))))

    const mac = await openCopy(folder, 'Loobys-MacBook-Air', false)
    const pc = await openCopy(folder, 'DESKTOP-4F2K9', true)

    // The PC is read-only, so the tick is handed over rather than refused…
    expect(pc.handoff.handingOver()).toBe(true)
    expect(mac.handoff.handingOver()).toBe(false)
    pc.handoff.handOver({ kind: 'episodes', item: andor, keys: ['S1E3'], watched: true, day: '2026-11-26', had: true })
    const file = join(folder, 'from-computer-desktop-4f2k9.json')
    expect(existsSync(file)).toBe(true)
    // …and shows on the PC straight away, though library.json is untouched.
    expect(pc.library.getLibrary().entries['tv:83867'].episodes).toEqual({ S1E3: expect.any(String) })
    expect(pc.library.getSavedLibrary().entries['tv:83867'].episodes ?? {}).toEqual({})

    // The Mac picks it up and saves it.
    mac.handoff.foldHandoffsNow()
    const saved = JSON.parse(readFileSync(join(folder, 'library.json'), 'utf8'))
    expect(Object.keys(saved.entries['tv:83867'].episodes)).toEqual(['S1E3'])

    // A save of anything other than ticks and statuses is still refused on the read-only copy.
    expect(() => pc.library.saveLibrary({ ...pc.library.getLibrary(), entries: { ...pc.library.getLibrary().entries, 'tv:83867': { ...pc.library.getLibrary().entries['tv:83867'], rating: 9 } } })).toThrow('read-only')

    // When library.json comes back to the PC, its file is tidied away.
    pc.library.openLibrary(folder, () => undefined, () => 'read-only')
    pc.handoff.foldHandoffsNow()
    expect(existsSync(file)).toBe(false)
    expect(Object.keys(pc.library.getLibrary().entries['tv:83867'].episodes ?? {})).toEqual(['S1E3'])
  })

  it('saves its own handed-over ticks itself once the other computer closes', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'eclipse-handoff-'))
    dirs.push(folder)
    writeFileSync(join(folder, 'library.json'), JSON.stringify(setStatus(emptyLibrary(), andor, 'watching', new Date('2026-11-20T12:00:00'))))
    const pc = await openCopy(folder, 'DESKTOP-4F2K9', true)
    pc.handoff.handOver({ kind: 'episodes', item: andor, keys: ['S1E4'], watched: true, day: '2026-11-26', had: true })
    pc.handoff.foldHandoffsNow()
    expect(existsSync(join(folder, 'from-computer-desktop-4f2k9.json'))).toBe(true)

    // The Mac closes: the PC may save now.
    pc.remote.readOnly = false
    pc.handoff.foldHandoffsNow()
    const saved = JSON.parse(readFileSync(join(folder, 'library.json'), 'utf8'))
    expect(Object.keys(saved.entries['tv:83867'].episodes)).toEqual(['S1E4'])
    expect(existsSync(join(folder, 'from-computer-desktop-4f2k9.json'))).toBe(false)
  })
})
