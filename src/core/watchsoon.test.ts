import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { episodeRange, moveWatchSoon, planEvenings, remainingEpisodes, setWatchSoon, soonItem, tonightOptions, watchSoonOf } from './watchsoon'
import type { LibraryEntry, TitleDetails, TitleRef } from './types'

const ev = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5] }
const at = (day: string, time: string): Date => new Date(`${day}T${time}:00`)
const ref = (key: string, name = key): TitleRef => {
  const [type, id] = key.split(':')
  return { key: key as TitleRef['key'], type: type as 'movie', id: Number(id), name, year: null, posterPath: null }
}
const show = (over: Partial<TitleDetails> = {}): TitleDetails =>
  ({
    type: 'tv',
    runtime: 50,
    seasons: [
      { number: 0, name: 'Specials', episodeCount: 3, airDate: '2020-01-01', posterPath: null },
      { number: 1, name: 'S1', episodeCount: 4, airDate: '2024-01-01', posterPath: null },
      { number: 2, name: 'S2', episodeCount: 4, airDate: '2026-11-01', posterPath: null }
    ],
    nextEpisode: { season: 2, episode: 3, name: '', airDate: '2026-11-24' },
    ...over
  }) as TitleDetails
const film = (runtime: number | null): TitleDetails => ({ type: 'movie', runtime, seasons: [], nextEpisode: null }) as unknown as TitleDetails
const watching = (episodes: Record<string, string>): LibraryEntry => ({ status: 'watching', episodes }) as LibraryEntry
const today = '2026-11-17' // a Tuesday

describe('watch soon list', () => {
  it('adds, keeps one of each, moves and takes off', () => {
    let lib = setWatchSoon(emptyLibrary(), ref('tv:1'), true)
    lib = setWatchSoon(lib, ref('movie:2'), true)
    lib = setWatchSoon(lib, ref('tv:1'), true)
    expect(watchSoonOf(lib).map((r) => r.key)).toEqual(['tv:1', 'movie:2'])
    lib = moveWatchSoon(lib, 1, 0)
    expect(watchSoonOf(lib).map((r) => r.key)).toEqual(['movie:2', 'tv:1'])
    lib = setWatchSoon(lib, ref('movie:2'), false)
    expect(watchSoonOf(lib).map((r) => r.key)).toEqual(['tv:1'])
  })

  it('survives being saved and read back', () => {
    const lib = setWatchSoon(emptyLibrary(), ref('tv:1', 'Slow Horses'), true)
    expect(normalizeLibrary(JSON.parse(JSON.stringify({ ...lib, watchSoon: [...lib.watchSoon!, { key: 'nonsense' }, lib.watchSoon![0]] }))).watchSoon).toEqual([ref('tv:1', 'Slow Horses')])
  })
})

describe('what’s left', () => {
  it('counts episodes after the furthest ticked one that are out', () => {
    const left = remainingEpisodes(show(), watching({ S1E1: today, S1E3: today }), today)
    expect(left).toEqual([
      { season: 1, episode: 4 },
      { season: 2, episode: 1 },
      { season: 2, episode: 2 }
    ])
    expect(remainingEpisodes(show(), { status: 'watched' } as LibraryEntry, today)).toEqual([])
  })

  it('times films and shows', () => {
    expect(soonItem(ref('tv:1'), show(), undefined, today)).toMatchObject({ minutes: 6 * 50, done: false })
    expect(soonItem(ref('movie:2'), film(null), undefined, today)).toMatchObject({ minutes: 120, estimated: true })
    expect(soonItem(ref('movie:2'), undefined, undefined, today)).toMatchObject({ unknown: true })
  })

  it('writes episode ranges', () => {
    expect(episodeRange([{ season: 5, episode: 1 }])).toBe('S5 E1')
    expect(episodeRange([{ season: 5, episode: 1 }, { season: 5, episode: 3 }])).toBe('S5 E1–E3')
    expect(episodeRange([{ season: 1, episode: 9 }, { season: 2, episode: 2 }])).toBe('S1 E9 – S2 E2')
  })
})

describe('planning your evenings', () => {
  const items = [
    soonItem(ref('tv:1', 'Slow Horses'), show(), undefined, today), // 6 × 50
    soonItem(ref('movie:2', 'Dune'), film(155), undefined, today),
    soonItem(ref('movie:3', 'Long film'), film(200), undefined, today)
  ]

  it('fills tonight, then whole evenings, in your order', () => {
    const plan = planEvenings(items, at(today, '21:00'), ev)
    expect(plan.totalMinutes).toBe(300 + 155 + 200)
    expect(plan.nights.map((n) => [n.day, n.slots.map((s) => (s.film ? s.name : `${s.name} ${episodeRange(s.episodes)}`))])).toEqual([
      ['2026-11-17', ['Slow Horses S1 E1–E2']],
      ['2026-11-18', ['Slow Horses S1 E3 – S2 E1']],
      ['2026-11-19', ['Slow Horses S2 E2']],
      ['2026-11-20', ['Dune']],
      ['2026-11-23', ['Long film']]
    ])
    expect(plan.nights[0].tonight).toBe(true)
    expect(plan.finish).toBe('2026-11-23')
  })

  it('skips nights you don’t watch and gives a too-long film a whole evening', () => {
    const plan = planEvenings([items[2]], at('2026-11-20', '22:00'), ev)
    expect(plan.nights.map((n) => n.day)).toEqual(['2026-11-23'])
  })

  it('can’t plan without watching nights', () => {
    expect(planEvenings(items, at(today, '21:00'), { ...ev, watchDays: [] }).finish).toBeNull()
  })

  it('lists what fits tonight on its own', () => {
    expect(tonightOptions(items, at(today, '20:20'), ev).map((o) => [o.name, o.film ? 'film' : o.episodes])).toEqual([
      ['Slow Horses', 3],
      ['Dune', 'film']
    ])
  })
})

describe('planEvenings with your week (phase 35)', () => {
  it('keeps to a weekly budget, but always puts the first thing on a night', async () => {
    const { planEvenings } = await import('./watchsoon')
    const ref = (key: string, name: string) => ({ key, type: key.split(':')[0] as 'movie' | 'tv', id: 1, name, year: null, posterPath: null })
    const film = { ref: ref('movie:1', 'Long film'), film: true, done: false, unknown: false, minutes: 150, minutesEach: 150, episodes: [] }
    const show = { ref: ref('tv:2', 'Show'), film: false, done: false, unknown: false, minutes: 6 * 45, minutesEach: 45, episodes: [1, 2, 3, 4, 5, 6].map((e) => ({ season: 1, episode: e })) }
    const ev = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5], weeklyBudgetMinutes: 450 }
    // Tue 17 Nov 19:00: 90 minutes a night. The film gets tonight on its own; then 2 episodes a night.
    const p = planEvenings([film, show] as never, new Date(2026, 10, 17, 19, 0), ev)
    expect(p.nights.map((n) => [n.day, n.minutes])).toEqual([
      ['2026-11-17', 150],
      ['2026-11-18', 90],
      ['2026-11-19', 90],
      ['2026-11-20', 90]
    ])
  })
})
