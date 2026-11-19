import { describe, expect, it } from 'vitest'
import { emptyLibrary } from './library'
import { seasonsFinished, ticksToday } from './sounds'
import type { Library, LibraryEntry } from './types'

const seasons = [
  { number: 0, episodeCount: 2 },
  { number: 1, episodeCount: 3 },
  { number: 2, episodeCount: 2 }
]
const today = '2026-11-19'

function entry(episodes: Record<string, string>, extra: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    key: 'tv:1402',
    type: 'tv',
    id: 1402,
    status: 'watching',
    addedAt: '2025-03-01T10:00:00Z',
    updatedAt: '2025-03-01T10:00:00Z',
    episodes,
    title: { name: 'The Walking Dead', year: 2010, posterPath: '/p.jpg' } as LibraryEntry['title'],
    ...extra
  }
}

const lib = (...entries: LibraryEntry[]): Library => {
  const l = emptyLibrary()
  for (const e of entries) l.entries[e.key] = e
  return l
}

describe('ticksToday', () => {
  it('notices a tick dated today', () => {
    expect(ticksToday(lib(entry({ S1E1: today })), lib(entry({ S1E1: today, S1E2: today })), today)).toEqual(['tv:1402'])
    expect(ticksToday(lib(), lib(entry({ S1E1: today })), today)).toEqual(['tv:1402'])
  })

  it('stays quiet for unticking, seen-before ticks and old ticks a sync brings in', () => {
    expect(ticksToday(lib(entry({ S1E1: today, S1E2: today })), lib(entry({ S1E1: today })), today)).toEqual([])
    expect(ticksToday(lib(entry({})), lib(entry({ S1E1: 'seen', S1E2: 'seen' })), today)).toEqual([])
    expect(ticksToday(lib(entry({})), lib(entry({ S1E1: '2026-11-02' })), today)).toEqual([])
    // Nothing changed (a note, a rating).
    expect(ticksToday(lib(entry({ S1E1: today })), lib(entry({ S1E1: today }, { note: 'great' } as Partial<LibraryEntry>)), today)).toEqual([])
  })

  it('counts ticks on a rewatch too', () => {
    const before = entry({ S1E1: 'seen' }, { rewatches: [{ startedOn: '2026-11-01', episodes: {} }] } as Partial<LibraryEntry>)
    const after = entry({ S1E1: 'seen' }, { rewatches: [{ startedOn: '2026-11-01', episodes: { S1E1: today } }] } as Partial<LibraryEntry>)
    expect(ticksToday(lib(before), lib(after), today)).toEqual(['tv:1402'])
  })
})

describe('seasonsFinished', () => {
  it('finds the season the last tick finished', () => {
    expect(seasonsFinished(entry({ S1E1: '2026-11-17', S1E2: '2026-11-18' }), entry({ S1E1: '2026-11-17', S1E2: '2026-11-18', S1E3: today }), seasons, today)).toEqual([1])
  })

  it('finds a season ticked all at once', () => {
    expect(seasonsFinished(entry({}), entry({ S2E1: today, S2E2: today }), seasons, today)).toEqual([2])
  })

  it('ignores seasons that were already done, unfinished ones and specials', () => {
    const done = { S1E1: today, S1E2: today, S1E3: today }
    expect(seasonsFinished(entry(done), entry({ ...done, S2E1: today }), seasons, today)).toEqual([])
    expect(seasonsFinished(entry({ S0E1: today }), entry({ S0E1: today, S0E2: today }), seasons, today)).toEqual([])
  })

  it("doesn't chime for a season finished on an old day or marked seen before", () => {
    expect(seasonsFinished(entry({}), entry({ S2E1: 'seen', S2E2: 'seen' }), seasons, today)).toEqual([])
    expect(seasonsFinished(entry({}), entry({ S2E1: '2026-10-01', S2E2: '2026-10-01' }), seasons, today)).toEqual([])
  })

  it('chimes when a rewatch finishes a season', () => {
    const first = { S1E1: 'seen', S1E2: 'seen', S1E3: 'seen' }
    const before = entry(first, { rewatches: [{ startedOn: '2026-11-01', episodes: { S1E1: '2026-11-10', S1E2: '2026-11-11' } }] } as Partial<LibraryEntry>)
    const after = entry(first, { rewatches: [{ startedOn: '2026-11-01', episodes: { S1E1: '2026-11-10', S1E2: '2026-11-11', S1E3: today } }] } as Partial<LibraryEntry>)
    expect(seasonsFinished(before, after, seasons, today)).toEqual([1])
  })
})
