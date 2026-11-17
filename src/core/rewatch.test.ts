import { describe, expect, it } from 'vitest'
import {
  activeEntry,
  countByStatus,
  currentRewatch,
  emptyLibrary,
  endRewatch,
  entriesWith,
  markSeenBefore,
  normalizeLibrary,
  removeRewatch,
  setEpisodes,
  setStatus,
  setWatchedOn,
  startRewatch,
  watchCount
} from './library'
import { onThisDay } from './onthisday'
import { mergeSequel } from './sequel'
import { UNDATED } from './types'

const bb = { key: 'tv:1396' as const, type: 'tv' as const, id: 1396, title: { name: 'Breaking Bad', year: 2008, posterPath: null } }
const elCamino = { key: 'movie:559969' as const, type: 'movie' as const, id: 559969, title: { name: 'El Camino', year: 2019, posterPath: null } }
const day = (d: string): Date => new Date(`${d}T20:00:00`)

describe('seen before', () => {
  it('marks a title watched with no date', () => {
    const lib = markSeenBefore(emptyLibrary(), elCamino, day('2026-11-17'))
    const e = lib.entries[elCamino.key]
    expect(e).toMatchObject({ status: 'watched', seenBefore: true })
    expect(e.watchedOn).toBeUndefined()
    expect(watchCount(e)).toBe(1)
  })

  it('drops "seen before" once you give it a real date', () => {
    const lib = setWatchedOn(markSeenBefore(emptyLibrary(), elCamino), elCamino.key, '2019-10-12')
    expect(lib.entries[elCamino.key].seenBefore).toBeUndefined()
    expect(lib.entries[elCamino.key].watchedOn).toBe('2019-10-12')
  })

  it('ticks episodes with no date, and a real tick replaces it', () => {
    let lib = setEpisodes(emptyLibrary(), bb, ['S1E1', 'S1E2'], true, day('2026-11-17'), true)
    expect(lib.entries[bb.key].episodes).toEqual({ S1E1: UNDATED, S1E2: UNDATED })
    lib = setEpisodes(lib, bb, ['S1E2'], true, day('2026-11-18'))
    expect(lib.entries[bb.key].episodes).toEqual({ S1E1: UNDATED, S1E2: '2026-11-18' })
  })

  it('keeps undated things out of On this day', () => {
    const lib = setEpisodes(markSeenBefore(emptyLibrary(), elCamino), bb, ['S1E1'], true, day('2025-11-17'), true)
    expect(onThisDay(lib, '2026-11-17').memories).toEqual([])
  })

  it('a Sequel import puts real dates on undated things', () => {
    const lib = markSeenBefore(emptyLibrary(), elCamino)
    const item = { key: elCamino.key, type: 'movie' as const, id: elCamino.id, name: 'El Camino', year: 2019, posterPath: null, status: 'watched' as const, addedAt: null, watchedOn: '2019-10-12', rating: null, note: null, lists: [], episodes: {} }
    const merged = mergeSequel(lib, { items: [item], skippedOther: 0, skippedNoId: [], orphanEpisodes: 0 })
    expect(merged.entries[elCamino.key].seenBefore).toBeUndefined()
    expect(merged.entries[elCamino.key].watchedOn).toBe('2019-10-12')
  })
})

describe('rewatches', () => {
  it('a film watched again today counts straight away', () => {
    let lib = markSeenBefore(emptyLibrary(), elCamino)
    lib = startRewatch(lib, elCamino, day('2026-11-17'))
    const e = lib.entries[elCamino.key]
    expect(e.rewatches).toEqual([{ startedOn: '2026-11-17', finishedOn: '2026-11-17' }])
    expect(currentRewatch(e)).toBeUndefined()
    expect(watchCount(e)).toBe(2)
    expect(watchCount(removeRewatch(lib, elCamino.key, 0).entries[elCamino.key])).toBe(1)
  })

  it('a show rewatch keeps its own ticks and leaves the first watch alone', () => {
    let lib = setEpisodes(emptyLibrary(), bb, ['S1E1', 'S1E2'], true, day('2020-01-01'))
    lib = setStatus(lib, bb, 'watched', day('2020-01-02'))
    lib = startRewatch(lib, bb, day('2026-11-10'))
    lib = setEpisodes(lib, bb, ['S1E1'], true, day('2026-11-11'))
    const e = lib.entries[bb.key]
    expect(e.status).toBe('watched')
    expect(e.episodes).toEqual({ S1E1: '2020-01-01', S1E2: '2020-01-01' })
    expect(currentRewatch(e)).toEqual({ startedOn: '2026-11-10', episodes: { S1E1: '2026-11-11' } })

    // Progress, the library tabs and Home see it as a show you're watching.
    expect(activeEntry(e)).toMatchObject({ status: 'watching', episodes: { S1E1: '2026-11-11' } })
    expect(activeEntry(e)).toBe(activeEntry(e))
    expect(countByStatus(lib)).toMatchObject({ watching: 1, watched: 0 })
    expect(entriesWith(lib, 'watching').map((x) => x.key)).toEqual([bb.key])
    expect(watchCount(e)).toBe(1)

    // Finishing counts it; giving up doesn't.
    const done = endRewatch(lib, bb.key, true, day('2026-11-20'))
    expect(done.entries[bb.key].rewatches).toEqual([{ startedOn: '2026-11-10', finishedOn: '2026-11-20', episodes: { S1E1: '2026-11-11' } }])
    expect(watchCount(done.entries[bb.key])).toBe(2)
    expect(countByStatus(done)).toMatchObject({ watching: 0, watched: 1 })
    expect(endRewatch(lib, bb.key, false).entries[bb.key].rewatches).toBeUndefined()
  })

  it('only one rewatch at a time', () => {
    const lib = startRewatch(setStatus(emptyLibrary(), bb, 'watched'), bb, day('2026-11-10'))
    expect(startRewatch(lib, bb, day('2026-11-12'))).toBe(lib)
  })

  it('remembers rewatch ticks in On this day', () => {
    let lib = startRewatch(setStatus(emptyLibrary(), bb, 'watched', day('2020-01-01')), bb, day('2025-11-16'))
    lib = setEpisodes(lib, bb, ['S3E1'], true, day('2025-11-17'))
    expect(onThisDay(lib, '2026-11-17').memories.map((m) => [m.key, m.episodes])).toEqual([[bb.key, ['S3E1']]])
  })

  it('reads rewatches and seen-before from the file, dropping broken bits', () => {
    const lib = normalizeLibrary({
      version: 1,
      entries: {
        'tv:1396': {
          key: 'tv:1396',
          type: 'tv',
          id: 1396,
          status: 'watched',
          addedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          seenBefore: true,
          episodes: { S1E1: 'seen', S1E2: 'nonsense' },
          rewatches: [{ startedOn: '2026-02-01', finishedOn: '2026-03-01', episodes: { S1E1: '2026-02-01' } }, { startedOn: 'bad' }, 'junk', { startedOn: '2026-04-01' }],
          title: { name: 'Breaking Bad', year: 2008, posterPath: null }
        }
      }
    })
    const e = lib.entries['tv:1396']
    expect(e.seenBefore).toBe(true)
    expect(e.episodes).toEqual({ S1E1: 'seen' })
    expect(e.rewatches).toEqual([{ startedOn: '2026-02-01', finishedOn: '2026-03-01', episodes: { S1E1: '2026-02-01' } }, { startedOn: '2026-04-01' }])
  })
})
