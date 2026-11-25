import { describe, expect, it } from 'vitest'
import { episodesFor, episodesText, findInLibrary, hoursText, keyOf, parseWant, pickFromSearch } from './claude'
import { setStatus } from './library'
import type { Library, SearchResult } from './types'
import { REACTION_LIST } from './types'

const item = (type: 'movie' | 'tv', id: number, name: string, year: number | null = 2020) => ({ key: `${type}:${id}` as const, type, id, title: { name, year, posterPath: null } })

function lib(): Library {
  let l: Library = { version: 1, entries: {} }
  l = setStatus(l, item('tv', 1396, 'Breaking Bad', 2008), 'watched')
  l = setStatus(l, item('movie', 438631, 'Dune', 2021), 'watched')
  l = setStatus(l, item('movie', 841, 'Dune', 1984), 'want')
  l = setStatus(l, item('tv', 95396, 'Severance', 2022), 'watching')
  l = setStatus(l, item('movie', 335984, 'Blade Runner 2049', 2017), 'want')
  return l
}

const result = (type: 'movie' | 'tv', id: number, name: string, year: number | null, popularity = 10): SearchResult => ({ key: `${type}:${id}`, type, id, name, year, posterPath: null, overview: '', popularity })

describe('naming titles', () => {
  it('only takes a year in brackets', () => {
    expect(parseWant('Dune (2021)')).toEqual({ name: 'Dune', year: 2021 })
    expect(parseWant('Blade Runner 2049')).toEqual({ name: 'Blade Runner 2049', year: null })
    expect(parseWant('  Severance ')).toEqual({ name: 'Severance', year: null })
  })

  it('reads keys', () => {
    expect(keyOf('tv:1396')).toBe('tv:1396')
    expect(keyOf(' TV:1396 ')).toBe('tv:1396')
    expect(keyOf('Breaking Bad')).toBeNull()
  })

  it('finds the one in the library, any case and punctuation', () => {
    expect(findInLibrary(lib(), 'breaking bad').map((e) => e.key)).toEqual(['tv:1396'])
    expect(findInLibrary(lib(), 'sever').map((e) => e.key)).toEqual(['tv:95396'])
    expect(findInLibrary(lib(), 'Blade Runner 2049').map((e) => e.key)).toEqual(['movie:335984'])
    expect(findInLibrary(lib(), 'tv:1396').map((e) => e.key)).toEqual(['tv:1396'])
  })

  it('lists every match when it is ambiguous, and the year settles it', () => {
    expect(findInLibrary(lib(), 'Dune').map((e) => e.key).sort()).toEqual(['movie:438631', 'movie:841'])
    expect(findInLibrary(lib(), 'Dune (1984)').map((e) => e.key)).toEqual(['movie:841'])
    expect(findInLibrary(lib(), 'Dune', 'tv')).toEqual([])
  })

  it('picks from TMDB only when it is clear', () => {
    const results = [result('tv', 1, 'The Office', 2005, 200), result('tv', 2, 'The Office', 2001, 60), result('movie', 3, 'Office Space', 1999)]
    expect(pickFromSearch(results, 'The Office').pick).toBeNull()
    expect(pickFromSearch(results, 'The Office (2001)').pick?.id).toBe(2)
    expect(pickFromSearch(results, 'Office Space').pick?.id).toBe(3)
    expect(pickFromSearch(results, 'Office').pick).toBeNull()
    expect(pickFromSearch(results, 'Office').options).toHaveLength(3)
    // Far more popular: that's the one people mean.
    expect(pickFromSearch([result('movie', 4, 'Alien', 1979, 100), result('movie', 5, 'Alien', 2003, 2)], 'Alien').pick?.id).toBe(4)
  })
})

describe('which episodes', () => {
  const seasons = [
    { number: 0, episodeCount: 2 },
    { number: 1, episodeCount: 3 },
    { number: 2, episodeCount: 2 }
  ]
  it('one, a run, a season, up to one, or all', () => {
    expect(episodesFor(seasons, { season: 1, episode: 2 })).toEqual(['S1E2'])
    expect(episodesFor(seasons, { season: 1, episode: 2, toEpisode: 9 })).toEqual(['S1E2', 'S1E3'])
    expect(episodesFor(seasons, { season: 2 })).toEqual(['S2E1', 'S2E2'])
    expect(episodesFor(seasons, { season: 2, episode: 1, upTo: true })).toEqual(['S1E1', 'S1E2', 'S1E3', 'S2E1'])
    expect(episodesFor(seasons, { all: true })).toEqual(['S1E1', 'S1E2', 'S1E3', 'S2E1', 'S2E2'])
  })
  it('says what’s wrong', () => {
    expect(() => episodesFor(seasons, { season: 5 })).toThrow(/no season 5/)
    expect(() => episodesFor(seasons, { season: 1, episode: 9 })).toThrow(/3 episodes/)
    expect(() => episodesFor(seasons, {})).toThrow(/which season/)
  })
  it('describes a batch in short', () => {
    expect(episodesText(['S1E1', 'S1E2', 'S1E3', 'S2E1', 'S2E4'])).toBe('S01E01 to S01E03, S02E01, S02E04')
  })
})

it('writes hours', () => {
  expect(hoursText(45)).toBe('45 min')
  expect(hoursText(120)).toBe('2 h')
  expect(hoursText(125)).toBe('2 h 5 min')
})

it('the reaction tool offers every reaction', async () => {
  const src = await import('fs').then((fs) => fs.readFileSync(new URL('../main/claudeTools.ts', import.meta.url), 'utf8'))
  for (const r of REACTION_LIST) expect(src).toContain(`'${r}'`)
})
