import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { COUNTDOWNS_MAX, countdownTarget, daysUntil, hasCountdown, setCountdown } from './countdowns'
import type { TitleDetails, TitleKey } from './types'

const ref = (id: number, type: 'movie' | 'tv' = 'movie') => ({ key: `${type}:${id}` as TitleKey, type, id, name: `T${id}`, year: 2026, posterPath: null })
const film = (over: Partial<TitleDetails> = {}): TitleDetails =>
  ({ key: 'movie:1', type: 'movie', id: 1, name: 'Avengers: Doomsday', date: '2026-12-16', status: 'Post Production', seasons: [], nextEpisode: null, releases: { GB: { cinema: '2026-12-18', any: '2026-12-18' } }, ...over }) as TitleDetails
const show = (over: Partial<TitleDetails> = {}): TitleDetails => ({ key: 'tv:2', type: 'tv', id: 2, name: 'Show', date: '2020-01-01', status: 'Returning Series', seasons: [], nextEpisode: null, ...over }) as TitleDetails

describe('countdowns on Home', () => {
  it('adds and removes one, keeps them through the file, and stops at the most', () => {
    let l = setCountdown(emptyLibrary(), ref(1), true)
    expect(hasCountdown(l, 'movie:1')).toBe(true)
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).countdowns?.map((r) => r.key)).toEqual(['movie:1'])
    l = setCountdown(l, ref(1), false)
    expect(l.countdowns).toBeUndefined()
    for (let i = 0; i < COUNTDOWNS_MAX + 2; i++) l = setCountdown(l, ref(i), true)
    expect(l.countdowns).toHaveLength(COUNTDOWNS_MAX)
  })

  it('counts a film to its UK cinema day', () => {
    expect(countdownTarget(film(), '2026-11-19')).toEqual({ date: '2026-12-18', label: 'In cinemas' })
    expect(countdownTarget(film({ releases: {} }), '2026-11-19')).toEqual({ date: '2026-12-16', label: 'Out' })
    expect(countdownTarget(film({ releases: {}, date: null }), '2026-11-19')).toEqual({ date: null, label: 'In cinemas' })
    // Long out: nothing to count to.
    expect(countdownTarget(film(), '2027-01-30')).toBeNull()
  })

  it('counts a show to its next season, or its next episode', () => {
    expect(countdownTarget(show({ nextEpisode: { season: 3, episode: 1, name: '', airDate: '2027-02-01' } }), '2026-11-19')).toEqual({ date: '2027-02-01', label: 'Season 3' })
    expect(countdownTarget(show({ nextEpisode: { season: 2, episode: 5, name: '', airDate: '2026-11-21' } }), '2026-11-19')!.label).toBe('Episode 5 of season 2')
    expect(countdownTarget(show({ seasons: [{ number: 4, name: '', episodeCount: 0, airDate: null, posterPath: null }] }), '2026-11-19')).toEqual({ date: null, label: 'Season 4' })
    expect(countdownTarget(show({ status: 'Ended' }), '2026-11-19')).toBeNull()
  })

  it('counts whole days', () => {
    expect(daysUntil('2026-12-18', '2026-11-19')).toBe(29)
    expect(daysUntil('2026-11-19', '2026-11-19')).toBe(0)
    // Across the clocks going back.
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2)
  })
})
