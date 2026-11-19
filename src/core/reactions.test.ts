import { describe, expect, it } from 'vitest'
import { compareMine, buildHeatmap } from './heatmap'
import { normalizeLibrary, setEpisodes, startRewatch, tickWith, startWatchWith } from './library'
import { episodesCsv } from './export'
import { freshTick, reactionOf, reactionsOf, reactionWeight, setReaction, disagreement } from './reactions'
import { seedsOf } from './recommend'
import type { Library, SeasonDetails } from './types'

const item = { key: 'tv:1' as const, type: 'tv' as const, id: 1, title: { name: 'The Walking Dead', year: 2010, posterPath: null } }
const day = (d: string): Date => new Date(`${d}T20:00:00`)
const empty = (): Library => ({ version: 1, entries: {} })

describe('reactions', () => {
  it('saves a reaction with the tick, and only on a ticked episode', () => {
    let lib = setEpisodes(empty(), item, ['S1E1'], true, day('2026-11-18'))
    expect(setReaction(lib, 'tv:1', 'S1E2', 'fire')).toBe(lib)
    lib = setReaction(lib, 'tv:1', 'S1E1', 'fire')
    expect(lib.entries['tv:1'].reactions).toEqual({ S1E1: 'fire' })
    lib = setReaction(lib, 'tv:1', 'S1E1', null)
    expect(lib.entries['tv:1'].reactions).toBeUndefined()
  })

  it('goes on the rewatch when that is the latest tick, and the newest reaction wins', () => {
    let lib = setEpisodes(empty(), item, ['S1E1'], true, day('2025-01-01'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'sleep')
    lib = startRewatch(lib, item, day('2026-11-01'))
    lib = setEpisodes(lib, item, ['S1E1'], true, day('2026-11-02'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'wow')
    const e = lib.entries['tv:1']
    expect(e.reactions).toEqual({ S1E1: 'sleep' })
    expect(e.rewatches![0].reactions).toEqual({ S1E1: 'wow' })
    expect(reactionOf(e, 'S1E1')).toBe('wow')
  })

  it('falls back to an earlier watch when the latest tick has no reaction', () => {
    let lib = setEpisodes(empty(), item, ['S1E1'], true, day('2025-01-01'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'cry')
    lib = startWatchWith(lib, item, 'Sam', day('2026-11-01'))
    lib = tickWith(lib, 'tv:1', 0, ['S1E1'], true, day('2026-11-02'))
    expect(reactionsOf(lib.entries['tv:1'])).toEqual({ S1E1: 'cry' })
  })

  it('drops the reaction when the episode is unticked', () => {
    let lib = setEpisodes(empty(), item, ['S1E1', 'S1E2'], true, day('2026-11-18'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'laugh')
    lib = setReaction(lib, 'tv:1', 'S1E2', 'fire')
    lib = setEpisodes(lib, item, ['S1E1'], false)
    expect(lib.entries['tv:1'].reactions).toEqual({ S1E2: 'fire' })
  })

  it('survives saving and loading, and leaves out junk', () => {
    let lib = setEpisodes(empty(), item, ['S1E1'], true, day('2026-11-18'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'fire')
    const raw = JSON.parse(JSON.stringify(lib))
    raw.entries['tv:1'].reactions.S1E2 = 'fire'
    raw.entries['tv:1'].reactions.S1E3 = 'meh'
    expect(normalizeLibrary(raw).entries['tv:1'].reactions).toEqual({ S1E1: 'fire' })
  })

  it('is in the episodes export', () => {
    let lib = setEpisodes(empty(), item, ['S1E1'], true, day('2026-11-18'))
    lib = setReaction(lib, 'tv:1', 'S1E1', 'wow')
    expect(episodesCsv(lib)).toContain('2026-11-18,First watch,🤯 Mind-blown')
  })
})

describe('freshTick', () => {
  it('asks about one episode just ticked today', () => {
    const before = setEpisodes(empty(), item, ['S1E1'], true, day('2026-11-18'))
    const after = setEpisodes(before, item, ['S1E2'], true, day('2026-11-19'))
    expect(freshTick(before, after, '2026-11-19')).toEqual({ key: 'tv:1', name: 'The Walking Dead', season: 1, episode: 2 })
  })

  it("doesn't ask about a batch, an undated tick, an old day or one already reacted to", () => {
    const before = setEpisodes(empty(), item, ['S1E1'], true, day('2026-11-18'))
    expect(freshTick(before, setEpisodes(before, item, ['S1E2', 'S1E3'], true, day('2026-11-19')), '2026-11-19')).toBeNull()
    expect(freshTick(before, setEpisodes(before, item, ['S1E2'], true, day('2026-11-19'), true), '2026-11-19')).toBeNull()
    expect(freshTick(before, setEpisodes(before, item, ['S1E2'], true, day('2026-11-17')), '2026-11-19')).toBeNull()
    const reacted = setReaction(setEpisodes(before, item, ['S1E2'], true, day('2026-11-19')), 'tv:1', 'S1E2', 'fire')
    expect(freshTick(before, reacted, '2026-11-19')).toBeNull()
  })
})

const season = (ratings: number[]): SeasonDetails => ({
  tvId: 1,
  number: 1,
  name: 'Season 1',
  episodes: ratings.map((r, i) => ({ season: 1, number: i + 1, name: `E${i + 1}`, airDate: '2024-01-01', runtime: 45, overview: '', voteAverage: r, voteCount: 100, stillPath: null }))
})

describe('Mine against TMDB', () => {
  it('finds where you and TMDB disagree', () => {
    expect(disagreement('sleep', 9, 7, 9)).toBe('dragged')
    expect(disagreement('fire', 7.2, 7, 9)).toBe('loved')
    expect(disagreement('laugh', 7, 7, 9)).toBeNull()
    expect(disagreement('fire', 9, 7, 9)).toBeNull()
  })

  it('lays your reactions over the heatmap, biggest disagreement first', () => {
    const map = buildHeatmap([season([7, 8, 9, 7.5])], undefined, '2026-11-19')
    const mine = compareMine(map, { S1E1: 'wow', S1E3: 'sleep', S1E2: 'fire', S1E4: 'fire' })
    expect(mine.total).toBe(4)
    expect(mine.counts).toMatchObject({ wow: 1, sleep: 1, fire: 2 })
    expect(mine.differ.map((m) => `${m.cell.episode}${m.differs}`)).toEqual(['1loved', '3dragged', '4loved'])
  })
})

describe('recommendations learn from reactions', () => {
  it('weights a show by how it hit you', () => {
    let lib = setEpisodes(empty(), item, ['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5'], true, day('2026-11-18'))
    expect(reactionWeight(lib.entries['tv:1'])).toBe(1)
    for (const k of ['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5']) lib = setReaction(lib, 'tv:1', k, 'sleep')
    expect(reactionWeight(lib.entries['tv:1'])).toBe(0.5)
    const bored = seedsOf(lib, day('2026-11-19'))[0].weight
    for (const k of ['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5']) lib = setReaction(lib, 'tv:1', k, 'fire')
    expect(reactionWeight(lib.entries['tv:1'])).toBe(1.5)
    expect(seedsOf(lib, day('2026-11-19'))[0].weight).toBeCloseTo(bored * 3)
  })
})
