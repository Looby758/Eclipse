import { describe, expect, it } from 'vitest'
import { emptyLibrary } from './library'
import { keysWatchedIn, yearInReview, yearsWithWatches } from './year'
import type { Credits, Library, LibraryEntry, TitleDetails, TitleRef } from './types'

const entry = (key: string, name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watched', addedAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', title: { name, year: 2020, posterPath: null }, ...over } as LibraryEntry
}
const film = (runtime: number): TitleDetails => ({ type: 'movie', runtime, seasons: [], nextEpisode: null }) as unknown as TitleDetails
const show = (runtime: number): TitleDetails => ({ type: 'tv', runtime, seasons: [], nextEpisode: null }) as unknown as TitleDetails
const p = (id: number, name: string) => ({ id, name, profilePath: null, role: '' })

const lib: Library = {
  ...emptyLibrary(),
  entries: {
    'movie:1': entry('movie:1', 'Inception', { watchedOn: '2025-03-01', rewatches: [{ startedOn: '2025-08-01', finishedOn: '2025-08-01' }] }),
    'movie:2': entry('movie:2', 'Interstellar', { watchedOn: '2025-03-02' }),
    'movie:3': entry('movie:3', 'Old', { watchedOn: '2024-01-01' }),
    'tv:4': entry('tv:4', 'Severance', {
      watchedOn: '2025-03-04',
      episodes: { S1E1: '2025-03-03', S1E2: '2025-03-03', S1E3: '2025-03-03', S1E4: '2025-03-04', S1E5: 'seen' }
    }),
    'movie:5': entry('movie:5', 'Seen once', { seenBefore: true })
  }
}
const details = { 'movie:1': film(148), 'movie:2': film(169), 'tv:4': show(50) }
const credits: Record<string, Credits> = {
  'movie:1': { directors: [p(525, 'Christopher Nolan')], cast: [p(1, 'Michael Caine')] },
  'movie:2': { directors: [p(525, 'Christopher Nolan')], cast: [p(1, 'Michael Caine'), p(2, 'Anne Hathaway')] },
  'tv:4': { directors: [], cast: [p(3, 'Adam Scott')] }
}

describe('your year in Eclipse', () => {
  it('knows which years have watches and what to fetch', () => {
    expect(yearsWithWatches(lib)).toEqual([2025, 2024])
    expect(keysWatchedIn(lib, 2025).sort()).toEqual(['movie:1', 'movie:2', 'tv:4'])
  })

  it('adds up the year', () => {
    const r = yearInReview(lib, 2025, details, credits)
    expect(r.films).toBe(3)
    expect(r.episodes).toBe(4)
    expect(r.shows).toBe(1)
    expect(r.showsFinished).toBe(1)
    expect(r.minutes).toBe(148 * 2 + 169 + 4 * 50)
    expect(r.busiestMonth).toBe(2) // March
    expect(r.days).toBe(5)
    expect(r.binge).toEqual({ name: 'Severance', key: 'tv:4', day: '2025-03-03', episodes: 3 })
    expect(r.streak).toEqual({ days: 4, from: '2025-03-01', to: '2025-03-04' })
    expect(r.topTitles[0].name).toBe('Inception')
    expect(r.director?.person.name).toBe('Christopher Nolan')
    expect(r.actor?.person.name).toBe('Michael Caine')
  })

  it('counts lists finished that year', () => {
    const ref = (key: string, name: string): TitleRef => ({ key: key as TitleRef['key'], type: 'movie', id: 1, name, year: 2020, posterPath: null })
    const lists = { a: { name: 'Nolan', items: [ref('movie:1', 'Inception'), ref('movie:2', 'Interstellar')] }, b: { name: 'Mixed', items: [ref('movie:1', 'Inception'), ref('movie:3', 'Old'), ref('movie:9', 'Unseen')] } }
    expect(yearInReview(lib, 2025, details, credits, lists).listsFinished).toEqual(['Nolan'])
    expect(yearInReview(lib, 2024, details, credits, lists).listsFinished).toEqual([])
  })
})
