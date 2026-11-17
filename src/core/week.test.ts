import { describe, expect, it } from 'vitest'
import { weekSoFar, watchedMinutes } from './week'
import type { Library } from './types'

const at = (day: string, hhmm: string): Date => {
  const [y, m, d] = day.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi)
}
const entry = (key: string, over: object): object => ({ key, type: key.split(':')[0], id: Number(key.split(':')[1]), status: 'watching', addedAt: '', updatedAt: '', title: { name: key, year: null, posterPath: null }, ...over })
const lib = {
  version: 1,
  entries: {
    'tv:1': entry('tv:1', { episodes: { S1E1: '2026-11-15', S1E2: '2026-11-16', S1E3: '2026-11-17', S1E4: 'seen' }, rewatches: [{ startedOn: '2026-11-16', with: 'Sam', episodes: { S1E1: '2026-11-17' } }] }),
    'movie:2': entry('movie:2', { status: 'watched', watchedOn: '2026-11-16' })
  }
} as unknown as Library
const details = { 'tv:1': { runtime: 50 }, 'movie:2': { runtime: 150 } }
const ev = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5], weeklyBudgetMinutes: 600 }

describe('weekly budget', () => {
  it('counts what you watched this week, rewatches too', () => {
    // Mon 16 to Tue 17: two of your own episodes, one with Sam, and the film.
    expect(watchedMinutes(lib, details, '2026-11-16', '2026-11-17')).toBe(3 * 50 + 150)
  })
  it('says how much of the week is left', () => {
    expect(weekSoFar(lib, details, at('2026-11-17', '19:00'), ev)).toEqual({ from: '2026-11-16', watchedMinutes: 300, budgetMinutes: 600, leftMinutes: 300, nightsLeft: 4 })
    expect(weekSoFar(lib, details, at('2026-11-17', '19:00'), { ...ev, weeklyBudgetMinutes: 0 })).toBeNull()
  })
})
