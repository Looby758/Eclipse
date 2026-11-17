import { describe, expect, it } from 'vitest'
import { activeEntry, companions, currentRewatch, emptyLibrary, endWatchWith, normalizeLibrary, setEpisodes, startRewatch, startWatchWith, setStatus, tickWith, watchCount, watchesWith } from './library'

const twd = { key: 'tv:1402' as const, type: 'tv' as const, id: 1402, title: { name: 'The Walking Dead', year: 2010, posterPath: null } }
const at = (d: string): Date => new Date(`${d}T20:00:00`)

describe('watching with someone', () => {
  it('keeps its own progress, apart from yours', () => {
    let lib = setEpisodes(emptyLibrary(), twd, ['S1E1', 'S1E2', 'S1E3'], true, at('2026-01-01'))
    lib = startWatchWith(lib, twd, ' Sam ', at('2026-11-01'))
    const [w] = watchesWith(lib.entries[twd.key])
    expect(w.watch).toEqual({ startedOn: '2026-11-01', with: 'Sam' })
    lib = tickWith(lib, twd.key, w.index, ['S1E1'], true, at('2026-11-02'))
    // Ticking ahead on your own doesn't move it.
    lib = setEpisodes(lib, twd, ['S1E4'], true, at('2026-11-03'))
    const e = lib.entries[twd.key]
    expect(e.rewatches?.[w.index].episodes).toEqual({ S1E1: '2026-11-02' })
    expect(Object.keys(e.episodes ?? {})).toEqual(['S1E1', 'S1E2', 'S1E3', 'S1E4'])
    // It isn't your own rewatch, so progress elsewhere still follows you.
    expect(currentRewatch(e)).toBeUndefined()
    expect(activeEntry(e)).toBe(e)
  })

  it('runs alongside your own rewatch and other people', () => {
    let lib = setStatus(emptyLibrary(), twd, 'watched', at('2020-01-01'))
    lib = startRewatch(lib, twd, at('2026-11-01'))
    lib = startWatchWith(lib, twd, 'Sam', at('2026-11-01'))
    lib = startWatchWith(lib, twd, 'Mum', at('2026-11-02'))
    lib = startWatchWith(lib, twd, 'sam', at('2026-11-03'))
    expect(watchesWith(lib.entries[twd.key]).map((x) => x.watch.with)).toEqual(['Sam', 'Mum'])
    expect(currentRewatch(lib.entries[twd.key])?.with).toBeUndefined()
    expect(companions(lib)).toEqual(['Mum', 'Sam'])
  })

  it('finishing counts it; stopping drops it', () => {
    let lib = startWatchWith(setStatus(emptyLibrary(), twd, 'watched', at('2020-01-01')), twd, 'Sam', at('2026-11-01'))
    const i = watchesWith(lib.entries[twd.key])[0].index
    const done = endWatchWith(lib, twd.key, i, true, at('2026-11-20'))
    expect(done.entries[twd.key].rewatches).toEqual([{ startedOn: '2026-11-01', finishedOn: '2026-11-20', with: 'Sam' }])
    expect(watchCount(done.entries[twd.key])).toBe(2)
    lib = endWatchWith(lib, twd.key, i, false)
    expect(lib.entries[twd.key].rewatches).toBeUndefined()
  })

  it('starting with someone adds a new show as Watching', () => {
    expect(startWatchWith(emptyLibrary(), twd, 'Sam').entries[twd.key].status).toBe('watching')
  })

  it('reads it back from the file', () => {
    const lib = normalizeLibrary({
      version: 1,
      entries: {
        'tv:1402': { ...twd, status: 'watching', addedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', rewatches: [{ startedOn: '2026-11-01' }, { startedOn: '2026-11-01', with: 'Sam' }, { startedOn: '2026-11-02', with: 'Sam' }] }
      }
    })
    expect(lib.entries['tv:1402'].rewatches).toEqual([{ startedOn: '2026-11-01' }, { startedOn: '2026-11-01', with: 'Sam' }])
  })
})
