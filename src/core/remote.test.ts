import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, type Library, type LibraryEntry, type TitleDetails } from './types'
import { emptyLibrary } from './library'
import { newRemoteToken, remoteState, sameToken, tonightChange, trayMenuOf } from './remote'

const entry = (key: string, status: LibraryEntry['status'], over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: { name: key, year: null, posterPath: null }, ...over } as LibraryEntry
}
const show = (counts: number[], runtime = 50): TitleDetails =>
  ({ type: 'tv', runtime, seasons: counts.map((episodeCount, i) => ({ number: i + 1, name: '', episodeCount, airDate: '2020-01-01', posterPath: null })), nextEpisode: null }) as unknown as TitleDetails

describe('phone remote', () => {
  const evening = new Date(2026, 10, 17, 21, 0) // 9pm, bed at 11pm
  const lib: Library = {
    ...emptyLibrary(),
    entries: {
      'tv:1': entry('tv:1', 'watching', { episodes: { S1E1: '2026-11-10', S1E2: '2026-11-10' } }),
      'tv:2': entry('tv:2', 'watching', { episodes: { S1E1: '2026-11-16' } }),
      'tv:3': entry('tv:3', 'watched')
    },
    watchSoon: [{ key: 'movie:9', type: 'movie', id: 9, name: 'Dune', year: 2021, posterPath: null }]
  }

  it('lists what you’re watching, latest first, with the next episode and what fits', () => {
    const s = remoteState(lib, { 'tv:1': show([4, 3]), 'tv:2': show([2]) }, DEFAULT_PREFERENCES, evening)
    expect(s.minutesLeft).toBe(120)
    expect(s.shows.map((x) => [x.key, x.next, x.left, x.fits])).toEqual([
      ['tv:2', { season: 1, episode: 2 }, 1, 1],
      ['tv:1', { season: 1, episode: 3 }, 5, 2]
    ])
    expect(s.soon).toEqual([{ key: 'movie:9', name: 'Dune', film: true, minutes: 0, episodes: 0, done: false }])
  })

  it('changes just tonight from the phone', () => {
    const tue = new Date(2026, 10, 17, 19, 0)
    expect(tonightChange(DEFAULT_PREFERENCES, tue, 'off')).toEqual({ day: '2026-11-17', off: true })
    expect(tonightChange(DEFAULT_PREFERENCES, tue, 'later')).toEqual({ day: '2026-11-17', bedtime: '23:30' })
    const later = { ...DEFAULT_PREFERENCES, justTonight: { day: '2026-11-17', bedtime: '23:30' } }
    expect(tonightChange(later, tue, 'later')).toEqual({ day: '2026-11-17', bedtime: '00:00' })
    expect(tonightChange(later, tue, 'usual')).toBeNull()
    expect(remoteState(lib, {}, later, tue)).toMatchObject({ bedtime: '23:30', tonightChanged: true, watchingTonight: true })
  })

  it('pairing codes are long and compared safely', () => {
    const t = newRemoteToken((n) => new Uint8Array(n).fill(171))
    expect(t).toBe('ab'.repeat(16))
    expect(sameToken(t, t)).toBe(true)
    expect(sameToken(t, 'ab'.repeat(15) + 'ac')).toBe(false)
    expect(sameToken('', '')).toBe(false)
    expect(sameToken(t, 'ab')).toBe(false)
  })
})

describe('menu bar and tray', () => {
  it('lists next episodes to tick and tonight’s time', () => {
    const state = { bedtime: '23:00', minutesLeft: 130, startBy: '22:15', watchingTonight: true, tonightChanged: false, shows: [
      { key: 'tv:1', name: 'Severance', posterPath: null, next: { season: 2, episode: 3 }, left: 5, minutesEach: 50, fits: 2 },
      { key: 'tv:2', name: 'Done', posterPath: null, next: null, left: 0, minutesEach: 50, fits: 0 }
    ], soon: [] }
    const m = trayMenuOf(state)
    expect(m.shows).toEqual([{ key: 'tv:1', season: 2, episode: 3, label: 'Severance: S2 E3', done: 'Severance S2 E3 is marked watched.' }])
    expect(m.tonight).toBe('Tonight: 2h 10m left before bed (23:00)')
    expect(m.startBy).toBe('Start an episode by 22:15')
    expect(trayMenuOf({ ...state, minutesLeft: 0 }).startBy).toBeNull()
    expect(trayMenuOf({ ...state, minutesLeft: 0, watchingTonight: false }).tonight).toBe('Not watching tonight')
  })
})
