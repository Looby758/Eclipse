import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, setStatus } from './library'
import { mergeSequel, parseCsv, readSequelCsv, splitList, summarizeImport } from './sequel'

// A made-up export in Sequel's shape (no real data).
const HEAD =
  '﻿Media Type,Title,Show Title,Season,Episode,Release Date,Release Year,Status,Rating,Rated On,Date Added,Date Completed,Notes,Collections,Genres,Author,Runtime (min),Episodes Watched,Episodes Total,Custom,Cover,TMDB ID,IMDb ID,IGDB ID,iTunes ID,Trakt ID,Sequel ID,Show ID'
const CSV = [
  HEAD,
  'Movie,Film One,,,,2020-01-01,2020,Completed,4.5,2024-01-02 10:00:00,2024-01-01 09:00:00,2024-01-02 23:30:00,"Great, with ""friends""\nat home",Marvel,"Action, Drama",,120,,,,https://image.tmdb.org/t/p/w780/abc.jpg,111,tt1,,,,M1,',
  'Movie,Film Two,,,,2021-01-01,2021,Wishlist,,,2024-02-01 09:00:00,,,"Marvel, Big\\, Bold",Action,,100,,,,,222,,,,,M2,',
  'Series,Show One,,,,2019-01-01,2019,Wishlist,,,2024-03-01 09:00:00,,,,Drama,,,2,10,,https://image.tmdb.org/t/p/w780/s1.jpg,333,,,,,S1,',
  'Series,Show Two,,,,2019-01-01,2019,Abandoned,3,,2024-03-01 09:00:00,,,,Drama,,,0,10,,,444,,,,,S2,',
  'Episode,Pilot,Show One,1,1,2019-01-01,2019,Completed,,,,2024-03-02 20:00:00,,,,,44,,,,,,,,,,E1,S1',
  'Episode,Second,Show One,1,2,2019-01-01,2019,Completed,,,,2024-03-03 20:00:00,,,,,44,,,,,,,,,,E2,S1',
  'Episode,Special,Show One,0,1,2019-01-01,2019,Completed,,,,2024-03-04 20:00:00,,,,,44,,,,,,,,,,E3,S1',
  'Episode,Lost,Nowhere,1,1,2019-01-01,2019,Completed,,,,2024-03-04 20:00:00,,,,,44,,,,,,,,,,E4,XX',
  'Book,A Book,,,,2019-01-01,2019,Wishlist,,,2024-03-01 09:00:00,,,,,Someone,,,,,,,,,,,B1,',
  'Game,A Game,,,,2019-01-01,2019,Completed,,,2024-03-01 09:00:00,,,,,,,,,,,,,1,,,G1,',
  'Movie,Home Video,,,,2019-01-01,2019,Completed,,,2024-03-01 09:00:00,,,,,,,,,Yes,,,,,,,H1,'
].join('\r\n')

const utcDay = (d: Date): string => d.toISOString().slice(0, 10)

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and line breaks in cells', () => {
    expect(parseCsv('a,"b,c","say ""hi""\nthere"\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'say "hi"\nthere'],
      ['1', '2', '3']
    ])
  })
  it('splits multi-value cells, keeping escaped commas', () => {
    expect(splitList('Marvel, Big\\, Bold')).toEqual(['Marvel', 'Big, Bold'])
    expect(splitList('')).toEqual([])
  })
})

describe('readSequelCsv', () => {
  const data = readSequelCsv(CSV, utcDay)
  const film = data.items.find((i) => i.key === 'movie:111')!
  const show = data.items.find((i) => i.key === 'tv:333')!

  it('keeps films and shows and skips the rest', () => {
    expect(data.items.map((i) => i.key)).toEqual(['movie:111', 'movie:222', 'tv:333', 'tv:444'])
    expect(data.skippedOther).toBe(2)
    expect(data.skippedNoId).toEqual(['Home Video'])
    expect(data.orphanEpisodes).toBe(1)
  })
  it('maps statuses, ratings, dates, notes, lists and posters', () => {
    expect(film).toMatchObject({ status: 'watched', rating: 9, watchedOn: '2024-01-02', posterPath: '/abc.jpg', lists: ['Marvel'], year: 2020 })
    expect(film.note).toBe('Great, with "friends" at home')
    expect(film.addedAt).toBe('2024-01-01T09:00:00.000Z')
    expect(data.items[1].lists).toEqual(['Marvel', 'Big, Bold'])
    expect(data.items[3]).toMatchObject({ status: 'stopped', rating: 6 })
  })
  it("attaches episodes to their show and makes a started wishlist show Watching", () => {
    expect(show.episodes).toEqual({ S1E1: '2024-03-02', S1E2: '2024-03-03', S0E1: '2024-03-04' })
    expect(show.status).toBe('watching')
  })
  it('turns UTC times into your local day', () => {
    const late = readSequelCsv(CSV, (d) => utcDay(new Date(d.getTime() + 2 * 3600e3)))
    expect(late.items[0].watchedOn).toBe('2024-01-03')
  })
  it('refuses a file that is not a Sequel export', () => {
    expect(() => readSequelCsv('name,age\nx,1')).toThrow()
  })
})

describe('mergeSequel', () => {
  const data = readSequelCsv(CSV, utcDay)
  const now = new Date('2025-01-01T00:00:00Z')

  it('adds everything to an empty library, and survives a reload', () => {
    const lib = mergeSequel(emptyLibrary(), data, now)
    expect(Object.keys(lib.entries)).toHaveLength(4)
    expect(lib.entries['tv:333'].episodes).toEqual({ S1E1: '2024-03-02', S1E2: '2024-03-03', S0E1: '2024-03-04' })
    expect(lib.entries['movie:111']).toMatchObject({ rating: 9, lists: ['Marvel'], updatedAt: '2024-01-01T09:00:00.000Z' })
    expect(normalizeLibrary(JSON.parse(JSON.stringify(lib)))).toEqual(lib)
  })
  it("lets what's already in Eclipse win, and combines episodes", () => {
    let lib = setStatus(emptyLibrary(), { key: 'tv:333', type: 'tv', id: 333, title: { name: 'Show One', year: 2019, posterPath: null } }, 'watched', now)
    lib = { ...lib, entries: { ...lib.entries, 'tv:333': { ...lib.entries['tv:333'], episodes: { S1E1: '2024-01-01', S2E1: '2024-05-05' } } } }
    const merged = mergeSequel(lib, data, now).entries['tv:333']
    expect(merged.status).toBe('watched')
    expect(merged.watchedOn).toBe('2025-01-01')
    expect(merged.episodes).toEqual({ S1E1: '2024-01-01', S1E2: '2024-03-03', S0E1: '2024-03-04', S2E1: '2024-05-05' })
    expect(merged.title.posterPath).toBe('/s1.jpg')
  })
  it('changes nothing when run twice', () => {
    const once = mergeSequel(emptyLibrary(), data, now)
    expect(mergeSequel(once, data, new Date('2026-01-01T00:00:00Z'))).toEqual(once)
  })
  it('summarises what it will do', () => {
    const s = summarizeImport(data, emptyLibrary())
    expect(s).toMatchObject({ films: 2, shows: 2, episodes: 3, ratings: 2, notes: 1, added: 4, merged: 0, skippedOther: 2 })
    expect(s.byStatus).toEqual({ want: 1, watching: 1, watched: 1, stopped: 1 })
    expect(s.lists).toEqual({ Marvel: 2, 'Big, Bold': 1 })
  })
})
