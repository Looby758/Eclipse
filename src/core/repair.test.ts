import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { findBatches, repairBatch, spreadBatch } from './repair'
import type { Library, LibraryEntry } from './types'

const entry = (key: string, over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watched', addedAt: '2023-01-01T00:00:00Z', updatedAt: '2023-01-01T00:00:00Z', title: { name: 'Breaking Bad', year: 2008, posterPath: null }, ...over } as LibraryEntry
}
const eps = (season: number, from: number, to: number, day: string): Record<string, string> =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`S${season}E${from + i}`, day]))
const ev = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5] }

describe('repair old dates', () => {
  const lib: Library = {
    ...emptyLibrary(),
    entries: {
      'tv:1': entry('tv:1', { episodes: { ...eps(1, 1, 2, '2023-02-01'), ...eps(1, 3, 7, '2023-03-03'), ...eps(2, 1, 5, '2023-03-03'), S2E6: 'seen' }, watchedOn: '2023-03-03' }),
      'tv:2': entry('tv:2', { episodes: eps(1, 1, 3, '2023-05-01') })
    }
  }

  it('finds days with lots of ticks of one show, in watching order', () => {
    const [b, ...rest] = findBatches(lib)
    expect(rest).toEqual([])
    expect(b.id).toBe('tv:1@2023-03-03')
    expect(b.episodes).toEqual(['S1E3', 'S1E4', 'S1E5', 'S1E6', 'S1E7', 'S2E1', 'S2E2', 'S2E3', 'S2E4', 'S2E5'])
    expect(b.since).toBe('2023-02-01')
  })

  it('spreads them over watching nights before the tick day, as many as fit', () => {
    const [b] = findBatches(lib)
    const plan = spreadBatch(b, ev, 50) // 3 fit in 20:00–23:00
    expect(plan.perNight).toBe(3)
    expect(plan.nights).toBe(4)
    expect(plan.to).toBe('2023-03-03') // a Friday
    expect(plan.from).toBe('2023-02-28')
    expect(plan.days.S1E3).toBe('2023-02-28')
    expect(plan.days.S2E5).toBe('2023-03-03')
    // Never before the last earlier tick: squeezed in if there aren't enough nights.
    const tight = spreadBatch({ ...b, since: '2023-03-01' }, ev, 50)
    expect(tight.nights).toBe(2)
    expect(tight.perNight).toBe(5)
  })

  it('applies a spread (moving the finish day), marks undated, or leaves it for good', () => {
    const [b] = findBatches(lib)
    const plan = spreadBatch(b, ev, 50)
    const spread = repairBatch(lib, b, { kind: 'spread', days: plan.days })
    expect(spread.entries['tv:1'].episodes!.S1E3).toBe('2023-02-28')
    expect(spread.entries['tv:1'].episodes!.S1E1).toBe('2023-02-01')
    expect(spread.entries['tv:1'].watchedOn).toBe('2023-03-03')
    expect(findBatches(spread)).toEqual([])
    const undated = repairBatch(lib, b, { kind: 'undated' })
    expect(undated.entries['tv:1'].episodes!.S2E1).toBe('seen')
    const left = repairBatch(lib, b, { kind: 'leave' })
    expect(findBatches(left)).toEqual([])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(left))).repairLeft).toEqual(['tv:1@2023-03-03'])
  })
})
