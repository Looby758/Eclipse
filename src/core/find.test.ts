import { describe, expect, it } from 'vitest'
import { emptyLibrary, entriesWith, setEpisodes, setStatus } from './library'
import { lastWatched, matchesQuery, sortEntries } from './find'

const t = (id: number, name: string, year: number, type: 'movie' | 'tv' = 'movie') => ({ key: `${type}:${id}` as const, type, id, title: { name, year, posterPath: null } })

describe('finding things in your library', () => {
  let lib = setStatus(emptyLibrary(), t(1, 'Amélie', 2001), 'watched', new Date('2024-02-01T20:00:00Z'))
  lib = setStatus(lib, t(2, 'Spider-Man: No Way Home', 2021), 'want', new Date('2025-06-01T20:00:00Z'))
  lib = setEpisodes(lib, t(3, 'Andor', 2022, 'tv'), ['S1E1', 'S1E2'], true, new Date('2026-11-10T20:00:00Z'))
  lib = setStatus(lib, t(4, 'Dune', 2021), 'want', new Date('2023-01-01T20:00:00Z'))
  const all = entriesWith(lib)

  it('matches ignoring case, accents, punctuation and word order', () => {
    const names = (q: string) => all.filter((e) => matchesQuery(e, q)).map((e) => e.title.name)
    expect(names('amelie')).toEqual(['Amélie'])
    expect(names('spiderman')).toEqual(['Spider-Man: No Way Home'])
    expect(names('home spider')).toEqual(['Spider-Man: No Way Home'])
    expect(names('')).toHaveLength(4)
  })

  it('sorts A to Z, by year, by date added and by last watched', () => {
    const names = (s: Parameters<typeof sortEntries>[1]) => sortEntries(all, s).map((e) => e.title.name)
    expect(names('az')).toEqual(['Amélie', 'Andor', 'Dune', 'Spider-Man: No Way Home'])
    expect(names('year')).toEqual(['Andor', 'Dune', 'Spider-Man: No Way Home', 'Amélie'])
    expect(names('added')).toEqual(['Andor', 'Spider-Man: No Way Home', 'Amélie', 'Dune'])
    expect(names('watched').slice(0, 2)).toEqual(['Andor', 'Amélie'])
  })

  it('knows the last day you watched something', () => {
    expect(lastWatched(lib.entries['tv:3'])).toBe('2026-11-10')
    expect(lastWatched(lib.entries['movie:4'])).toBeNull()
  })
})
