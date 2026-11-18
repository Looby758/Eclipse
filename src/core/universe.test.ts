import { describe, expect, it } from 'vitest'
import { franchisesOf, stripWindow, namesRelated, sameUniverse, showCount, universeName, universeStrip } from './universe'
import type { LibraryEntry, TitleDetails } from './types'

const show = (id: number, name: string, date: string, seasons: [number, number][], extra: Partial<TitleDetails> = {}): TitleDetails => ({
  key: `tv:${id}`,
  type: 'tv',
  id,
  name,
  originalName: null,
  year: Number(date.slice(0, 4)),
  date,
  tagline: '',
  overview: '',
  posterPath: null,
  backdropPath: `/${id}.jpg`,
  genres: [],
  runtime: 45,
  status: 'Ended',
  voteAverage: 8,
  voteCount: 100,
  seasons: seasons.map(([number, episodeCount]) => ({ number, name: `Season ${number}`, episodeCount, airDate: date, posterPath: null })),
  numberOfSeasons: seasons.length,
  numberOfEpisodes: seasons.reduce((n, [, c]) => n + c, 0),
  nextEpisode: null,
  lastAirDate: null,
  collection: null,
  ...extra
})
const entry = (key: string, episodes: Record<string, string> = {}, status: LibraryEntry['status'] = 'watching'): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key: key as LibraryEntry['key'], type: type as 'tv', id: Number(id), status, addedAt: '', updatedAt: '', title: { name: 'x', year: null, posterPath: null }, episodes }
}

describe('names that go together', () => {
  it('links a show to its spin-offs', () => {
    expect(namesRelated('The Walking Dead', 'The Walking Dead: Dead City')).toBe(true)
    expect(namesRelated('The Walking Dead: Daryl Dixon', 'The Walking Dead: The Ones Who Live')).toBe(true)
    expect(namesRelated('Fear the Walking Dead', 'The Walking Dead')).toBe(true)
    expect(namesRelated('Fear the Walking Dead', 'The Walking Dead: Daryl Dixon')).toBe(true)
    expect(namesRelated('Breaking Bad', 'El Camino: A Breaking Bad Movie')).toBe(true)
  })

  it("doesn't link titles that only share a short word", () => {
    expect(namesRelated('The Office', 'The Office')).toBe(false)
    expect(namesRelated('The Crown', 'The Crown Jewels Heist')).toBe(false)
    expect(namesRelated('Severance', 'Arcane')).toBe(false)
    expect(namesRelated('Dune', 'Dune: Part Two')).toBe(true)
  })
})

describe('same universe', () => {
  it('uses the watch-order guides, film series and franchise keywords', () => {
    expect(sameUniverse({ key: 'tv:1402', name: 'The Walking Dead' }, { key: 'tv:62286', name: 'Fear the Walking Dead' })).toBe(true)
    expect(sameUniverse({ key: 'movie:1', name: 'A', collectionId: 9 }, { key: 'movie:2', name: 'B', collectionId: 9 })).toBe(true)
    expect(sameUniverse({ key: 'tv:3', name: 'Peacemaker', keywords: ['dc extended universe (dceu)'] }, { key: 'movie:4', name: 'The Suicide Squad', keywords: ['dc extended universe (dceu)'] })).toBe(true)
    expect(sameUniverse({ key: 'tv:5', name: 'Severance' }, { key: 'tv:6', name: 'Arcane' })).toBe(false)
    expect(sameUniverse({ key: 'tv:5', name: 'Severance' }, { key: 'tv:5', name: 'Severance' })).toBe(false)
  })

  it('reads franchises from keywords', () => {
    expect(franchisesOf(['star wars', 'space opera', 'marvel cinematic universe (mcu)'])).toEqual(['Star Wars', 'Marvel'])
    expect(franchisesOf(undefined)).toEqual([])
  })

  it('names the universe', () => {
    expect(universeName(show(1402, 'The Walking Dead', '2010-10-31', []))).toBe('The Walking Dead')
    expect(universeName({ key: 'movie:1', name: 'Dune: Part Two', collection: { id: 1, name: 'Dune Collection' } })).toBe('Dune')
    expect(universeName({ key: 'tv:9', name: 'Show: Spin-off', collection: null })).toBe('Show')
  })
})

describe('counts and the strip', () => {
  const twd = show(1402, 'The Walking Dead', '2010-10-31', [[0, 2], [1, 6], [2, 13]])
  it('counts regular episodes seen, out of those out, and the time left', () => {
    const e = entry('tv:1402', { S1E1: 'seen', S1E2: 'seen', S0E1: 'seen', S9E9: 'seen' })
    expect(showCount(twd, e, '2026-01-01')).toEqual({ seen: 2, total: 19, minutesLeft: 17 * 45 })
    expect(showCount(twd, entry('tv:1402', {}, 'watched'), '2026-01-01')).toEqual({ seen: 19, total: 19, minutesLeft: 0 })
    expect(showCount(twd, undefined, '2026-01-01').total).toBe(19)
  })

  it('lists only related titles in your library, in release order, marking this one', () => {
    const dd = show(211684, 'The Walking Dead: Daryl Dixon', '2023-09-10', [[1, 6]])
    const owl = show(206586, 'The Walking Dead: The Ones Who Live', '2024-02-25', [[1, 6]])
    const entries = { 'tv:1402': entry('tv:1402', { S1E1: 'seen' }), 'tv:206586': entry('tv:206586') }
    const strip = universeStrip(twd, [owl, dd], entries, '2026-01-01')
    expect(strip.map((s) => s.name)).toEqual(['The Walking Dead', 'The Walking Dead: The Ones Who Live'])
    expect(strip[0]).toMatchObject({ current: true, seen: 1, total: 19, line: 'Next: S1 E2 · 1 of 19' })
    expect(strip[1]).toMatchObject({ current: false, line: 'Not started · 0 of 6' })
    expect(universeStrip(twd, [], entries, '2026-01-01')).toEqual([])
  })
})

describe('a big universe along the bottom', () => {
  const items = (n: number, at: number) => Array.from({ length: n }, (_, i) => ({ i, current: i === at }))
  it('shows all of a small one, else this title and its neighbours with room for See all', () => {
    expect(stripWindow(items(6, 2)).length).toBe(6)
    expect(stripWindow(items(52, 20)).map((x) => x.i)).toEqual([18, 19, 20, 21, 22])
    expect(stripWindow(items(52, 0)).map((x) => x.i)).toEqual([0, 1, 2, 3, 4])
    expect(stripWindow(items(52, 51)).map((x) => x.i)).toEqual([47, 48, 49, 50, 51])
  })
})
