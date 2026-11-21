import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { eraName, erasOf, onTimeline, packLanes, setEraName, timelineOf } from './timeline'
import type { Library, LibraryEntry } from './types'

const show = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ key: 'tv:1402', type: 'tv', id: 1402, status: 'watching', addedAt: '', updatedAt: '', title: { name: 'The Walking Dead', year: 2010, posterPath: '/twd.jpg' }, ...over }) as LibraryEntry
const film = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ key: 'movie:1', type: 'movie', id: 1, status: 'watched', addedAt: '', updatedAt: '', title: { name: 'Dune', year: 2021, posterPath: null }, ...over }) as LibraryEntry
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })

describe('my timeline (phase 64)', () => {
  it('lays each title out from its first day to its last, split at long breaks', () => {
    const t = timelineOf(lib(show({ episodes: { S1E1: '2024-01-02', S1E2: '2024-01-02', S1E3: '2024-01-05', S2E1: '2024-09-01', S2E2: 'seen' } })))
    expect(t.spans.map((s) => [s.from, s.to, s.episodes, s.going])).toEqual([
      ['2024-01-02', '2024-01-05', 3, false],
      ['2024-09-01', '2024-09-01', 1, true]
    ])
    expect(t.spans[0].days[0]).toEqual({ day: '2024-01-02', episodes: ['S1E1', 'S1E2'] })
    expect(t.undated).toBe(1)
    expect([t.first, t.last]).toEqual(['2024-01-02', '2024-09-01'])
  })
  it('puts films on their day, and rewatches and watches with someone as their own stretches', () => {
    const t = timelineOf(
      lib(
        film({ watchedOn: '2023-05-01', rewatches: [{ startedOn: '2024-02-01', finishedOn: '2024-02-01' }] }),
        film({ key: 'movie:2', id: 2, watchedOn: '2020-01-01', seenBefore: true }),
        show({ status: 'watched', episodes: { S1E1: '2020-01-01' }, rewatches: [{ startedOn: '2025-01-01', with: 'Sam', episodes: { S1E1: '2025-01-03' } }] })
      )
    )
    expect(t.spans.map((s) => [s.name, s.label, s.from])).toEqual([
      ['The Walking Dead', 'First time', '2020-01-01'],
      ['Dune', 'First time', '2023-05-01'],
      ['Dune', 'Rewatch', '2024-02-01'],
      ['The Walking Dead', 'With Sam', '2025-01-03']
    ])
    expect(t.undated).toBe(1)
    expect(onTimeline(t.spans.length ? lib(film({ watchedOn: '2023-05-01' })).entries['movie:1'] : undefined)).toBe(true)
    expect(onTimeline(film({ status: 'want' }))).toBe(false)
  })
  it('packs stretches into lanes so none overlap', () => {
    expect(packLanes([{ start: 0, width: 50 }, { start: 20, width: 50 }, { start: 60, width: 10 }, { start: 72, width: 10 }, { start: 90, width: 10 }], 5)).toEqual([0, 1, 0, 2, 0])
  })
})

describe('eras (phase 64)', () => {
  it('names eras by season and year', () => {
    expect(eraName('The Walking Dead', '2021-12', '2022-02')).toBe('The Walking Dead winter, 2021–22')
    expect(eraName('Breaking Bad', '2019-06', '2019-08')).toBe('The Breaking Bad summer, 2019')
    expect(eraName('The Office', '2020-02', '2020-11')).toBe('The Office year, 2020')
    expect(eraName('Lost', '2018-01', '2020-06')).toBe('The Lost years, 2018–2020')
    expect(eraName('Andor', '2022-01', '2022-02')).toBe('The Andor winter, 2021–22')
  })
  it('finds runs of months one title led, and uses a name you gave it', () => {
    const eps: Record<string, string> = {}
    // 20 episodes in each of Dec 2021, Jan and Feb 2022.
    ;['2021-12', '2022-01', '2022-02'].forEach((m, i) => {
      for (let e = 1; e <= 20; e++) eps[`S${i + 1}E${e}`] = `${m}-${String(e).padStart(2, '0')}`
    })
    let library = lib(show({ episodes: eps }), film({ watchedOn: '2022-01-10' }))
    const t = timelineOf(library)
    expect(t.eras).toEqual([{ id: 'tv:1402@2021-12', key: 'tv:1402', from: '2021-12', to: '2022-02', auto: 'The Walking Dead winter, 2021–22', name: 'The Walking Dead winter, 2021–22' }])
    library = setEraName(library, 'tv:1402@2021-12', '  Zombie winter ')
    expect(library.eraNames).toEqual({ 'tv:1402@2021-12': 'Zombie winter' })
    expect(erasOf(library, timelineOf(library).spans)[0].name).toBe('Zombie winter')
    // Saved and read back; an empty name gives Eclipse's back.
    expect(normalizeLibrary(JSON.parse(JSON.stringify(library))).eraNames).toEqual({ 'tv:1402@2021-12': 'Zombie winter' })
    expect(setEraName(library, 'tv:1402@2021-12', '').eraNames).toBeUndefined()
  })
  it('leaves out quiet months and months with no clear leader', () => {
    const library = lib(show({ episodes: { S1E1: '2024-01-01', S1E2: '2024-02-01' } }))
    expect(timelineOf(library).eras).toEqual([])
  })
})
