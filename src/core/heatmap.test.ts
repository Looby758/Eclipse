import { describe, expect, it } from 'vitest'
import { buildHeatmap, heatColour } from './heatmap'
import type { LibraryEntry, SeasonDetails } from './types'

const season = (number: number, ratings: (number | null)[], votes = 100, airDate = '2024-01-01'): SeasonDetails => ({
  tvId: 1,
  number,
  name: `Season ${number}`,
  episodes: ratings.map((r, i) => ({
    season: number,
    number: i + 1,
    name: `S${number} title ${i + 1}`,
    airDate,
    runtime: 45,
    overview: '',
    voteAverage: r,
    voteCount: r === null ? 0 : votes,
    stillPath: null
  }))
})
const entry = (episodes: Record<string, string>): LibraryEntry => ({ key: 'tv:1', type: 'tv', id: 1, status: 'watching', addedAt: '', updatedAt: '', title: { name: 'X', year: null, posterPath: null }, episodes })

describe('buildHeatmap', () => {
  const seasons = [season(0, [9.9]), season(2, [8.0, 9.0, 7.0]), season(1, [7.5, 8.5])]

  it('makes a row per season (specials left out) with averages, range and extremes', () => {
    const h = buildHeatmap(seasons, undefined, '2026-11-17')
    expect(h.rows.map((r) => r.season)).toEqual([1, 2])
    expect(h.rows.map((r) => r.average)).toEqual([8, 8])
    expect([h.low, h.high]).toEqual([7, 9])
    expect(h.best).toMatchObject({ season: 2, episode: 2 })
    expect(h.worst).toMatchObject({ season: 2, episode: 3 })
    expect(h.rows[0].cells.some((c) => c.spoiler)).toBe(false)
  })

  it("greys out low-vote episodes and leaves them out of averages", () => {
    const h = buildHeatmap([season(1, [8, 9]), { ...season(2, [5]), episodes: [{ ...season(2, [5]).episodes[0], voteCount: 3 }] }], undefined, '2026-11-17')
    expect(h.rows[1].cells[0]).toMatchObject({ rating: 5, trusted: false })
    expect(h.rows[1].average).toBeNull()
    expect(h.worst).toMatchObject({ season: 1, episode: 1 })
  })

  it("has no rating for episodes that haven't aired", () => {
    const h = buildHeatmap([season(1, [8]), season(2, [0, 0], 0, '2027-01-01')], undefined, '2026-11-17')
    expect(h.rows[1].cells.map((c) => [c.aired, c.rating])).toEqual([
      [false, null],
      [false, null]
    ])
  })

  it('marks where you are and hides titles past it', () => {
    const h = buildHeatmap(seasons, entry({ S1E1: '2026-01-01', S1E2: '2026-01-01' }), '2026-11-17')
    const s2 = h.rows[1].cells
    expect(h.rows[0].cells.every((c) => c.watched && !c.spoiler)).toBe(true)
    expect(s2[0]).toMatchObject({ next: true, spoiler: false })
    expect(s2.slice(1).every((c) => c.spoiler)).toBe(true)
  })

  it('widens a narrow range so steady shows stay calm', () => {
    const h = buildHeatmap([season(1, [8.1, 8.2, 8.3])], undefined, '2026-11-17')
    expect(h.high - h.low).toBeCloseTo(1.5)
  })
})

describe('heatColour', () => {
  it('runs from pink-violet at the low to cyan at the high, cool colours only', () => {
    expect(heatColour(7, 7, 9).h).toBe(330)
    expect(heatColour(9, 7, 9).h).toBe(190)
    expect(heatColour(10, 7, 9).h).toBe(190)
    for (let r = 5; r <= 10; r += 0.25) {
      const { h } = heatColour(r, 6, 9)
      expect(h >= 180 && h <= 330).toBe(true)
    }
  })
})
