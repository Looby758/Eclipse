import { describe, expect, it } from 'vitest'
import { parseTitleLink } from './links'

describe('pasting a link into search', () => {
  it('reads TMDB links for films and shows', () => {
    expect(parseTitleLink('https://www.themoviedb.org/tv/1396-breaking-bad')).toEqual({ kind: 'tmdb', type: 'tv', id: 1396 })
    expect(parseTitleLink('themoviedb.org/movie/438631-dune?language=en-GB')).toEqual({ kind: 'tmdb', type: 'movie', id: 438631 })
    expect(parseTitleLink(' https://www.themoviedb.org/movie/550 ')).toEqual({ kind: 'tmdb', type: 'movie', id: 550 })
  })

  it('reads IMDb links and bare IMDb ids', () => {
    expect(parseTitleLink('https://www.imdb.com/title/tt0903747/')).toEqual({ kind: 'imdb', imdbId: 'tt0903747' })
    expect(parseTitleLink('https://m.imdb.com/title/tt1160419/?ref_=nv_sr_srsg_0')).toEqual({ kind: 'imdb', imdbId: 'tt1160419' })
    expect(parseTitleLink('tt0903747')).toEqual({ kind: 'imdb', imdbId: 'tt0903747' })
  })

  it('leaves ordinary searches alone', () => {
    expect(parseTitleLink('breaking bad')).toBeNull()
    expect(parseTitleLink('tt')).toBeNull()
    expect(parseTitleLink('https://www.themoviedb.org/person/17419-bryan-cranston')).toBeNull()
    expect(parseTitleLink('https://www.imdb.com/name/nm0186505/')).toBeNull()
    expect(parseTitleLink('')).toBeNull()
  })
})
