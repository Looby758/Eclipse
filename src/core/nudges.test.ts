import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, preferencesOf, setPreferences, snoozeTitle } from './library'
import { comebacks, daysAfter, lastTicked, stalledShows } from './nudges'
import type { Library, LibraryEntry, TitleDetails } from './types'

const today = '2026-11-17'
const entry = (key: string, status: LibraryEntry['status'], over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: { name: key, year: null, posterPath: null }, ...over } as LibraryEntry
}
const lib = (entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })
const show = (seasons: [number, number, string][]): TitleDetails =>
  ({ type: 'tv', runtime: 50, seasons: seasons.map(([number, episodeCount, airDate]) => ({ number, name: `S${number}`, episodeCount, airDate, posterPath: null })), nextEpisode: null }) as unknown as TitleDetails

describe('keep going or stop?', () => {
  it('finds the last dated tick', () => {
    expect(lastTicked({ S1E1: '2026-01-02', S1E2: 'seen', S2E1: '2026-03-01' })).toBe('2026-03-01')
    expect(lastTicked({ S1E1: '2026-01-02', S2E1: '2026-03-01' }, 1)).toBe('2026-01-02')
    expect(lastTicked({ S1E1: 'seen' })).toBeNull()
  })

  it('lists Watching shows untouched for a while, longest first', () => {
    const library = lib([
      entry('tv:1', 'watching', { episodes: { S1E1: '2026-08-01' } }),
      entry('tv:2', 'watching', { episodes: { S1E1: '2026-11-10' } }),
      entry('tv:3', 'watching', { episodes: { S1E1: 'seen' } }),
      entry('tv:4', 'watched', { episodes: { S1E1: '2025-01-01' } })
    ])
    expect(stalledShows(library, today).map((s) => [s.entry.key, s.days])).toEqual([
      ['tv:3', 320],
      ['tv:1', 108]
    ])
    expect(stalledShows(library, today, 200).map((s) => s.entry.key)).toEqual(['tv:3'])
  })

  it('counts a rewatch, skips caught-up shows and snoozed ones', () => {
    const library = lib([
      entry('tv:1', 'watching', { episodes: { S1E1: '2026-01-01' }, rewatches: [{ startedOn: '2026-11-01', episodes: { S1E1: '2026-11-01' } }] }),
      entry('tv:2', 'watching', { episodes: { S1E1: '2026-01-01', S1E2: '2026-01-02' } }),
      entry('tv:3', 'watching', { episodes: { S1E1: '2026-01-01' }, snoozedUntil: '2026-12-01' })
    ])
    expect(stalledShows(library, today, 60, { 'tv:2': show([[1, 2, '2025-01-01']]) })).toEqual([])
  })

  it('snoozing is saved, and the threshold is a preference', () => {
    let library = lib([entry('tv:1', 'watching')])
    library = snoozeTitle(library, 'tv:1', daysAfter(today, 30))
    expect(normalizeLibrary(JSON.parse(JSON.stringify(library))).entries['tv:1'].snoozedUntil).toBe('2026-12-17')
    expect(snoozeTitle(library, 'tv:1', null).entries['tv:1'].snoozedUntil).toBeUndefined()
    expect(preferencesOf(library).stalledDays).toBe(60)
    expect(preferencesOf(setPreferences(library, { stalledDays: 90 })).stalledDays).toBe(90)
    expect(preferencesOf(setPreferences(library, { stalledDays: 2 })).stalledDays).toBe(60)
  })
})

describe('back after a long gap', () => {
  const d = show([
    [0, 2, '2020-01-01'],
    [1, 2, '2023-01-01'],
    [2, 2, '2024-01-01'],
    [3, 8, '2026-11-01']
  ])
  const finished = { S1E1: 'seen', S1E2: 'seen', S2E1: '2024-03-01', S2E2: '2024-03-02' }

  it('spots a new season of a show you finished long ago', () => {
    const library = lib([entry('tv:1', 'watched', { episodes: finished })])
    expect(comebacks(library, { 'tv:1': d }, today)).toEqual([{ entry: library.entries['tv:1'], season: 3, airDate: '2026-11-01', finishedOn: '2024-03-02' }])
  })

  it('not when you finished it recently, started the new one, or it’s old news', () => {
    const recent = lib([entry('tv:1', 'watched', { episodes: { ...finished, S2E2: '2026-10-01' } })])
    expect(comebacks(recent, { 'tv:1': d }, today)).toEqual([])
    const started = lib([entry('tv:1', 'watching', { episodes: { ...finished, S3E1: '2026-11-02' } })])
    expect(comebacks(started, { 'tv:1': d }, today)).toEqual([])
    const unfinished = lib([entry('tv:1', 'watching', { episodes: { S2E1: '2024-03-01' } })])
    expect(comebacks(unfinished, { 'tv:1': d }, today)).toEqual([])
    const library = lib([entry('tv:1', 'watched', { episodes: finished })])
    expect(comebacks(library, { 'tv:1': d }, '2027-02-01')).toEqual([])
    expect(comebacks(snoozeTitle(library, 'tv:1', '2026-12-31'), { 'tv:1': d }, today)).toEqual([])
  })
})
