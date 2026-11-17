import { describe, expect, it } from 'vitest'
import { episodesCsv, exportFiles, listsCsv, rewatchesCsv, titlesCsv, toCsv } from './export'
import { emptyLibrary, markSeenBefore, setEpisodes, setNote, setStatus, startRewatch } from './library'

const bb = { key: 'tv:1396' as const, type: 'tv' as const, id: 1396, title: { name: 'Breaking Bad', year: 2008, posterPath: null } }
const dune = { key: 'movie:438631' as const, type: 'movie' as const, id: 438631, title: { name: 'Dune', year: 2021, posterPath: null } }
const at = (d: string): Date => new Date(`${d}T20:00:00`)

function sample() {
  let lib = setEpisodes(emptyLibrary(), bb, ['S1E2', 'S1E1'], true, at('2024-03-02'))
  lib = setStatus(lib, bb, 'watched', at('2024-03-03'))
  lib = startRewatch(lib, bb, at('2026-11-01'))
  lib = setEpisodes(lib, bb, ['S1E1'], true, at('2026-11-02'))
  lib = markSeenBefore(lib, dune, at('2026-11-17'))
  lib = setNote(lib, dune.key, 'with Dad, "the long cut", =great', at('2026-11-17'))
  return { ...lib, lists: [{ id: 'custom:a', name: 'Sci-fi', source: { kind: 'custom' as const }, addedAt: '', items: [{ key: dune.key, type: 'movie' as const, id: dune.id, name: 'Dune', year: 2021, posterPath: null }] }] }
}

describe('export', () => {
  it('quotes cells, defuses formulas and starts with a byte-order mark', () => {
    expect(toCsv([['a,b', 'say "hi"', '=1+1', 3, null, true]])).toBe('﻿"a,b","say ""hi""",\'=1+1,3,,yes\r\n')
  })

  it('lists titles with status, dates and watch counts', () => {
    const lines = titlesCsv(sample()).slice(1).trim().split('\r\n')
    expect(lines[0]).toMatch(/^Title,Year,Type,Status,Watched on,/)
    expect(lines[1]).toMatch(/^Breaking Bad,2008,Show,Watched,2024-03-03,,1,2,/)
    expect(lines[2]).toMatch(/^Dune,2021,Film,Watched,,yes,1,,,"with Dad, ""the long cut"", =great",,/)
  })

  it('lists every episode ticked, first watch and rewatches', () => {
    expect(episodesCsv(sample()).slice(1).trim().split('\r\n')).toEqual([
      'Show,Season,Episode,Watched on,Watch',
      'Breaking Bad,1,1,2024-03-02,First watch',
      'Breaking Bad,1,2,2024-03-02,First watch',
      'Breaking Bad,1,1,2026-11-02,Rewatch 1'
    ])
    expect(rewatchesCsv(sample())).toContain('Breaking Bad,Show,1,2026-11-01,still going')
  })

  it('lists your own lists with their titles', () => {
    expect(listsCsv(sample())).toContain('Sci-fi,Your list,1,Dune,2021,Film,')
  })

  it('includes the library file as it is', () => {
    const files = exportFiles(sample())
    expect(files.map((f) => f.name)).toEqual(['library.json', 'titles.csv', 'episodes.csv', 'rewatches.csv', 'lists.csv', 'README.txt'])
    expect(JSON.parse(files[0].text)).toEqual(sample())
  })
})
