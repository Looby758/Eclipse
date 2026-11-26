import { describe, expect, it } from 'vitest'
import { emptyLibrary, setEpisodes, setStatus, type LibraryItem } from './library'
import { foldHandoffs, handoffFileName, isHandoffFileName, stampChange } from './handoff'
import { pendingChanges, phoneView } from './phone'

const andor: LibraryItem = { key: 'tv:83867', type: 'tv', id: 83867, title: { name: 'Andor', year: 2022, posterPath: '/a.jpg' } }
const noon = (day: string): Date => new Date(`${day}T12:00:00`)

describe('handing changes over from a read-only copy', () => {
  it('names each computer its own file, and leaves Drive conflict copies alone', () => {
    expect(handoffFileName('DESKTOP-4F2K9')).toBe('from-computer-desktop-4f2k9.json')
    expect(handoffFileName('Looby’s MacBook Air')).toBe('from-computer-looby-s-macbook-air.json')
    expect(handoffFileName('???')).toBe('from-computer-computer.json')
    expect(isHandoffFileName('from-computer-desktop-4f2k9.json')).toBe(true)
    expect(isHandoffFileName('from-computer-desktop-4f2k9 (1).json')).toBe(false)
    expect(isHandoffFileName('from-phone.json')).toBe(false)
  })

  it('shows a tick at once on the read-only copy, saves it on the open one, then tidies it away', () => {
    const saved = setStatus(emptyLibrary(), andor, 'watching', noon('2026-11-20'))
    const tick = stampChange({ kind: 'episodes', item: andor, keys: ['S1E3'], watched: true, day: '2026-11-26', had: true }, 'x1', noon('2026-11-26'))
    // Read-only copy: shown on top straight away.
    expect(phoneView(saved, [tick]).entries['tv:83867'].episodes).toEqual({ S1E3: '2026-11-26' })
    // The copy that's open saves it.
    const { library, applied, kept } = foldHandoffs(saved, [tick])
    expect(applied).toBe(1)
    expect(kept).toBe(0)
    expect(library.entries['tv:83867'].episodes).toEqual({ S1E3: '2026-11-26' })
    // Back on the read-only copy, once library.json syncs in, there's nothing left to hand over.
    expect(pendingChanges(library, [tick])).toEqual([])
    // And folding again changes nothing.
    expect(foldHandoffs(library, [tick]).applied).toBe(0)
  })

  it('keeps the open copy’s version when the two clash, without asking', () => {
    const saved = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, noon('2026-11-25'))
    const tick = stampChange({ kind: 'episodes', item: andor, keys: ['S1E1', 'S1E2'], watched: true, day: '2026-11-26', had: true }, 'x2', noon('2026-11-26'))
    const { library, applied, kept } = foldHandoffs(saved, [tick])
    expect(applied).toBe(0)
    expect(kept).toBe(1)
    expect(library.entries['tv:83867'].episodes).toEqual({ S1E1: '2026-11-25' })
    expect(pendingChanges(library, [tick])).toEqual([])
  })

  it('does not bring back a show removed on the open copy', () => {
    const tick = stampChange({ kind: 'episodes', item: andor, keys: ['S1E4'], watched: true, day: '2026-11-26', had: true }, 'x3', noon('2026-11-26'))
    const { library, kept } = foldHandoffs(emptyLibrary(), [tick])
    expect(kept).toBe(1)
    expect(library.entries['tv:83867']).toBeUndefined()
  })
})
