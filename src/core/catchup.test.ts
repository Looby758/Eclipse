import { describe, expect, it } from 'vitest'
import { catchUps, dismissCatchUp } from './catchup'
import { emptyLibrary, normalizeLibrary } from './library'
import { releasesOf } from './tmdb'
import type { CollectionDetails, Library, LibraryEntry, TitleDetails, TitleKey } from './types'

const entry = (key: string, name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watched', addedAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', title: { name, year: 2021, posterPath: null }, ...over } as LibraryEntry
}
const film = (id: number, name: string, date: string, runtime = 155, over: Partial<TitleDetails> = {}): TitleDetails =>
  ({ key: `movie:${id}`, type: 'movie', id, name, date, runtime, seasons: [], nextEpisode: null, posterPath: null, collection: { id: 1, name: 'Dune' }, ...over }) as unknown as TitleDetails
const ref = (id: number, name: string, date: string) => ({ key: `movie:${id}` as TitleKey, type: 'movie' as const, id, name, year: Number(date.slice(0, 4)), posterPath: null, date })

const dune: CollectionDetails = { id: 1, name: 'Dune Collection', overview: '', posterPath: null, parts: [ref(1, 'Dune', '2021-09-15'), ref(2, 'Dune: Part Two', '2024-02-27'), ref(3, 'Dune: Part Three', '2026-12-16')] }
const evenings = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5, 6] }
// Tuesday 17 November 2026, 9pm.
const now = new Date(2026, 10, 17, 21, 0)

const hotd = {
  key: 'tv:9',
  type: 'tv',
  id: 9,
  name: 'House of the Dragon',
  runtime: 60,
  seasons: [
    { number: 1, episodeCount: 10, airDate: '2022-08-21' },
    { number: 2, episodeCount: 8, airDate: '2024-06-16' },
    { number: 3, episodeCount: 8, airDate: '2026-11-30' }
  ],
  nextEpisode: null,
  posterPath: null
} as unknown as TitleDetails
const s2 = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`S2E${i + 1}`, '2024-08-04']))

const lib = (over: Partial<Library> = {}): Library => ({
  ...emptyLibrary(),
  entries: {
    'movie:2': entry('movie:2', 'Dune: Part Two', { watchedOn: '2024-03-10' }),
    'movie:1': entry('movie:1', 'Dune', { watchedOn: '2021-10-22' }),
    'tv:9': entry('tv:9', 'House of the Dragon', { episodes: s2 })
  },
  ...over
})
const details = {
  'movie:1': film(1, 'Dune', '2021-09-15'),
  'movie:2': film(2, 'Dune: Part Two', '2024-02-27', 166),
  'movie:3': film(3, 'Dune: Part Three', '2026-12-16', 160, { releases: { GB: { cinema: '2026-12-18', any: '2026-12-16' } } }),
  'tv:9': hotd
}

describe('catch up before the sequel', () => {
  it('finds the film before the next one, with the UK cinema date and a night before it', () => {
    const [f] = catchUps({ library: lib(), details, collections: { 1: dune }, now, evenings, region: 'GB' }).filter((c) => c.kind === 'film')
    expect(f).toMatchObject({ id: 'movie:2>movie:3', upcoming: { name: 'Dune: Part Three', date: '2026-12-18', cinema: true }, rewatch: { name: 'Dune: Part Two', minutes: 166 }, late: false })
    // Thu 17 Dec is the night before; one night spare means Wed 16 Dec.
    expect(f.nights).toEqual(['2026-12-16'])
  })

  it('skips films watched recently, ones not seen, and ones said no to', () => {
    const recent = lib({ entries: { ...lib().entries, 'movie:2': entry('movie:2', 'Dune: Part Two', { watchedOn: '2026-06-01' }) } })
    expect(catchUps({ library: recent, details, collections: { 1: dune }, now, evenings, region: 'GB' }).some((c) => c.kind === 'film')).toBe(false)
    expect(catchUps({ library: recent, details, collections: { 1: dune }, now, evenings, region: 'GB', skipDays: 0 }).some((c) => c.kind === 'film')).toBe(true)
    const unseen = lib({ entries: { 'tv:9': lib().entries['tv:9'] } })
    expect(catchUps({ library: unseen, details, collections: { 1: dune }, now, evenings, region: 'GB' })).toHaveLength(1)
    const no = dismissCatchUp(lib(), 'movie:2>movie:3')
    expect(catchUps({ library: no, details, collections: { 1: dune }, now, evenings, region: 'GB' }).map((c) => c.kind)).toEqual(['season'])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(no))).catchUpDismissed).toEqual(['movie:2>movie:3'])
  })

  it('plans the season before a new one, ending the night before it starts', () => {
    const [s] = catchUps({ library: lib(), details, collections: {}, now, evenings, region: 'GB' })
    // 3 a night (60 minutes each, a 3-hour evening), 8 episodes: the last 3 watching nights before Mon 30 Nov.
    expect(s).toMatchObject({ id: 'tv:9@S2>tv:9@S3', upcoming: { season: 3, date: '2026-11-30' }, rewatch: { season: 2 }, fromEpisode: 1, episodes: 8, perNight: 3, partial: false })
    expect(s.nights).toEqual(['2026-11-26', '2026-11-27', '2026-11-28'])
  })

  it('suggests just the last few episodes when the whole season won’t fit', () => {
    const soon = { ...hotd, seasons: hotd.seasons.map((x) => (x.number === 3 ? { ...x, airDate: '2026-11-19' } : x)) } as TitleDetails
    const [s] = catchUps({ library: lib(), details: { ...details, 'tv:9': soon }, collections: {}, now, evenings, region: 'GB' })
    // Tonight (2 hours left, so 2 episodes) and Wednesday (3): the last 5 of the 8.
    expect(s).toMatchObject({ partial: true, episodes: 5, fromEpisode: 4 })
    expect(s.nights).toEqual(['2026-11-17', '2026-11-18'])
  })

  it('reads UK release dates from TMDB', () => {
    expect(
      releasesOf({ results: [{ iso_3166_1: 'GB', release_dates: [{ type: 4, release_date: '2027-02-01T00:00:00.000Z' }, { type: 3, release_date: '2026-12-18T00:00:00.000Z' }, { type: 1, release_date: '2026-12-10T00:00:00.000Z' }] }] })
    ).toEqual({ GB: { cinema: '2026-12-18', any: '2026-12-10' } })
  })
})
