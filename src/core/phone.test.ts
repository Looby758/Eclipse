import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, setEpisodes, setStatus, startRewatch, type LibraryItem } from './library'
import { conflictText, foldPhone, learnableKeys, normalizePhoneFile, pendingChanges, phoneView, resolvePhone, type PhoneChange } from './phone'

const andor: LibraryItem = { key: 'tv:83867', type: 'tv', id: 83867, title: { name: 'Andor', year: 2022, posterPath: '/a.jpg' } }
const dune: LibraryItem = { key: 'movie:438631', type: 'movie', id: 438631, title: { name: 'Dune', year: 2021, posterPath: '/d.jpg' } }
const noon = (day: string): Date => new Date(`${day}T12:00:00`)
const at = (day: string, time = '21:00'): string => new Date(`${day}T${time}:00`).toISOString()

const tick = (id: string, keys: string[], day: string, had = true): PhoneChange => ({ id, at: at(day), kind: 'episodes', item: andor, keys, watched: true, day, had })

describe('folding in what you did on your phone', () => {
  it('adds titles and ticks, with the day you ticked them on the phone, and remembers they are done', () => {
    const changes: PhoneChange[] = [
      { id: 'a', at: at('2026-11-10'), kind: 'status', item: dune, status: 'want', was: null },
      tick('b', ['S1E1', 'S1E2'], '2026-11-12', false)
    ]
    const { library, conflicts, applied } = foldPhone(emptyLibrary(), changes)
    expect(conflicts).toEqual([])
    expect(applied).toBe(2)
    expect(library.entries['movie:438631'].status).toBe('want')
    expect(library.entries['tv:83867'].status).toBe('watching')
    expect(library.entries['tv:83867'].episodes).toEqual({ S1E1: '2026-11-12', S1E2: '2026-11-12' })
    expect(library.phoneApplied).toEqual(['a', 'b'])
    // Folding the same file again changes nothing.
    expect(foldPhone(library, changes).applied).toBe(0)
    // And the phone sees there's nothing left to tidy but these two.
    expect(pendingChanges(library, changes)).toEqual([])
  })

  it('asks when an episode was ticked on both on different days, and does what you choose', () => {
    const lib = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, noon('2026-11-10'))
    const change = tick('c', ['S1E1', 'S1E2'], '2026-11-12')
    const { library, conflicts } = foldPhone(lib, [change])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ kind: 'episodeDay', episodes: [{ key: 'S1E1', phone: '2026-11-12', computer: '2026-11-10' }] })
    expect(library.phoneApplied).toBeUndefined()
    expect(conflictText(conflicts[0])).toContain('S1 E1')

    const phoneWay = resolvePhone(library, change, 'phone')
    expect(phoneWay.entries['tv:83867'].episodes).toEqual({ S1E1: '2026-11-12', S1E2: '2026-11-12' })
    expect(phoneWay.phoneApplied).toEqual(['c'])

    const mine = resolvePhone(library, change, 'computer')
    expect(mine.entries['tv:83867'].episodes).toEqual({ S1E1: '2026-11-10' })
    expect(mine.phoneApplied).toEqual(['c'])
  })

  it('does not ask when both ticked the same day', () => {
    const lib = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, noon('2026-11-12'))
    expect(foldPhone(lib, [tick('d', ['S1E1'], '2026-11-12')]).conflicts).toEqual([])
  })

  it('asks before bringing back a title you removed on the computer', () => {
    const { conflicts } = foldPhone(emptyLibrary(), [tick('e', ['S2E4'], '2026-11-12', true)])
    expect(conflicts[0]).toMatchObject({ kind: 'removed', name: 'Andor', what: 'ticked S2 E4' })
    expect(conflictText(conflicts[0])).toBe('You removed Andor on this computer, but on your phone you ticked S2 E4.')
  })

  it('changes a status unless the computer changed it too', () => {
    const lib = setStatus(emptyLibrary(), dune, 'want')
    const ok = foldPhone(lib, [{ id: 'f', at: at('2026-11-12'), kind: 'status', item: dune, status: 'watched', was: 'want' }])
    expect(ok.library.entries['movie:438631'].status).toBe('watched')
    expect(ok.library.entries['movie:438631'].watchedOn).toBe('2026-11-12')

    const moved = setStatus(lib, dune, 'stopped')
    const clash = foldPhone(moved, [{ id: 'g', at: at('2026-11-12'), kind: 'status', item: dune, status: 'watched', was: 'want' }])
    expect(clash.conflicts[0]).toMatchObject({ kind: 'status', phone: 'watched', computer: 'stopped' })
  })

  it('puts ticks on the rewatch you are part-way through', () => {
    let lib = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, noon('2025-01-01'))
    lib = startRewatch(setStatus(lib, andor, 'watched'), andor, noon('2026-11-01'))
    const { library, conflicts } = foldPhone(lib, [tick('h', ['S1E1'], '2026-11-12')])
    expect(conflicts).toEqual([])
    expect(library.entries['tv:83867'].episodes).toEqual({ S1E1: '2025-01-01' })
    expect(library.entries['tv:83867'].rewatches?.[0].episodes).toEqual({ S1E1: '2026-11-12' })
  })

  it('hides recommendations you said Not for me to', () => {
    const { library } = foldPhone(emptyLibrary(), [{ id: 'i', at: at('2026-11-12'), kind: 'notForMe', key: 'movie:11' }])
    expect(library.recsHidden).toEqual(['movie:11'])
  })

  it('teaches recommendations from the phone’s Not for me and Interested answers', () => {
    const changes: PhoneChange[] = [
      { id: 'k', at: at('2026-11-12'), kind: 'notForMe', key: 'movie:11' },
      { id: 'l', at: at('2026-11-12', '21:01'), kind: 'status', item: dune, status: 'want', was: null },
      { id: 'm', at: at('2026-11-12', '21:02'), kind: 'status', item: andor, status: 'watching', was: 'want' }
    ]
    expect(learnableKeys(changes)).toEqual(['movie:11', 'movie:438631'])
    const traits = { 'movie:11': [{ id: 'creator:1', name: 'George Lucas' }], 'movie:438631': [{ id: 'creator:2', name: 'Denis Villeneuve' }] }
    const { library } = foldPhone(emptyLibrary(), changes, traits)
    expect(library.recsHidden).toEqual(['movie:11'])
    expect(library.entries['movie:438631'].status).toBe('want')
    expect(library.recsTaste).toMatchObject({ yes: 1, no: 1, weights: { 'creator:1': { w: -0.6 }, 'creator:2': { w: 0.6 } } })
  })

  it('keeps the folded-in ids through a save and reload', () => {
    const { library } = foldPhone(emptyLibrary(), [{ id: 'j', at: at('2026-11-12'), kind: 'notForMe', key: 'movie:11' }])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(library))).phoneApplied).toEqual(['j'])
  })
})

describe('the phone file', () => {
  it('keeps only changes that make sense', () => {
    const file = normalizePhoneFile({
      version: 1,
      changes: [
        tick('a', ['S1E1', 'nonsense'], '2026-11-12'),
        { id: 'a', at: at('2026-11-12'), kind: 'notForMe', key: 'movie:1' },
        { id: 'b', at: 'not a date', kind: 'notForMe', key: 'movie:1' },
        { id: 'c', at: at('2026-11-11'), kind: 'status', item: dune, status: 'gone', was: null },
        { id: 'd', at: at('2026-11-11'), kind: 'notForMe', key: 'movie:2' },
        'junk'
      ]
    })
    expect(file.changes.map((c) => c.id)).toEqual(['d', 'a'])
    expect(file.changes[1]).toMatchObject({ keys: ['S1E1'] })
    expect(normalizePhoneFile(null).changes).toEqual([])
  })

  it("shows the phone its own changes on top of the library until they're folded in", () => {
    const changes = [tick('a', ['S1E1'], '2026-11-12', false)]
    expect(phoneView(emptyLibrary(), changes).entries['tv:83867'].episodes).toEqual({ S1E1: '2026-11-12' })
    const folded = foldPhone(emptyLibrary(), changes).library
    expect(phoneView(folded, changes)).toBe(folded)
  })

  it('lets the phone learn from its own answers before the computer has them, and only once after', () => {
    const changes: PhoneChange[] = [{ id: 'n', at: at('2026-11-12'), kind: 'notForMe', key: 'movie:11' }]
    const traits = { 'movie:11': [{ id: 'creator:1', name: 'George Lucas' }] }
    expect(phoneView(emptyLibrary(), changes).recsTaste).toBeUndefined()
    expect(phoneView(emptyLibrary(), changes, traits).recsTaste).toMatchObject({ no: 1, weights: { 'creator:1': { w: -0.6 } } })
    // Once the computer has folded it in, the phone doesn't count it a second time.
    const folded = foldPhone(emptyLibrary(), changes, traits).library
    expect(phoneView(folded, changes, traits).recsTaste).toEqual(folded.recsTaste)
  })
})
