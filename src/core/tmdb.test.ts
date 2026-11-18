import { describe, expect, it, vi } from 'vitest'
import { createTmdb, imageUrl, isReadAccessToken, parseCreditEpisodes, parseCredits, parseDetails, parsePeopleSearch, parsePerson, parseSearch, TmdbError } from './tmdb'

const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('TMDB keys', () => {
  it('tells the long read access token from the short API key', () => {
    expect(isReadAccessToken('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.abc')).toBe(true)
    expect(isReadAccessToken('0123456789abcdef0123456789abcdef')).toBe(false)
  })

  it('puts a short key in the address and a token in the header', async () => {
    const fetch = vi.fn(async (_url: string, _init?: { headers?: Record<string, string> }) => reply(200, { results: [] }))
    await createTmdb({ key: 'abc123', fetch }).search('dune')
    expect(fetch.mock.calls[0][0]).toContain('api_key=abc123')
    expect(fetch.mock.calls[0][0]).toContain('query=dune')

    const token = 'eyJa.eyJb.c'
    await createTmdb({ key: token, fetch }).search('dune')
    const [url, init] = fetch.mock.calls[1] as unknown as [string, { headers: Record<string, string> }]
    expect(url).not.toContain('api_key')
    expect(init.headers.Authorization).toBe(`Bearer ${token}`)
  })
})

describe('TMDB errors', () => {
  it('names a rejected key, a missing title and no internet', async () => {
    await expect(createTmdb({ key: 'k', fetch: async () => reply(401) }).check()).rejects.toMatchObject({ kind: 'auth' })
    await expect(createTmdb({ key: 'k', fetch: async () => reply(404) }).details('movie', 1)).rejects.toMatchObject({ kind: 'notFound' })
    const offline = createTmdb({ key: 'k', fetch: async () => Promise.reject(new Error('ENOTFOUND')) })
    await expect(offline.search('x')).rejects.toBeInstanceOf(TmdbError)
    await expect(offline.search('x')).rejects.toMatchObject({ kind: 'network' })
  })

  it('does not call TMDB for an empty search', async () => {
    const fetch = vi.fn()
    expect(await createTmdb({ key: 'k', fetch }).search('   ')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('trending', () => {
  it('asks for two pages and keeps films and shows with posters, once each', async () => {
    const fetch = vi.fn(async (url: string) =>
      reply(200, {
        results: url.includes('page=1')
          ? [{ id: 1, media_type: 'movie', title: 'A', poster_path: '/a.jpg' }, { id: 2, media_type: 'tv', name: 'B', poster_path: null }, { id: 3, media_type: 'person', name: 'C' }]
          : [{ id: 1, media_type: 'movie', title: 'A', poster_path: '/a.jpg' }, { id: 4, media_type: 'tv', name: 'D', poster_path: '/d.jpg' }]
      })
    )
    const r = await createTmdb({ key: 'k', fetch }).trending()
    expect(fetch.mock.calls.map((c) => c[0]).every((u) => u.includes('/trending/all/week'))).toBe(true)
    expect(r.map((x) => x.key)).toEqual(['movie:1', 'tv:4'])
  })
})

describe('parsing', () => {
  it('keeps films and shows, drops people', () => {
    const results = parseSearch([
      { id: 1, media_type: 'movie', title: 'Interstellar', release_date: '2014-11-05', poster_path: '/p.jpg', overview: 'Space' },
      { id: 2, media_type: 'tv', name: 'Andor', first_air_date: '2022-09-21' },
      { id: 3, media_type: 'person', name: 'Christopher Nolan' }
    ])
    expect(results.map((r) => r.key)).toEqual(['movie:1', 'tv:2'])
    expect(results[0]).toMatchObject({ name: 'Interstellar', year: 2014, posterPath: '/p.jpg' })
    expect(results[1]).toMatchObject({ name: 'Andor', year: 2022, posterPath: null })
  })

  it('reads a film', () => {
    const d = parseDetails('movie', {
      id: 157336,
      title: 'Interstellar',
      original_title: 'Interstellar',
      release_date: '2014-11-05',
      runtime: 169,
      genres: [{ name: 'Science Fiction' }],
      vote_average: 8.4,
      vote_count: 30000,
      belongs_to_collection: null
    })
    expect(d).toMatchObject({ key: 'movie:157336', year: 2014, runtime: 169, genres: ['Science Fiction'], originalName: null, seasons: [], collection: null })
  })

  it('reads a show, with specials last and an episode length', () => {
    const d = parseDetails('tv', {
      id: 1396,
      name: 'Breaking Bad',
      first_air_date: '2008-01-20',
      episode_run_time: [],
      last_episode_to_air: { runtime: 47 },
      seasons: [
        { season_number: 0, name: 'Specials', episode_count: 9, air_date: null, poster_path: null },
        { season_number: 2, name: 'Season 2', episode_count: 13, air_date: '2009-03-08', poster_path: null },
        { season_number: 1, name: 'Season 1', episode_count: 7, air_date: '2008-01-20', poster_path: null }
      ],
      number_of_seasons: 5,
      number_of_episodes: 62,
      next_episode_to_air: null,
      vote_count: 0,
      vote_average: 0
    })
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2, 0])
    expect(d.runtime).toBe(47)
    expect(d.voteAverage).toBeNull()
    expect(d.numberOfEpisodes).toBe(62)
  })

  it('builds image addresses', () => {
    expect(imageUrl('/a.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/a.jpg')
    expect(imageUrl(null)).toBeNull()
  })
})

describe('stay for the credits and trailers', () => {
  it('reads the credits-scene keywords on films', async () => {
    const { parseDetails } = await import('./tmdb')
    const film = parseDetails('movie', { id: 1726, title: 'Iron Man', keywords: { keywords: [{ id: 179430, name: 'aftercreditsstinger' }, { id: 1, name: 'superhero' }] } })
    expect(film.stingers).toEqual({ during: false, after: true })
    expect(parseDetails('movie', { id: 1, title: 'Old copy' }).stingers).toBeNull()
    expect(parseDetails('tv', { id: 2, name: 'Show', keywords: { results: [{ id: 179431, name: 'duringcreditsstinger' }] } }).stingers).toBeNull()
  })

  it('picks the official YouTube trailer', async () => {
    const { pickTrailer } = await import('./tmdb')
    expect(
      pickTrailer({
        results: [
          { site: 'YouTube', type: 'Teaser', key: 'tease', official: true },
          { site: 'Vimeo', type: 'Trailer', key: 'vimeo', official: true },
          { site: 'YouTube', type: 'Trailer', key: 'fan', official: false },
          { site: 'YouTube', type: 'Trailer', key: 'real', official: true }
        ]
      })
    ).toBe('real')
    expect(pickTrailer({ results: [] })).toBeNull()
  })
})

describe('actors: parts played, full cast and people search', () => {
  it('keeps who they played in each title, joining two parts in one title', () => {
    const p = parsePerson({
      id: 1,
      name: 'Katelyn Nacon',
      movie_credits: { cast: [{ id: 10, title: 'A Film', release_date: '2020-01-01', character: 'Lucy' }] },
      tv_credits: {
        cast: [
          { id: 1402, name: 'The Walking Dead', first_air_date: '2010-10-31', character: 'Enid', episode_count: 60 },
          { id: 1402, name: 'The Walking Dead', first_air_date: '2010-10-31', character: 'Enid (voice)', episode_count: 3 },
          { id: 99, name: 'A Guest Spot', first_air_date: '2019-01-01', character: 'Girl', episode_count: 1 }
        ]
      }
    })
    expect(p.acted.map((t) => [t.name, t.role])).toEqual([
      ['A Film', 'Lucy'],
      ['The Walking Dead', 'Enid / Enid (voice)']
    ])
  })

  it('keeps everyone in a show, most episodes first, with their parts and episode counts', () => {
    const cast = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, total_episode_count: 100 - i, roles: [{ character: `Part ${i + 1}`, episode_count: 100 - i }] }))
    const c = parseCredits({ cast: [...cast].reverse() })
    expect(c.cast).toHaveLength(12)
    expect(c.fullCast).toHaveLength(20)
    expect(c.fullCast![0]).toEqual({ id: 1, name: 'Person 1', profilePath: null, role: 'Part 1', episodes: 100 })
    expect(c.fullCast![19].name).toBe('Person 20')
  })

  it('reads people from a search with what they are known for', () => {
    expect(
      parsePeopleSearch([
        { id: 5, name: 'Katelyn Nacon', profile_path: '/k.jpg', known_for_department: 'Acting', known_for: [{ name: 'The Walking Dead' }, { title: 'A Film' }] },
        { id: 6 }
      ])
    ).toEqual([{ id: 5, name: 'Katelyn Nacon', profilePath: '/k.jpg', knownFor: 'Acting', knownTitles: ['The Walking Dead', 'A Film'] }])
  })
})

describe('which episodes someone was in', () => {
  it('reads the episodes of a part in order, or just its seasons', () => {
    expect(
      parseCreditEpisodes({
        media: {
          episodes: [
            { season_number: 7, episode_number: 2, name: 'The Well', air_date: '2016-10-30' },
            { season_number: 6, episode_number: 4, name: 'Here’s Not Here', air_date: '2015-11-01' }
          ],
          seasons: [{ season_number: 7 }, { season_number: 6 }]
        }
      })
    ).toEqual({
      episodes: [
        { season: 6, number: 4, name: 'Here’s Not Here', airDate: '2015-11-01' },
        { season: 7, number: 2, name: 'The Well', airDate: '2016-10-30' }
      ],
      seasons: [6, 7]
    })
    expect(parseCreditEpisodes({ media: { seasons: [{ season_number: 1 }] } })).toEqual({ episodes: [], seasons: [1] })
    expect(parseCreditEpisodes({})).toEqual({ episodes: [], seasons: [] })
  })

  it('keeps episode counts and part ids on an actor’s shows', () => {
    const p = parsePerson({ id: 1, tv_credits: { cast: [{ id: 1402, name: 'The Walking Dead', character: 'Enid', episode_count: 5, credit_id: 'abc' }] } })
    expect(p.acted[0]).toMatchObject({ role: 'Enid', roleEpisodes: 5, creditIds: ['abc'] })
  })
})
