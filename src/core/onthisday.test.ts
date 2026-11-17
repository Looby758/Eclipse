import { describe, expect, it } from 'vitest'
import { agoLabel, episodeSpan, onThisDay } from './onthisday'
import { emptyLibrary } from './library'
import type { Library, LibraryEntry } from './types'

const e = (key: string, over: Partial<LibraryEntry>): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key: key as LibraryEntry['key'], type: type as 'movie', id: Number(id), status: 'watched', addedAt: '', updatedAt: '', title: { name: key, year: null, posterPath: null }, ...over }
}
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((x) => [x.key, x])) })

describe('onThisDay', () => {
  it('finds films and episodes from today in earlier years, with notes', () => {
    const l = lib(
      e('movie:1', { watchedOn: '2025-11-17', note: 'with Dad' }),
      e('movie:2', { watchedOn: '2024-11-17' }),
      e('movie:3', { watchedOn: '2026-11-17' }),
      e('movie:4', {}),
      e('tv:5', { status: 'watching', episodes: { S1E2: '2025-11-17', S1E1: '2025-11-17', S1E3: '2025-11-18' } })
    )
    const r = onThisDay(l, '2026-11-17')
    expect(r.nearby).toBe(false)
    expect(r.memories.map((m) => [m.key, m.yearsAgo, m.kind, m.episodes])).toEqual([
      ['movie:1', 1, 'title', []],
      ['tv:5', 1, 'episodes', ['S1E1', 'S1E2']],
      ['movie:2', 2, 'title', []]
    ])
    expect(r.memories[0].note).toBe('with Dad')
  })

  it('folds the finishing episodes into a show marked Watched that day', () => {
    const r = onThisDay(lib(e('tv:5', { watchedOn: '2025-11-17', episodes: { S2E9: '2025-11-17', S2E10: '2025-11-17' } })), '2026-11-17')
    expect(r.memories).toHaveLength(1)
    expect(r.memories[0]).toMatchObject({ kind: 'title', episodes: ['S2E9', 'S2E10'] })
  })

  it('falls back to the same week, across the new year', () => {
    const r = onThisDay(lib(e('movie:1', { watchedOn: '2025-12-30' }), e('movie:2', { watchedOn: '2025-12-20' })), '2027-01-02')
    expect(r.nearby).toBe(true)
    expect(r.memories.map((m) => m.key)).toEqual(['movie:1'])
  })

  it('shows 29 February on 28 February in other years', () => {
    expect(onThisDay(lib(e('movie:1', { watchedOn: '2024-02-29' })), '2025-02-28').memories).toHaveLength(1)
    expect(onThisDay(lib(e('movie:1', { watchedOn: '2024-02-29' })), '2028-02-28').nearby).toBe(true)
  })

  it('words things', () => {
    expect(episodeSpan(['S1E1', 'S1E2', 'S1E3'])).toBe('S1 E1–3')
    expect(episodeSpan(['S1E9', 'S2E2'])).toBe('S1 E9 – S2 E2')
    expect(episodeSpan(['S2E4'])).toBe('S2 E4')
    expect(agoLabel(1, false)).toBe('One year ago today')
    expect(agoLabel(7, true)).toBe('7 years ago this week')
  })
})
