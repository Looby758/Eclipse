import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { markMilestones, measure, milestoneBoard, milestonesBetween } from './milestones'
import { allTimeStats } from './stats'
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
    const m = Object.fromEntries(measure(l).map((x) => [x.id, x.value]))
    expect(m.episodes).toBe(6)
    expect(m.films).toBe(1)
    expect(m['show:tv:1']).toBe(6)
    expect(m.library).toBe(3)
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
    const { milestones } = milestonesBetween(before, after, { 'tv:1402': { runtime: 43, seasons: [], genres: [] } })
    // 140 × 43 minutes = 100 hours 20 minutes; 139 × 43 = 99 hours 37.
    const hours = milestones.find((m) => m.kind === 'hours')!
    expect(hours.text).toBe('100 hours of The Walking Dead.')
    expect(hours.detail).toBe('Since March 2024')
    expect(milestonesBetween(lib(show(9, 'Lost', 31)), lib(show(9, 'Lost', 32))).milestones.map((m) => m.text)).toContain('A whole day of Lost.')
  })

  it('counts films', () => {
    const films = Array.from({ length: 99 }, (_, i) => film(i + 1))
    const { milestones } = milestonesBetween(lib(...films), lib(...films, film(500, { title: { name: 'Dune', year: 2021, posterPath: null } })))
    expect(milestones[0]).toMatchObject({ id: 'films:100', text: 'That was your 100th film.', detail: 'Dune' })
  })

  it('shows each one only once', () => {
    const before = lib(show(1, 'A', 99))
    const first = milestonesBetween(before, lib(show(1, 'A', 100))).milestones.map((m) => m.id)
    expect(first).toEqual(expect.arrayContaining(['episodes:100', 'show:tv:1:100']))
    const after = markMilestones(lib(show(1, 'A', 100)), first)
    expect(milestonesBetween(before, after).milestones).toEqual([])
  })

  it('goes quiet for "seen before" ticks and big imports, and never for unticking', () => {
    const seenBefore = milestonesBetween(lib(show(1, 'A', 99)), lib(show(1, 'A', 100, UNDATED)))
    expect(seenBefore.quiet).toBe(true)
    expect(seenBefore.milestones[0].id).toBe('episodes:100')
    expect(milestonesBetween(lib(show(1, 'A', 10)), lib(show(1, 'A', 300))).quiet).toBe(true)
    expect(milestonesBetween(lib(show(1, 'A', 100)), lib(show(1, 'A', 99))).milestones).toEqual([])
  })

  it('carries on every 1,000 episodes past 3,000', () => {
    const { milestones } = milestonesBetween(lib(show(1, 'A', 3999)), lib(show(1, 'A', 4000)))
    expect(milestones.map((m) => m.id)).toContain('episodes:4000')
  })

  it('keeps shown milestones in the file', () => {
    const l = markMilestones(emptyLibrary(), ['episodes:1000', 'hours:tv:1402:100', 'genre:Sci-Fi & Fantasy:25', 'nonsense'])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).milestones).toEqual(['episodes:1000', 'hours:tv:1402:100', 'genre:Sci-Fi & Fantasy:25'])
    expect(markMilestones(l, ['episodes:1000'])).toBe(l)
  })

  it('has lots of kinds: streaks, binges, double bills, genres and people', () => {
    const days = (n: number, from = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`S1E${i + 1}`, `2026-11-${String(i + from).padStart(2, '0')}`]))
    const before = lib(show(1, 'A', 0, '', { episodes: days(6) }), film(2, { watchedOn: '2026-11-10' }))
    const after = lib(
      show(1, 'A', 0, '', { episodes: days(7), rewatches: [{ startedOn: '2026-11-01', with: 'Sam', episodes: days(10) }] }),
      film(2, { watchedOn: '2026-11-10' }),
      film(3, { watchedOn: '2026-11-10' })
    )
    const ids = milestonesBetween(before, after, { 'tv:1': { runtime: 45, seasons: [], genres: ['Drama'] }, 'movie:2': { runtime: 100, seasons: [], genres: ['Drama'] }, 'movie:3': { runtime: 100, seasons: [], genres: ['Drama'] } }).milestones.map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining(['streak:7', 'bill:2', 'with:sam:10', 'episodes:10']))
  })

  it('counts seasons finished from TMDB’s episode counts', () => {
    const ten = { runtime: 45, genres: [], seasons: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, name: '', episodeCount: 10, airDate: null, posterPath: null })) }
    const m = milestonesBetween(lib(show(1, 'A', 99)), lib(show(1, 'A', 100)), { 'tv:1': ten }).milestones.map((x) => x.id)
    expect(m).toContain('seasons:10')
  })

  it('lists every track for the Stats page with the next step', () => {
    const board = milestoneBoard(lib(show(1402, 'The Walking Dead', 120)))
    expect(board.find((t) => t.id === 'episodes')).toMatchObject({ value: 120, reached: [10, 50, 100], next: 250, notes: ['That was your 100th episode.', 'That was your 50th episode.', 'That was your 10th episode.'] })
    expect(board.find((t) => t.id === 'show:tv:1402')).toMatchObject({ label: '120 episodes of The Walking Dead', next: 150 })
  })
})

describe('stats', () => {
  it('adds up time, streaks and who you watch with', () => {
    const l = lib(show(1, 'A', 3, '2026-11-18', { rewatches: [{ startedOn: '2026-11-17', with: 'Sam', episodes: { S1E1: '2026-11-17' } }] }), film(2, { watchedOn: '2026-11-18', rating: 8 }))
    const s = allTimeStats(l, { 'tv:1': { runtime: 50, seasons: [], genres: ['Drama'] } }, '2026-11-19')
    expect(s.minutes).toBe(4 * 50 + 120)
    expect(s.episodes).toBe(4)
    expect(s.currentStreak).toBe(2)
    expect(s.people[0]).toMatchObject({ name: 'Sam', episodes: 1 })
    expect(s.genres[0]).toMatchObject({ name: 'Drama', titles: 1 })
    expect(s.ratings.average).toBe(8)
    expect(s.months).toHaveLength(12)
    expect(s.months[11]).toMatchObject({ month: '2026-11' })
  })
})
