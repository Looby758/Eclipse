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

describe('watching together on Home', () => {
  it('puts a watch with someone among your picks, newest first', async () => {
    const { withTogether, isTogether, startWatchWith, tickWith, setEpisodes, emptyLibrary, planWatchWith } = await import('./library')
    const item = (id: number) => ({ key: `tv:${id}` as const, type: 'tv' as const, id, title: { name: `Show ${id}`, year: null, posterPath: null } })
    let lib = setEpisodes(emptyLibrary(), item(1), ['S1E1'], true, new Date(2026, 10, 10))
    lib = setEpisodes(lib, item(2), ['S1E1'], true, new Date(2026, 10, 12))
    lib = startWatchWith(lib, item(3), 'Jack', new Date(2026, 10, 15))
    lib = tickWith(lib, 'tv:3', 0, ['S1E1', 'S1E2'], true, new Date(2026, 10, 17))
    // With no time arranged it stays off Home.
    expect(withTogether(Object.values(lib.entries), lib).some(isTogether)).toBe(false)
    const soon = new Date(Date.now() + 30 * 60_000)
    const pad = (n: number) => String(n).padStart(2, '0')
    lib = planWatchWith(lib, 'tv:3', 0, { at: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}` })
    const own = Object.values(lib.entries)
    const picks = withTogether(own.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), lib)
    expect(picks.map((p) => (isTogether(p) ? `${p.key} with ${p.together.who}` : p.key))).toEqual(['tv:3 with Jack', 'tv:2', 'tv:1'])
    const jack = picks[0]
    expect(isTogether(jack) && Object.keys(jack.episodes ?? {})).toEqual(['S1E1', 'S1E2'])
  })
})

describe('arranging a time to watch together', () => {
  it('finds the next session, rolls weekly ones on, and reminds 15 minutes before', async () => {
    const { nextSession, sessionIsOn, sessionsStartingSoon, startWatchWith, planWatchWith, emptyLibrary, normalizeLibrary } = await import('./library')
    const fri = { at: '2026-11-20T21:00' }
    expect(nextSession({ planned: fri }, new Date(2026, 10, 17, 12, 0))).toEqual(new Date(2026, 10, 20, 21, 0))
    // Still "on" a couple of hours in; a one-off is gone the next day.
    expect(sessionIsOn({ planned: fri }, new Date(2026, 10, 20, 23, 0))).toBe(true)
    expect(sessionIsOn({ planned: fri }, new Date(2026, 10, 20, 18, 0))).toBe(false)
    expect(nextSession({ planned: fri }, new Date(2026, 10, 21, 12, 0))).toBeNull()
    expect(nextSession({ planned: { ...fri, weekly: true } }, new Date(2026, 11, 2, 12, 0))).toEqual(new Date(2026, 11, 4, 21, 0))
    const item = { key: 'tv:9' as const, type: 'tv' as const, id: 9, title: { name: 'The Walking Dead', year: null, posterPath: null } }
    let lib = startWatchWith(emptyLibrary(), item, 'Jack')
    lib = planWatchWith(lib, 'tv:9', 0, { at: '2026-11-20T21:00', weekly: true })
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib))).entries['tv:9'].rewatches![0].planned).toEqual({ at: '2026-11-20T21:00', weekly: true })
    expect(sessionsStartingSoon(lib, new Date(2026, 10, 20, 20, 50)).map((s) => s.who)).toEqual(['Jack'])
    expect(sessionsStartingSoon(lib, new Date(2026, 10, 20, 20, 30))).toEqual([])
    expect(planWatchWith(lib, 'tv:9', 0, { at: 'soon' })).toBe(lib)
    expect(planWatchWith(lib, 'tv:9', 0, null).entries['tv:9'].rewatches![0].planned).toBeUndefined()
  })
})
