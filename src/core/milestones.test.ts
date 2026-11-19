import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { markMilestones, milestonesBetween, showsTickedSince, tally } from './milestones'
import { UNDATED, type Library, type LibraryEntry } from './types'

const show = (id: number, name: string, ticks: number, day = '2026-11-18', over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  key: `tv:${id}`,
  type: 'tv',
  id,
  status: 'watching',
  addedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  episodes: Object.fromEntries(Array.from({ length: ticks }, (_, i) => [`S${Math.floor(i / 10) + 1}E${(i % 10) + 1}`, i === ticks - 1 ? day : '2024-03-01'])),
  title: { name, year: 2010, posterPath: null },
  ...over
})
const film = (id: number, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  key: `movie:${id}`,
  type: 'movie',
  id,
  status: 'watched',
  addedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  watchedOn: '2026-11-18',
  title: { name: `Film ${id}`, year: 2020, posterPath: null },
  ...over
})
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })

describe('milestones (phase 53)', () => {
  it('counts every tick, rewatches too, and watched films', () => {
    const l = lib(show(1, 'A', 5, '2026-11-18', { rewatches: [{ startedOn: '2025-01-01', episodes: { S1E1: '2025-01-01' } }] }), film(2), film(3, { status: 'want' }))
    expect(tally(l)).toEqual({ episodes: 6, films: 1, shows: { 'tv:1': 6 } })
  })

  it('shows "your 1,000th episode" when a tick passes it, with the episode', () => {
    const before = lib(show(1, 'Other', 900), show(1402, 'The Walking Dead', 99))
    const after = lib(show(1, 'Other', 900), show(1402, 'The Walking Dead', 100))
    const { milestones, quiet } = milestonesBetween(before, after)
    expect(quiet).toBe(false)
    expect(milestones[0]).toMatchObject({ id: 'episodes:1000', text: 'That was your 1,000th episode.', detail: 'The Walking Dead · S10 E10' })
  })

  it('says hours with one show, using its episode length', () => {
    const before = lib(show(1402, 'The Walking Dead', 139))
    const after = lib(show(1402, 'The Walking Dead', 140))
    expect(showsTickedSince(before, after)).toEqual(['tv:1402'])
    const { milestones } = milestonesBetween(before, after, { 'tv:1402': 43 })
    // 140 × 43 minutes = 100 hours 20 minutes; 139 × 43 = 99 hours 37.
    expect(milestones.map((m) => m.text)).toEqual(['100 hours of The Walking Dead.'])
    expect(milestones[0].detail).toBe('Since March 2024')
    expect(milestonesBetween(lib(show(9, 'Lost', 31)), lib(show(9, 'Lost', 32)))).toMatchObject({ milestones: [{ text: 'A whole day of Lost.' }] })
  })

  it('counts films', () => {
    const films = Array.from({ length: 99 }, (_, i) => film(i + 1))
    const { milestones } = milestonesBetween(lib(...films), lib(...films, film(500, { title: { name: 'Dune', year: 2021, posterPath: null } })))
    expect(milestones).toMatchObject([{ id: 'films:100', text: 'That was your 100th film.', detail: 'Dune' }])
  })

  it('shows each one only once', () => {
    const before = lib(show(1, 'A', 99))
    const after = markMilestones(lib(show(1, 'A', 100)), ['episodes:100'])
    expect(milestonesBetween(before, after).milestones).toEqual([])
  })

  it('goes quiet for "seen before" ticks and big imports, and never for unticking', () => {
    expect(milestonesBetween(lib(show(1, 'A', 99)), lib(show(1, 'A', 100, UNDATED)))).toMatchObject({ quiet: true, milestones: [{ id: 'episodes:100' }] })
    expect(milestonesBetween(lib(show(1, 'A', 10)), lib(show(1, 'A', 300))).quiet).toBe(true)
    expect(milestonesBetween(lib(show(1, 'A', 100)), lib(show(1, 'A', 99))).milestones).toEqual([])
  })

  it('carries on every 1,000 episodes past 3,000', () => {
    const { milestones } = milestonesBetween(lib(show(1, 'A', 3999)), lib(show(1, 'A', 4000)))
    expect(milestones.map((m) => m.id)).toContain('episodes:4000')
  })

  it('keeps shown milestones in the file', () => {
    const l = markMilestones(emptyLibrary(), ['episodes:1000', 'hours:tv:1402:100', 'nonsense'])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).milestones).toEqual(['episodes:1000', 'hours:tv:1402:100'])
    expect(markMilestones(l, ['episodes:1000'])).toBe(l)
  })
})
