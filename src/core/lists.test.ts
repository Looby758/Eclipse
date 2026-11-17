import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, setStatus } from './library'
import { createList, customListsWith, followList, listIdFor, moveInList, progressOf, releaseOrder, removeList, renameList, setInList, sourceOf } from './lists'
import { GUIDES, guideForQuery, guideRefs, guidesWith } from './guides'
import { parseCredits, parsePerson, refFromRaw } from './tmdb'
import type { TitleRef } from './types'

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
