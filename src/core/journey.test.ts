import { describe, expect, it } from 'vitest'
import { gapLabel, journeyOf } from './journey'
import type { LibraryEntry } from './types'

const show = (over: Partial<LibraryEntry>): LibraryEntry =>
  ({ key: 'tv:1402', type: 'tv', id: 1402, status: 'watching', addedAt: '', updatedAt: '', title: { name: 'The Walking Dead', year: 2010, posterPath: null }, ...over }) as LibraryEntry
const seasons = [1, 2, 3].map((number) => ({ number, episodeCount: 3 }))

describe('my journey with a show (phase 57)', () => {
  it('gives each season its first and last day, and the long gaps', () => {
    const j = journeyOf(show({ episodes: { S1E1: '2024-01-02', S1E2: '2024-01-03', S1E3: '2024-01-05', S2E1: '2024-09-01', S2E2: '2024-09-03' } }), seasons)!
    expect(j.lanes[0].stints).toEqual([
      { season: 1, from: '2024-01-02', to: '2024-01-05', seen: 3, total: 3 },
      { season: 2, from: '2024-09-01', to: '2024-09-03', seen: 2, total: 3 }
    ])
    expect(j.gaps).toMatchObject([{ afterSeason: 1, beforeSeason: 2, days: 240 }])
    expect(j.start).toBe('2024-01-02')
    expect(j.end).toBe('2024-09-03')
  })
  it('never shows a season you have not reached, and needs two seasons', () => {
    expect(journeyOf(show({ episodes: { S1E1: '2024-01-02' } }), seasons)).toBeNull()
    const j = journeyOf(show({ episodes: { S1E1: 'seen', S2E1: '2024-01-02' } }), seasons)!
    expect(j.lanes[0].stints.map((s) => s.season)).toEqual([1, 2])
    expect(j.lanes[0].stints[0]).toMatchObject({ from: null, to: null })
  })
  it('gives rewatches and watching with someone their own lanes', () => {
    const j = journeyOf(
      show({
        status: 'watched',
        episodes: { S1E1: '2020-01-01', S2E1: '2020-02-01' },
        rewatches: [
          { startedOn: '2025-01-01', finishedOn: '2025-03-01', episodes: { S1E1: '2025-01-01', S2E1: '2025-02-01' } },
          { startedOn: '2026-01-01', with: 'Sam', episodes: { S1E1: '2026-01-05' } }
        ]
      }),
      seasons
    )!
    expect(j.lanes.map((l) => [l.label, l.going])).toEqual([['First time', false], ['Rewatch', false], ['With Sam', true]])
  })
  it('says gaps in plain words', () => {
    expect(gapLabel(50)).toBe('7 weeks')
    expect(gapLabel(240)).toBe('8 months')
    expect(gapLabel(430)).toBe('1 year 2 months')
  })
})
