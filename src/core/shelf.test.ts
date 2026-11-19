import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import { orderPosters, posterFor, setBackdrop, setPoster } from './posters'
import { FAVOURITES_MAX, isFavourite, moveFavourite, setFavourite } from './favourites'
import { comingSoon, finishedShelf } from './shelf'
import { parsePosters } from './tmdb'
import type { Library, LibraryEntry, TitleDetails, TitleKey } from './types'

const entry = (key: string, name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watched', addedAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', title: { name, year: 2021, posterPath: '/def.jpg' }, ...over } as LibraryEntry
}
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })
const ref = (id: number, name: string) => ({ key: `tv:${id}` as TitleKey, type: 'tv' as const, id, name, year: 2020, posterPath: null })

describe('choose your own posters (phase 55)', () => {
  it('uses the chosen poster, and Reset goes back to the default', () => {
    let l = setPoster(emptyLibrary(), 'tv:1402', '/alt.jpg')
    expect(posterFor(l, 'tv:1402', '/def.jpg')).toBe('/alt.jpg')
    expect(posterFor(l, 'tv:1', '/def.jpg')).toBe('/def.jpg')
    l = setPoster(l, 'tv:1402', null)
    expect(l.posters).toBeUndefined()
    expect(posterFor(l, 'tv:1402', '/def.jpg')).toBe('/def.jpg')
  })
  it('keeps a chosen background apart from the poster, and through the file', () => {
    const l = setBackdrop(setPoster(emptyLibrary(), 'tv:1', '/p.jpg'), 'tv:1', '/b.jpg')
    expect(l.posters).toEqual({ 'tv:1': '/p.jpg' })
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).backdrops).toEqual({ 'tv:1': '/b.jpg' })
    expect(setBackdrop(l, 'tv:1', null).backdrops).toBeUndefined()
  })
  it('ignores anything that is not a TMDB image path or title key', () => {
    const l = emptyLibrary()
    expect(setPoster(l, 'tv:1', 'https://evil.example/x.jpg')).toBe(l)
    expect(setPoster(l, 'nope', '/a.jpg')).toBe(l)
  })
  it('survives a round trip through the file, and drops junk', () => {
    const back = normalizeLibrary(JSON.parse(JSON.stringify({ version: 1, entries: {}, posters: { 'tv:1': '/a.jpg', 'tv:2': 'javascript:x', x: '/b.jpg' } })))
    expect(back.posters).toEqual({ 'tv:1': '/a.jpg' })
  })
  it('puts the default first, then English and textless ones by vote', () => {
    const opts = parsePosters([
      { file_path: '/fr.jpg', iso_639_1: 'fr', vote_average: 9, vote_count: 10 },
      { file_path: '/none.jpg', iso_639_1: null, vote_average: 5, vote_count: 10 },
      { file_path: '/en.jpg', iso_639_1: 'en', vote_average: 4, vote_count: 10 },
      { file_path: '/def.jpg', iso_639_1: 'en', vote_average: 1, vote_count: 1 },
      { file_path: '/en.jpg', iso_639_1: 'en', vote_average: 4, vote_count: 10 }
    ])
    expect(orderPosters(opts, '/def.jpg').map((o) => o.path)).toEqual(['/def.jpg', '/en.jpg', '/none.jpg', '/fr.jpg'])
  })
})

describe('favourites wall (phase 58)', () => {
  it('hangs, reorders and takes down', () => {
    let l = setFavourite(emptyLibrary(), ref(1, 'A'), true)
    l = setFavourite(l, ref(2, 'B'), true)
    l = setFavourite(l, ref(3, 'C'), true)
    expect(isFavourite(l, 'tv:2')).toBe(true)
    l = moveFavourite(l, 2, 0)
    expect(l.favourites!.map((r) => r.name)).toEqual(['C', 'A', 'B'])
    l = setFavourite(l, ref(1, 'A'), false)
    expect(l.favourites!.map((r) => r.name)).toEqual(['C', 'B'])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).favourites!.map((r) => r.key)).toEqual(['tv:3', 'tv:2'])
  })
  it('stops at the most the wall holds', () => {
    let l = emptyLibrary()
    for (let i = 1; i <= FAVOURITES_MAX + 3; i++) l = setFavourite(l, ref(i, String(i)), true)
    expect(l.favourites).toHaveLength(FAVOURITES_MAX)
  })
})

const show = (id: number, over: Partial<TitleDetails>): TitleDetails =>
  ({ key: `tv:${id}`, type: 'tv', id, name: `Show ${id}`, status: 'Returning Series', posterPath: '/p.jpg', seasons: [], nextEpisode: null, ...over }) as unknown as TitleDetails
const season = (number: number, airDate: string | null, episodeCount = 8) => ({ number, name: `Season ${number}`, airDate, episodeCount, posterPath: null })

describe('coming soon on the shelf (phase 59)', () => {
  const today = '2026-11-18'
  it('wraps the next season of a show you watch, with its date', () => {
    const l = lib(entry('tv:1', 'The Boys', { status: 'watching', episodes: { S4E8: '2024-07-18' } }))
    const d = show(1, { seasons: [season(4, '2024-06-13'), season(5, '2027-04-08', 0)] })
    expect(comingSoon(l, { 'tv:1': d }, today)).toMatchObject([{ key: 'tv:1', season: 5, date: '2027-04-08', label: 'Season 5', out: false }])
  })
  it('unwraps on release day and leaves a week later', () => {
    const l = lib(entry('tv:1', 'X', { status: 'watched', episodes: { S1E1: '2025-01-01' } }))
    const d = show(1, { seasons: [season(1, '2025-01-01'), season(2, today)] })
    expect(comingSoon(l, { 'tv:1': d }, today)[0]).toMatchObject({ season: 2, out: true })
    expect(comingSoon(l, { 'tv:1': d }, '2026-11-26')).toEqual([])
  })
  it('keeps announced seasons with no date, last', () => {
    const l = lib(entry('tv:1', 'X', { status: 'watching', episodes: { S1E1: '2025-01-01' } }), entry('tv:2', 'Y', { status: 'watching', episodes: { S1E1: '2025-01-01' } }))
    const a = show(1, { seasons: [season(1, '2025-01-01'), season(2, null, 0)] })
    const b = show(2, { seasons: [season(1, '2025-01-01'), season(2, '2027-01-01', 0)] })
    expect(comingSoon(l, { 'tv:1': a, 'tv:2': b }, today).map((c) => [c.key, c.date])).toEqual([['tv:2', '2027-01-01'], ['tv:1', null]])
  })
  it('skips ended shows, stopped shows and seasons already started', () => {
    const l = lib(entry('tv:1', 'X', { status: 'watching', episodes: { S2E1: '2026-11-10' } }), entry('tv:2', 'Y', { status: 'stopped' }), entry('tv:3', 'Z', { status: 'watched' }))
    const d1 = show(1, { seasons: [season(1, '2025-01-01'), season(2, '2026-11-10')] })
    const d2 = show(2, { seasons: [season(1, '2027-01-01')] })
    const d3 = show(3, { status: 'Ended', seasons: [season(1, '2020-01-01'), season(2, '2027-01-01')] })
    expect(comingSoon(l, { 'tv:1': d1, 'tv:2': d2, 'tv:3': d3 }, today)).toEqual([])
  })
  it('wraps watchlist films by their UK cinema date', () => {
    const l = lib(entry('movie:9', 'Dune: Part Three', { status: 'want' }))
    const d = { key: 'movie:9', type: 'movie', id: 9, name: 'Dune: Part Three', date: '2026-12-16', status: 'Post Production', seasons: [], releases: { GB: { cinema: '2026-12-18', any: '2026-12-18' } } } as unknown as TitleDetails
    expect(comingSoon(l, { 'movie:9': d }, today)).toMatchObject([{ date: '2026-12-18', label: 'In cinemas', out: false }])
  })
})

describe('the shelf of finished things', () => {
  it('lists what you finished, most recent first, undated last', () => {
    const l = lib(
      entry('tv:1', 'B', { episodes: { S1E1: '2025-03-01', S1E2: '2025-03-04' } }),
      entry('movie:2', 'A', { watchedOn: '2026-01-01' }),
      entry('movie:3', 'C', { seenBefore: true }),
      entry('movie:4', 'D', { status: 'want' })
    )
    expect(finishedShelf(l).map((b) => [b.name, b.finishedOn])).toEqual([['A', '2026-01-01'], ['B', '2025-03-04'], ['C', null]])
  })
})
