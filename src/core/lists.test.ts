import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, setStatus } from './library'
import { createList, customListsWith, isItemSeen, itemKey, followList, listIdFor, moveInList, progressOf, releaseOrder, removeList, renameList, setInList, sourceOf } from './lists'
import { expandGuide, GUIDES, guideForQuery, guideRefs, guidesWith } from './guides'
import { WALKING_DEAD } from './guides/walkingDead'
import { parseCredits, parsePerson, refFromRaw } from './tmdb'
import type { Library, TitleRef } from './types'

const ref = (id: number, date: string | null = '2020-01-01', type: 'movie' | 'tv' = 'movie'): TitleRef => ({ key: `${type}:${id}`, type, id, name: `T${id}`, year: date ? Number(date.slice(0, 4)) : null, posterPath: null, date })
const now = new Date('2026-11-17T12:00:00Z')

describe('lists', () => {
  it('names lists by where they come from, and reads the names back', () => {
    for (const s of [{ kind: 'person', personId: 525, role: 'director' }, { kind: 'collection', collectionId: 263 }, { kind: 'tmdbList', listId: 8 }, { kind: 'guide', guideId: 'star-wars' }] as const) {
      expect(sourceOf(listIdFor(s))).toEqual(s)
    }
    expect(sourceOf('custom:abc')).toEqual({ kind: 'custom' })
    expect(sourceOf('nonsense')).toBeNull()
  })

  it('makes, fills, orders, renames and deletes your own lists', () => {
    let { library: lib, id } = createList(emptyLibrary(), '  Best  Picture ', now)
    expect(id).toBe('custom:best-picture')
    const again = createList(lib, 'Best Picture', now)
    expect(again.id).toBe('custom:best-picture-2')
    lib = setInList(lib, id, ref(1), true)
    lib = setInList(lib, id, ref(2), true)
    lib = setInList(lib, id, ref(1), true)
    expect(lib.lists![0].items!.map((i) => i.id)).toEqual([1, 2])
    lib = moveInList(lib, id, 0, 1)
    expect(lib.lists![0].items!.map((i) => i.id)).toEqual([2, 1])
    expect(customListsWith(lib, 'movie:1').map((l) => l.name)).toEqual(['Best Picture'])
    lib = setInList(lib, id, ref(1), false)
    lib = renameList(lib, id, 'Oscars')
    expect(lib.lists![0]).toMatchObject({ name: 'Oscars', items: [ref(2)] })
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib)))).toEqual(lib)
    expect(removeList(lib, id).lists).toEqual([])
  })

  it('follows people, collections and guides once', () => {
    let lib = followList(emptyLibrary(), { name: 'Christopher Nolan', source: { kind: 'person', personId: 525, role: 'director' }, imagePath: '/x.jpg' }, now)
    lib = followList(lib, { name: 'Again', source: { kind: 'person', personId: 525, role: 'director' } }, now)
    expect(lib.lists).toHaveLength(1)
    expect(lib.lists![0]).toMatchObject({ id: 'person:525:director', name: 'Christopher Nolan', imagePath: '/x.jpg' })
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib))).lists).toEqual(lib.lists)
  })

  it('works out progress over released titles only', () => {
    const lib = setStatus(setStatus(emptyLibrary(), { key: 'movie:1', type: 'movie', id: 1, title: { name: 'a', year: 1, posterPath: null } }, 'watched'), { key: 'movie:2', type: 'movie', id: 2, title: { name: 'b', year: 1, posterPath: null } }, 'watching')
    const p = progressOf([ref(1), ref(2), ref(3, null), ref(4, '2027-05-01')], lib, '2026-11-17')
    expect(p).toMatchObject({ seen: 1, total: 3 })
    expect(p.next?.id).toBe(2)
    expect(p.upcoming.map((u) => u.id)).toEqual([4])
    expect(releaseOrder([ref(3, null), ref(2, '2019-05-01'), ref(1, '2010-01-01')]).map((r) => r.id)).toEqual([1, 2, 3])
  })
})

describe('TMDB people', () => {
  it('keeps directing credits for directors, and real acting work for actors', () => {
    const p = parsePerson({
      id: 525,
      name: 'Someone',
      movie_credits: {
        crew: [
          { id: 1, title: 'Directed', release_date: '2010-07-15', job: 'Director' },
          { id: 1, title: 'Directed', release_date: '2010-07-15', job: 'Director' },
          { id: 2, title: 'Produced', job: 'Producer' }
        ],
        cast: [
          { id: 3, title: 'Acted', release_date: '2001-01-01', character: 'Leonard' },
          { id: 4, title: 'Documentary', character: 'Self' },
          { id: 5, title: 'Cameo', character: 'Man (uncredited)' }
        ]
      },
      tv_credits: {
        cast: [
          { id: 6, name: 'Regular', first_air_date: '2015-01-01', character: 'Lead', episode_count: 10 },
          { id: 7, name: 'Guest', character: 'Waiter', episode_count: 1 },
          { id: 8, name: 'Talk show', character: 'Guest', episode_count: 5, genre_ids: [10767] }
        ]
      }
    })
    expect(p.directed.map((r) => r.key)).toEqual(['movie:1'])
    expect(p.acted.map((r) => r.key)).toEqual(['movie:3', 'tv:6'])
    expect(p.directed[0]).toMatchObject({ date: '2010-07-15', year: 2010 })
  })

  it('reads directors and the main cast', () => {
    const c = parseCredits({ crew: [{ id: 9, name: 'D', job: 'Director' }, { id: 9, name: 'D', job: 'Director' }, { id: 10, name: 'W', job: 'Writer' }], cast: [{ id: 1, name: 'A', character: 'X', order: 1 }, { id: 2, name: 'B', character: 'Y', order: 0 }] })
    expect(c.directors.map((d) => d.id)).toEqual([9])
    expect(c.cast.map((d) => d.name)).toEqual(['B', 'A'])
    expect(refFromRaw({ id: 1, media_type: 'person', name: 'P' })).toBeNull()
  })
})

describe('guides', () => {
  it('have unique titles in story order', () => {
    for (const g of GUIDES) {
      const keys = guideRefs(g).map((r) => r.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.length).toBeGreaterThan(2)
    }
    expect(guidesWith('tv:83867').map((g) => g.id)).toEqual(['star-wars'])
    expect(guideRefs(GUIDES[0])[0]).toMatchObject({ key: 'movie:1771' })
    expect(guidesWith('tv:60059').map((g) => g.id)).toEqual(['breaking-bad'])
  })

  it('are found by what you search for', () => {
    expect(guideForQuery('The Walking Dead')?.id).toBe('walking-dead')
    expect(guideForQuery('better call saul')?.id).toBe('breaking-bad')
    expect(guideForQuery('MCU')?.id).toBe('marvel')
    expect(guideForQuery('The Avengers')?.id).toBe('marvel')
    expect(guideForQuery('Star Wars: Andor')?.id).toBe('star-wars')
    expect(guideForQuery('Interstellar')).toBeUndefined()
  })
})

describe('season by season', () => {
  const season = (number: number, airDate: string | null, episodeCount = 6) => ({ number, name: `Season ${number}`, episodeCount, airDate, posterPath: null })
  const info = {
    'tv:1402': { name: 'The Walking Dead', year: 2010, date: '2010-10-31', posterPath: '/twd.jpg', seasons: [season(0, '2010-01-01'), ...Array.from({ length: 11 }, (_, i) => season(i + 1, `${2010 + i}-10-01`))] },
    'tv:62286': { name: 'Fear the Walking Dead', year: 2015, date: '2015-08-23', posterPath: null, seasons: Array.from({ length: 8 }, (_, i) => season(i + 1, `${2015 + i}-06-01`)) }
  }

  it('lays shows out one season per row, interleaving by air date in release order', () => {
    const rows = expandGuide(WALKING_DEAD, info)
    const twd = rows.filter((r) => r.key === 'tv:1402')
    expect(twd.map((r) => r.season)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(rows.filter((r) => r.key === 'tv:62286')).toHaveLength(8)
    expect(rows[0]).toMatchObject({ key: 'tv:62286', season: 1, date: '2015-06-01' })
    const release = releaseOrder(rows.filter((r) => r.key === 'tv:1402' || r.key === 'tv:62286')).map((r) => `${r.key === 'tv:1402' ? 'T' : 'F'}${r.season}`)
    expect(release.slice(0, 8)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'F1', 'T6', 'F2'])
  })

  it('leaves out seasons without a date and specials', () => {
    const rows = expandGuide(WALKING_DEAD, { 'tv:1402': { ...info['tv:1402'], seasons: [season(0, '2010-01-01'), season(1, '2010-10-31'), season(2, null)] } })
    expect(rows.filter((r) => r.key === 'tv:1402').map((r) => r.season)).toEqual([1])
  })

  it('counts a season as seen once its episodes are ticked', () => {
    const ref = { key: 'tv:1402' as const, season: 2, episodes: 2 }
    const lib = (episodes: Record<string, string>, status: 'watching' | 'watched' = 'watching') => ({ version: 1, entries: { 'tv:1402': { key: 'tv:1402', type: 'tv', id: 1402, status, addedAt: '', updatedAt: '', title: { name: 'TWD', year: 2010, posterPath: null }, episodes } } }) as unknown as Library
    expect(isItemSeen(lib({ S2E1: '2020-01-01' }), ref)).toBe(false)
    expect(isItemSeen(lib({ S2E1: '2020-01-01', S2E2: '2020-01-02', S1E1: '2019-01-01' }), ref)).toBe(true)
    expect(isItemSeen(lib({}, 'watched'), ref)).toBe(true)
    expect(itemKey({ key: 'tv:1402', season: 2 })).toBe('tv:1402#s2')
  })
})
