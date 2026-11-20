import { describe, expect, it } from 'vitest'
import { candidateLists, hideRecommendation, rankRecommendations, recommend, seedsOf, SIMILAR_WEIGHT } from './recommend'
import { normalizeLibrary } from './library'
import type { SearchResult, Trait } from './types'

const r = (key: string, name: string): SearchResult => {
  const [type, id] = key.split(':')
  return { key: key as SearchResult['key'], type: type as 'movie' | 'tv', id: Number(id), name, year: 2020, posterPath: '/p.jpg', overview: '', popularity: 1 }
}
const e = (key: string, name: string, over: object) => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watched', addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: { name, year: 2020, posterPath: null }, ...over }
}
const lib = normalizeLibrary({
  version: 1,
  entries: {
    'tv:1': e('tv:1', 'Breaking Bad', { status: 'watching', episodes: { S1E1: '2026-11-10' } }),
    'movie:2': e('movie:2', 'Dune', { watchedOn: '2026-10-01', rating: 9 }),
    'movie:3': e('movie:3', 'Old film', { watchedOn: '2015-01-01' }),
    'movie:4': e('movie:4', 'Disliked', { watchedOn: '2026-11-01', rating: 4 }),
    'movie:5': e('movie:5', 'On my list', { status: 'want' })
  }
})
const now = new Date(2026, 10, 17)

describe('recommendations', () => {
  it('picks what you watched lately and liked, not what you disliked', () => {
    const seeds = seedsOf(lib, now)
    expect(seeds.map((s) => s.name)).toEqual(['Dune', 'Breaking Bad', 'Old film'])
  })
  it('adds up the lists, leaves out your library, and says why', () => {
    const seeds = seedsOf(lib, now)
    const by = (n: string) => seeds.find((s) => s.name === n)!
    const recs = recommend(lib, [
      { seed: by('Dune'), results: [r('movie:10', 'Arrival'), r('movie:11', 'Blade Runner'), r('movie:5', 'On my list')] },
      { seed: by('Breaking Bad'), results: [r('tv:20', 'Better Call Saul'), r('movie:11', 'Blade Runner')] },
      { seed: by('Old film'), results: [r('movie:12', 'Something old')] }
    ])
    expect(recs[0]).toMatchObject({ key: 'movie:11', because: ['Dune', 'Breaking Bad'] })
    expect(recs.map((x) => x.key)).not.toContain('movie:5')
    expect(recs[recs.length - 1].key).toBe('movie:12')
    const hidden = hideRecommendation(lib, 'movie:11')
    expect(recommend(hidden, [{ seed: by('Dune'), results: [r('movie:11', 'Blade Runner')] }])).toEqual([])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(hidden))).recsHidden).toEqual(['movie:11'])
  })
})

describe('the shared ranking (computer and phone)', () => {
  const lists = {
    'movie:2': [r('movie:10', 'Arrival'), r('movie:11', 'Blade Runner')],
    'tv:1': [r('tv:20', 'Better Call Saul')]
  } as Record<string, SearchResult[]>
  const sources = {
    recommendations: async (key: string) => lists[key] ?? [],
    similar: async (key: string) => {
      if (key === 'movie:3') throw new Error('offline')
      return key === 'movie:2' ? [r('movie:12', 'Sicario')] : []
    },
    traits: async (key: string): Promise<Trait[]> => (key === 'movie:11' ? [{ id: 'creator:9', name: 'Ridley Scott' }] : [])
  }

  it('takes both lists for every seed, with similar counting for less, and skips ones it can’t fetch', async () => {
    const got = await candidateLists(seedsOf(lib, now), sources)
    const dune = got.filter((l) => l.seed.key === 'movie:2')
    expect(dune).toHaveLength(2)
    const [recs, similar] = [dune.find((l) => l.results[0].key === 'movie:10')!, dune.find((l) => l.results[0].key === 'movie:12')!]
    expect(similar.seed.weight).toBeCloseTo(recs.seed.weight * SIMILAR_WEIGHT)
    // Old film's "similar" failed, its "recommended" still came through.
    expect(got.filter((l) => l.seed.key === 'movie:3')).toHaveLength(1)
  })

  it('moves picks by what it has learnt, and leaves them alone before then', async () => {
    const got = await candidateLists(seedsOf(lib, now), sources)
    const plain = await rankRecommendations(lib, got, sources)
    expect(plain[0].key).toBe('movie:10')
    const taught = { ...lib, recsTaste: { weights: { 'creator:9': { w: 2, name: 'Ridley Scott' } }, yes: 3, no: 0 } }
    const learnt = await rankRecommendations(taught, got, sources)
    expect(learnt[0]).toMatchObject({ key: 'movie:11', liked: ['Ridley Scott'] })
    // A taste passed in (the phone's, with its own answers) wins over the library's.
    const other = await rankRecommendations(lib, got, sources, { limit: 2 }, taught.recsTaste)
    expect(other.map((x) => x.key)).toEqual(['movie:11', 'movie:10'])
  })
})
