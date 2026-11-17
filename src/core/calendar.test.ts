import { describe, expect, it } from 'vitest'
import { seasonsToCheck, toIcs, upcomingReleases } from './calendar'
import { emptyLibrary } from './library'
import type { Library, LibraryEntry, SeasonDetails, TitleDetails } from './types'

const entry = (key: string, status: LibraryEntry['status']): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key: key as LibraryEntry['key'], type: type as 'movie', id: Number(id), status, addedAt: '', updatedAt: '', title: { name: key, year: null, posterPath: null } }
}
const lib = (...entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((x) => [x.key, x])) })
const details = (key: string, over: Partial<TitleDetails>): TitleDetails => {
  const [type, id] = key.split(':')
  return {
    key: key as TitleDetails['key'],
    type: type as 'movie',
    id: Number(id),
    name: key,
    originalName: null,
    year: null,
    date: null,
    tagline: '',
    overview: '',
    posterPath: null,
    backdropPath: null,
    genres: [],
    runtime: null,
    status: '',
    voteAverage: null,
    voteCount: 0,
    seasons: [],
    numberOfSeasons: null,
    numberOfEpisodes: null,
    nextEpisode: null,
    lastAirDate: null,
    collection: null,
    ...over
  }
}
const season = (tvId: number, number: number, dates: (string | null)[]): SeasonDetails => ({
  tvId,
  number,
  name: `Season ${number}`,
  episodes: dates.map((airDate, i) => ({ season: number, number: i + 1, name: `Episode ${i + 1}`, airDate, runtime: 50, overview: '', voteAverage: null, voteCount: 0, stillPath: null }))
})
const today = '2026-11-17'

describe('release calendar', () => {
  const library = lib(entry('movie:1', 'want'), entry('movie:2', 'watched'), entry('tv:10', 'watched'), entry('tv:11', 'watching'), entry('tv:12', 'stopped'))
  const all = {
    'movie:1': details('movie:1', { name: 'Avengers: Doomsday', date: '2026-12-18' }),
    'movie:2': details('movie:2', { date: '2026-12-01' }),
    'tv:10': details('tv:10', { name: 'The Boys', seasons: [{ number: 4, name: 'S4', episodeCount: 8, airDate: '2024-06-13', posterPath: null }, { number: 5, name: 'S5', episodeCount: 3, airDate: '2027-04-08', posterPath: null }] }),
    'tv:11': details('tv:11', { name: 'Slow Horses', seasons: [{ number: 5, name: 'S5', episodeCount: 3, airDate: '2026-11-03', posterPath: null }], nextEpisode: { season: 5, episode: 3, name: 'Last', airDate: '2026-11-24' } }),
    'tv:12': details('tv:12', { seasons: [{ number: 2, name: 'S2', episodeCount: 8, airDate: '2027-01-01', posterPath: null }] })
  }
  const seasons = { '11:5': season(11, 5, ['2026-11-03', '2026-11-10', '2026-11-24']), '10:5': season(10, 5, ['2027-04-08', '2027-04-15', '2027-04-22']) }

  it('checks the airing season and any later ones', () => {
    expect(seasonsToCheck(all['tv:10'], today)).toEqual([5])
    expect(seasonsToCheck(all['tv:11'], today)).toEqual([5])
  })

  it('lists watchlist films, new seasons and finales, skipping stopped shows and watched films', () => {
    const events = upcomingReleases({ library, details: all, seasons, today, everyEpisode: false })
    expect(events.map((e) => [e.date, e.title])).toEqual([
      ['2026-11-24', 'Slow Horses: season 5 finale'],
      ['2026-12-18', 'Avengers: Doomsday is out'],
      ['2027-04-08', 'The Boys: season 5 starts'],
      ['2027-04-22', 'The Boys: season 5 finale']
    ])
  })

  it('can list every new episode', () => {
    const events = upcomingReleases({ library, details: all, seasons, today, everyEpisode: true })
    expect(events.filter((e) => e.key === 'tv:10').map((e) => e.title)).toEqual(['The Boys: season 5 starts', 'The Boys: S5 E2', 'The Boys: season 5 finale'])
  })

  it('uses the season start date when the episodes aren’t listed yet, and no finale until every date is known', () => {
    const events = upcomingReleases({ library, details: all, seasons: { '10:5': season(10, 5, ['2027-04-08', null, null]) }, today, everyEpisode: false })
    expect(events.filter((e) => e.key === 'tv:10').map((e) => e.title)).toEqual(['The Boys: season 5 starts'])
    const bare = upcomingReleases({ library, details: all, seasons: {}, today, everyEpisode: false })
    expect(bare.find((e) => e.key === 'tv:10')).toMatchObject({ date: '2027-04-08', kind: 'premiere' })
  })

  it('writes a calendar file with all-day events', () => {
    const ics = toIcs(upcomingReleases({ library, details: all, seasons, today, everyEpisode: false }), new Date('2026-11-17T10:00:00Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics).toContain('UID:movie-1-release@eclipse\r\n')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261218\r\nDTEND;VALUE=DATE:20261219\r\n')
    expect(ics).toContain('SUMMARY:Avengers: Doomsday is out')
    expect(ics).toContain('DTSTAMP:20261117T100000Z')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('escapes text and folds long lines', () => {
    const long = 'Ä'.repeat(60)
    const ics = toIcs([{ uid: 'x', date: '2026-12-01', kind: 'film', key: 'movie:1', title: `A, b; c\nd ${long}`, detail: '', url: 'https://x' }])
    const summary = ics.split('\r\n').filter((l, i, all) => l.startsWith('SUMMARY') || (l.startsWith(' ') && all[i - 1]?.length))
    expect(summary[0]).toContain(String.raw`A\, b\; c\nd`)
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})
