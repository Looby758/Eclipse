import { describe, expect, it } from 'vitest'
import { emptyLibrary, setEpisodes, setRating, setStatus, startRewatch, type LibraryItem } from './library'
import { changesBetween, foldHandoffs, handoffFileName, isHandoffFileName, stampChange } from './handoff'
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

describe('working out what a change was, so any save can be handed over', () => {
  const dune: LibraryItem = { key: 'movie:438631', type: 'movie', id: 438631, title: { name: 'Dune', year: 2021, posterPath: '/d.jpg' } }
  const now = new Date('2026-11-26T21:00:00')
  const base = setEpisodes(setStatus(emptyLibrary(), dune, 'want', noon('2026-11-01')), andor, ['S1E1', 'S1E2'], true, noon('2026-11-20'))

  it('hands over ticks, unticks and status changes, however they were made', () => {
    const after = setStatus(setEpisodes(setEpisodes(base, andor, ['S1E3', 'S1E4'], true, now), andor, ['S1E1'], false, now), dune, 'watched', now)
    const changes = changesBetween(base, after, now)
    expect(changes).toHaveLength(3)
    expect(changes).toEqual(expect.arrayContaining([
      { kind: 'episodes', item: andor, keys: ['S1E1'], watched: false, day: '2026-11-26', had: true },
      { kind: 'episodes', item: andor, keys: ['S1E3', 'S1E4'], watched: true, day: '2026-11-26', had: true },
      { kind: 'status', item: dune, status: 'watched', was: 'want' }
    ]))
  })

  it('hands over ticking a show that was not in the library yet', () => {
    const fresh = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, now)
    expect(changesBetween(emptyLibrary(), fresh, now)).toHaveLength(2)
  })

  it('hands over ticks on a rewatch', () => {
    const rewatching = startRewatch(base, andor, noon('2026-11-25'))
    const after = setEpisodes(rewatching, andor, ['S1E1'], true, now)
    expect(changesBetween(rewatching, after, now)).toEqual([{ kind: 'episodes', item: andor, keys: ['S1E1'], watched: true, day: '2026-11-26', had: true }])
  })

  it('refuses anything else: a rating, a removal, an undated tick', () => {
    expect(changesBetween(base, setRating(base, 'tv:83867', 8), now)).toBeNull()
    expect(changesBetween(base, setStatus(base, dune, null, now), now)).toBeNull()
    expect(changesBetween(base, setEpisodes(base, andor, ['S1E5'], true, now, true), now)).toBeNull()
    // A tick and a rating together: the whole save is refused, not half handed over.
    expect(changesBetween(base, setRating(setEpisodes(base, andor, ['S1E5'], true, now), 'tv:83867', 8), now)).toBeNull()
    expect(changesBetween(base, base, now)).toBeNull()
  })
})
