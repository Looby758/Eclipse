import { describe, expect, it } from 'vitest'
import { knownFrom } from './knownfrom'
import { emptyLibrary, markSeenBefore, setEpisodes, setStatus } from './library'
import type { PersonDetails, TitleRef } from './types'

const ref = (key: `${'movie' | 'tv'}:${number}`, name: string): TitleRef => {
  const [type, id] = key.split(':')
  return { key, type: type as 'movie', id: Number(id), name, year: 2015, posterPath: null }
}
const item = (r: TitleRef) => ({ key: r.key, type: r.type, id: r.id, title: { name: r.name, year: r.year, posterPath: null } })

describe('where do I know them from', () => {
  const bcs = ref('tv:60059', 'Better Call Saul')
  const bb = ref('tv:1396', 'Breaking Bad')
  const elCamino = ref('movie:559969', 'El Camino')
  const lucky = ref('movie:9', 'Unseen Film')
  const people: Record<number, PersonDetails> = {
    1: { id: 1, name: 'Rhea Seehorn', profilePath: null, knownFor: 'Acting', directed: [], acted: [bcs, lucky] },
    2: { id: 2, name: 'Aaron Paul', profilePath: null, knownFor: 'Acting', directed: [], acted: [bb, elCamino, bcs] },
    3: { id: 3, name: 'Someone New', profilePath: null, knownFor: 'Acting', directed: [], acted: [lucky] }
  }
  const cast = [1, 2, 3].map((id) => ({ id, name: people[id].name, profilePath: null, role: '' }))

  it('finds cast from things you watched or are part-way through, latest first', () => {
    let lib = setEpisodes(emptyLibrary(), item(bcs), ['S1E1'], true, new Date('2026-03-01T20:00:00'))
    lib = setStatus(lib, item(bb), 'watched', new Date('2025-01-01T20:00:00'))
    lib = markSeenBefore(lib, item(elCamino))
    lib = setStatus(lib, item(lucky), 'want')
    const found = knownFrom(cast, people, lib, 'tv:999')
    expect(found.map((k) => [k.person.name, k.titles.map((t) => t.name)])).toEqual([
      ['Rhea Seehorn', ['Better Call Saul']],
      ['Aaron Paul', ['Better Call Saul', 'Breaking Bad', 'El Camino']]
    ])
  })

  it('leaves out the title you are looking at', () => {
    const lib = setStatus(emptyLibrary(), item(bcs), 'watched')
    expect(knownFrom(cast, people, lib, 'tv:60059')).toEqual([])
  })
})
