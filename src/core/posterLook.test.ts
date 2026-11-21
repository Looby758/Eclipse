import { describe, expect, it } from 'vitest'
import { emptyLibrary } from './library'
import { posterInfo, posterInfos, shownPoster } from './posterLook'
import type { Library, LibraryEntry, Season } from './types'

const show = (over: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ key: 'tv:1', type: 'tv', id: 1, status: 'watching', addedAt: '', updatedAt: '', title: { name: 'Andor', year: 2022, posterPath: '/andor.jpg' }, ...over }) as LibraryEntry
const seasons: Season[] = [
  { number: 1, name: 'Season 1', episodeCount: 2, airDate: null, posterPath: '/s1.jpg' },
  { number: 2, name: 'Season 2', episodeCount: 2, airDate: null, posterPath: '/s2.jpg' }
]

describe('posters that fill in and follow the season (phases 63 and 66)', () => {
  it('fills as far as you have got, and uses the season you are on', () => {
    expect(posterInfo(show({ episodes: { S1E1: '2024-01-01' } }), { seasons })).toEqual({ fill: 0.25, season: '/s1.jpg' })
    expect(posterInfo(show({ episodes: { S1E1: 'd', S1E2: 'd' } }), { seasons })).toEqual({ fill: 0.5, season: '/s2.jpg' })
  })
  it('leaves finished, untouched and stopped-at-the-start shows as they are', () => {
    expect(posterInfo(show({ status: 'watched', episodes: { S1E1: 'd', S1E2: 'd', S2E1: 'd', S2E2: 'd' } }), { seasons })).toEqual({ fill: null, season: null })
    expect(posterInfo(show(), { seasons })).toEqual({ fill: null, season: null })
    expect(posterInfo(show({ status: 'stopped', episodes: { S1E1: 'd' } }), { seasons })).toEqual({ fill: 0.25, season: null })
  })
  it('lets a poster you chose win', () => {
    const library: Library = { ...emptyLibrary(), entries: { 'tv:1': show({ episodes: { S1E1: 'd' } }) }, posters: { 'tv:1': '/mine.jpg' } }
    const info = posterInfos(library, { 'tv:1': { seasons } })['tv:1']
    expect(shownPoster(library, 'tv:1', '/andor.jpg', info)).toBe('/mine.jpg')
    expect(shownPoster({ ...library, posters: undefined }, 'tv:1', '/andor.jpg', info)).toBe('/s1.jpg')
  })
})
