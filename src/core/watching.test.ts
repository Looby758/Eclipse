import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary } from './library'
import {
  addMoment,
  bedtimeWarning,
  cleanTitle,
  editMoment,
  finished,
  learnLinks,
  matchTitle,
  momentsOf,
  parseEpisode,
  playTarget,
  recognise,
  serviceOf,
  showPagesFromVisits,
  suggestFromVisits,
  type Recognised
} from './watching'
import type { Library, LibraryEntry, TitleDetails } from './types'

const entry = (key: string, name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => {
  const [type, id] = key.split(':')
  return { key, type, id: Number(id), status: 'watching', addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: { name, year: 2022, posterPath: null }, ...over } as LibraryEntry
}
const show = (counts: number[]): TitleDetails =>
  ({ type: 'tv', runtime: 45, seasons: counts.map((episodeCount, i) => ({ number: i + 1, name: '', episodeCount, airDate: '2020-01-01', posterPath: null })), nextEpisode: null }) as unknown as TitleDetails
const lib: Library = {
  ...emptyLibrary(),
  entries: {
    'tv:1': entry('tv:1', 'Andor', { episodes: { S1E1: '2026-11-01', S1E2: '2026-11-02' } }),
    'tv:2': entry('tv:2', 'The Walking Dead'),
    'tv:3': entry('tv:3', 'The Walking Dead: Daryl Dixon'),
    'tv:4': entry('tv:4', 'You'),
    'movie:5': entry('movie:5', 'Dune', { status: 'want' })
  }
}
const details = { 'tv:1': show([3, 12]), 'tv:2': show([6]), 'tv:3': show([6]) }
const today = '2026-11-17'

describe('recognising services, shows and episodes', () => {
  it('knows the streaming services and their players', () => {
    expect(serviceOf('https://www.disneyplus.com/en-gb/play/1b2c-33')).toMatchObject({ service: { name: 'Disney+' }, playing: true })
    expect(serviceOf('https://www.disneyplus.com/en-gb/browse/entity-123')).toMatchObject({ playing: false })
    expect(serviceOf('https://www.nowtv.com/gb/watch/playback/vod/abc')?.playing).toBe(true)
    expect(serviceOf('https://www.bbc.co.uk/iplayer/episode/m001/x')?.service.name).toBe('BBC iPlayer')
    expect(serviceOf('https://example.com/play/1')).toBeNull()
    expect(serviceOf('not a url')).toBeNull()
  })

  it('cleans page and window titles', () => {
    expect(cleanTitle('Watch Andor | Disney+')).toBe('Andor')
    expect(cleanTitle('Andor - Google Chrome')).toBe('Andor')
    expect(cleanTitle('🔊 The Walking Dead: Daryl Dixon - NOW')).toBe('The Walking Dead: Daryl Dixon')
    expect(cleanTitle('Andor | Disney+ - Opera')).toBe('Andor')
  })

  it('reads episode numbers in the usual forms', () => {
    expect(parseEpisode('Andor S2 E4')).toEqual({ season: 2, episode: 4 })
    expect(parseEpisode('andor s02e04')).toEqual({ season: 2, episode: 4 })
    expect(parseEpisode('Series 2, Episode 4')).toEqual({ season: 2, episode: 4 })
    expect(parseEpisode('Season 2: Episode 10')).toEqual({ season: 2, episode: 10 })
    expect(parseEpisode('2x04')).toEqual({ season: 2, episode: 4 })
    expect(parseEpisode('Andor')).toBeNull()
  })

  it('matches the longest show name, as whole words, and short names only exactly', () => {
    expect(matchTitle('The Walking Dead: Daryl Dixon S1 E2', lib)?.key).toBe('tv:3')
    expect(matchTitle('The Walking Dead S1 E2', lib)?.key).toBe('tv:2')
    expect(matchTitle('Young Sheldon', lib)).toBeNull()
    expect(matchTitle('Your Honor', lib)).toBeNull()
    expect(matchTitle('You', lib)?.key).toBe('tv:4')
    expect(matchTitle('Dune', lib)).toBeNull()
    expect(matchTitle('Dune', lib, ['movie'])?.key).toBe('movie:5')
  })
})

describe('suggestions from browser history', () => {
  const v = (url: string, title: string, day: string, at: number) => ({ url, title, day, at })
  it('suggests the next episodes, one per distinct player address, and named ones as named', () => {
    const visits = [
      v('https://www.disneyplus.com/play/aaa', 'Andor | Disney+', '2026-11-10', 1),
      v('https://www.disneyplus.com/play/aaa?t=1', 'Andor | Disney+', '2026-11-10', 2),
      v('https://www.disneyplus.com/play/bbb', 'Andor | Disney+', '2026-11-10', 3),
      v('https://www.disneyplus.com/browse/x', 'Andor | Disney+', '2026-11-10', 4),
      v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E5 - NOW', '2026-11-11', 5),
      v('https://www.netflix.com/watch/9', 'Netflix', '2026-11-11', 6)
    ]
    const s = suggestFromVisits(visits, lib, details, new Set(), today)
    expect(s.map((x) => [x.id, x.day, x.sure, x.service])).toEqual([
      ['tv:1@S1E3', '2026-11-10', false, 'Disney+'],
      ['tv:1@S2E1', '2026-11-10', false, 'Disney+'],
      ['tv:2@S1E5', '2026-11-11', true, 'NOW']
    ])
    expect(suggestFromVisits(visits, lib, details, new Set(['tv:1@S1E3']), today).map((x) => x.id)).toEqual(['tv:1@S2E1', 'tv:2@S1E5'])
  })

  it('learns where you watch a show, for Play next', () => {
    const visits = [v('https://www.disneyplus.com/browse/entity-andor', 'Andor | Disney+', '2026-11-10', 1), v('https://www.disneyplus.com/play/aaa', 'Andor | Disney+', '2026-11-10', 2)]
    let l = lib
    for (const p of showPagesFromVisits(visits, lib)) l = learnLinks(l, p.key, p.url)
    expect(l.entries['tv:1'].links).toEqual({ service: 'Disney+', show: 'https://www.disneyplus.com/browse/entity-andor', last: 'https://www.disneyplus.com/play/aaa' })
    expect(playTarget(l.entries['tv:1'])).toEqual({ url: 'https://www.disneyplus.com/browse/entity-andor', label: 'Continue on Disney+' })
    expect(playTarget(lib.entries['tv:1'])).toBeNull()
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).entries['tv:1'].links?.show).toBe('https://www.disneyplus.com/browse/entity-andor')
    expect(normalizeLibrary({ entries: { 'tv:1': { ...l.entries['tv:1'], links: { show: 'javascript:alert(1)' } } } }).entries['tv:1'].links).toBeUndefined()
  })
})

describe('what’s playing', () => {
  const np = (title: string, position: number, duration = 2700) => recognise({ app: 'chrome.exe', title, status: 'playing', position, duration }, lib, details, today)

  it('recognises the show and episode, named or the next one', () => {
    expect(np('Andor S2 E4', 1860)).toMatchObject({ key: 'tv:1', season: 2, episode: 4, sure: true })
    expect(np('Andor', 60)).toMatchObject({ key: 'tv:1', season: 1, episode: 3, sure: false })
    expect(np('Some advert', 10)).toBeNull()
  })

  it('says when an episode finished', () => {
    const a = np('Andor S2 E4', 2000) as Recognised
    expect(finished(a, np('Andor S2 E4', 2300))).toBeNull()
    expect(finished(np('Andor S2 E4', 2300), np('Andor S2 E4', 2600))?.episode).toBe(4)
    expect(finished(np('Andor S2 E4', 2300), np('Andor S2 E5', 10))?.episode).toBe(4)
    expect(finished(np('Andor S2 E4', 600), null)).toBeNull()
  })

  it('warns when the next one would run past bedtime', () => {
    const start = np('Andor S2 E5', 30, 2700) as Recognised
    expect(bedtimeWarning(start, new Date(2026, 10, 17, 23, 30), '00:00', '20:00')).toBe('This one ends at 00:14, 14 minutes past bedtime.')
    expect(bedtimeWarning(start, new Date(2026, 10, 17, 21, 0), '23:00', '20:00')).toBeNull()
    expect(bedtimeWarning(start, new Date(2026, 10, 17, 22, 50), '23:00', '20:00')).toBe('This one ends at 23:34, 34 minutes past bedtime.')
    expect(bedtimeWarning({ ...start, position: 600 }, new Date(2026, 10, 17, 22, 50), '23:00', '20:00')).toBeNull()
  })
})

describe('moments', () => {
  it('saves, edits and hides ones past where you are', () => {
    let l = addMoment(lib, 'tv:1', { episode: 'S1E2', at: 2292, savedAt: '2026-11-02T21:00:00Z' })
    l = addMoment(l, 'tv:1', { episode: 'S2E3', at: 60, savedAt: '2026-11-20T21:00:00Z', note: 'Mon Mothma' })
    const m = momentsOf(l.entries['tv:1'])
    expect(m.shown.map((x) => x.episode)).toEqual(['S1E2'])
    expect(m.hidden).toBe(1)
    l = editMoment(l, 'tv:1', 0, 'Sam’s reaction')
    expect(l.entries['tv:1'].moments![0].note).toBe('Sam’s reaction')
    l = editMoment(l, 'tv:1', 0, '')
    expect(l.entries['tv:1'].moments![0].note).toBeUndefined()
    expect(normalizeLibrary(JSON.parse(JSON.stringify(l))).entries['tv:1'].moments).toHaveLength(2)
    l = editMoment(l, 'tv:1', 1, null)
    expect(l.entries['tv:1'].moments).toHaveLength(1)
  })
})
