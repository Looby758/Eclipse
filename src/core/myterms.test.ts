import { describe, expect, it } from 'vitest'
import { emptyLibrary } from './library'
import { myTerms, usualEvening } from './myterms'
import type { Library, LibraryEntry, TitleDetails } from './types'

const show = (id: number, name: string, episodes: number, day: string, status: LibraryEntry['status'] = 'watched'): LibraryEntry =>
  ({
    key: `tv:${id}`,
    type: 'tv',
    id,
    status,
    addedAt: '',
    updatedAt: '',
    title: { name, year: 2010, posterPath: null },
    episodes: Object.fromEntries(Array.from({ length: episodes }, (_, i) => [`S1E${i + 1}`, day]))
  }) as LibraryEntry
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })
const runtime = (minutes: number): TitleDetails => ({ runtime: minutes, seasons: [], genres: [] }) as unknown as TitleDetails

describe('my hours in my own terms (phase 61)', () => {
  it('compares with a show you finished, a whole number of times over', () => {
    const library = lib(show(1, 'The Walking Dead', 120, '2022-03-01'), show(2, 'Breaking Bad', 40, '2019-05-01'))
    const lines = myTerms(library, { 'tv:1': runtime(45), 'tv:2': runtime(45) }, 'tv:1')
    expect(lines[0]).toBe('That’s Breaking Bad three times over')
  })
  it('compares with a whole year of your watching, and your evenings', () => {
    const library = lib(show(1, 'The Walking Dead', 60, '2022-03-01'), show(2, 'Lost', 60, '2023-05-01'))
    const lines = myTerms(library, {}, 'tv:1')
    expect(lines).toContain('About as long as everything you watched in 2023')
    // 60 × 45 minutes over a 3-hour evening.
    expect(lines).toContain('About 15 of your evenings')
  })
  it('says nothing for very little time', () => {
    expect(myTerms(lib(show(1, 'Short', 1, '2022-03-01')), {}, 'tv:1')).toEqual([])
  })
  it('works out a usual evening, past midnight too', () => {
    expect(usualEvening('20:00', '23:00')).toBe(180)
    expect(usualEvening('22:00', '00:30')).toBe(150)
    expect(usualEvening('x', '23:00')).toBe(0)
  })
})
