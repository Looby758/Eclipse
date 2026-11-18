import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, planWatchWith, setEpisodes, setStatus, startRewatch, startWatchWith, tickWith, watchesWith } from './library'
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
  fromExtension,
  refreshSuggestion,
  suggestionFromPlaying,
  suggestionWith,
  tickSuggestion,
  tickTargets,
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
    expect(parseEpisode('S5:E3 Strangers')).toEqual({ season: 5, episode: 3 })
    expect(parseEpisode('S5 Ep3')).toEqual({ season: 5, episode: 3 })
    expect(parseEpisode('Season 1, Ep. 3 Pilot')).toEqual({ season: 1, episode: 3 })
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
  it('suggests only episodes the title names, once each, and never guesses', () => {
    const visits = [
      v('https://www.disneyplus.com/play/aaa', 'Andor | Disney+', '2026-11-10', 1),
      v('https://www.disneyplus.com/play/bbb', 'Andor | Disney+', '2026-11-10', 3),
      v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E5 - NOW', '2026-11-11', 5),
      v('https://www.nowtv.com/gb/watch/playback/2', 'The Walking Dead S1 E5 - NOW', '2026-11-11', 6),
      v('https://www.netflix.com/watch/9', 'Andor S1 E2 - Netflix', '2026-11-11', 7),
      v('https://www.netflix.com/watch/9', 'Netflix', '2026-11-11', 8)
    ]
    const s = suggestFromVisits(visits, lib, new Set())
    // Andor's player pages don't say which episode, and S1 E2 is ticked already.
    expect(s.map((x) => [x.id, x.day, x.sure, x.service])).toEqual([['tv:2@S1E5', '2026-11-11', true, 'NOW']])
    expect(suggestFromVisits(visits, lib, new Set(['tv:2@S1E5']))).toEqual([])
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

describe('watching with someone', () => {
  const twd = { key: 'tv:2' as const, type: 'tv' as const, id: 2, title: { name: 'The Walking Dead', year: 2010, posterPath: null } }
  const at = (d: string, t = '20:00'): Date => new Date(`${d}T${t}:00`)
  const v = (url: string, title: string, day: string, time = '22:00') => ({ url, title, day, at: at(day, time).getTime() })
  const whole = ['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5', 'S1E6']
  // Seen it all years ago, now rewatching with Sam (three in).
  const seen = (): Library => {
    let l = setEpisodes(setStatus(emptyLibrary(), twd, 'watched', at('2015-01-01')), twd, whole, true, at('2015-01-01'))
    l = startWatchWith(l, twd, 'Sam', at('2026-11-01'))
    return tickWith(l, twd.key, watchesWith(l.entries[twd.key])[0].index, ['S1E1', 'S1E2', 'S1E3'], true, at('2026-11-02'))
  }
  const sam = (l: Library) => l.entries[twd.key].rewatches!.find((r) => r.with === 'Sam')!

  it('asks to tick episodes you saw the first time on the watch with them', () => {
    const l = seen()
    const visits = [v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E4 - NOW', '2026-11-10'), v('https://www.nowtv.com/gb/watch/playback/2', 'The Walking Dead S1 E6 - NOW', '2026-11-10', '23:00')]
    const s = suggestFromVisits(visits, l, new Set())
    expect(s.map((x) => [x.id, x.targets])).toEqual([
      ['tv:2@S1E4', [{ with: 'Sam' }]],
      ['tv:2@S1E6', [{ with: 'Sam' }]]
    ])
    expect(suggestionWith(s[0])).toBe('with Sam')
    // Yes ticks Sam's watch, on the day it was watched, and leaves the first watch alone.
    const after = tickSuggestion(l, s[0])
    expect(sam(after).episodes?.S1E4).toBe('2026-11-10')
    expect(after.entries[twd.key].episodes).toEqual(l.entries[twd.key].episodes)
    expect(refreshSuggestion(s[0], after)).toBeNull()
    expect(refreshSuggestion(s[1], after)?.targets).toEqual([{ with: 'Sam' }])
  })

  it('lets you choose when it could be your own progress too', () => {
    let l = setEpisodes(emptyLibrary(), twd, ['S1E1', 'S1E2'], true, at('2026-10-01'))
    l = startWatchWith(l, twd, 'Sam', at('2026-11-01'))
    const [s] = suggestFromVisits([v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E3 - NOW', '2026-11-10')], l, new Set())
    expect(s.targets).toEqual([{ with: 'Sam' }, { with: null }])
    expect(suggestionWith(s)).toBe('')
    const mine = tickSuggestion(l, s, null)
    expect(mine.entries[twd.key].episodes?.S1E3).toBe('2026-11-10')
    expect(sam(mine).episodes).toBeUndefined()
    // Still waiting for Sam's watch.
    expect(refreshSuggestion(s, mine)?.targets).toEqual([{ with: 'Sam' }])
    const theirs = tickSuggestion(l, s, 'sam')
    expect(sam(theirs).episodes).toEqual({ S1E3: '2026-11-10' })
    expect(theirs.entries[twd.key].episodes?.S1E3).toBeUndefined()
    // Your own rewatch counts as your own progress.
    const re = startWatchWith(startRewatch(setStatus(emptyLibrary(), twd, 'watched', at('2015-01-01')), twd, at('2026-11-01')), twd, 'Sam', at('2026-11-01'))
    expect(tickTargets(re.entries[twd.key], 'S1E1')).toEqual([{ with: 'Sam' }, { with: null }])
  })

  it('offers each person who still needs it', () => {
    const l = startWatchWith(seen(), twd, 'Mum', at('2026-11-01'))
    const [s] = suggestFromVisits([v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E2 - NOW', '2026-11-10')], l, new Set())
    expect(s.targets).toEqual([{ with: 'Mum' }])
    const [o] = suggestFromVisits([v('https://www.nowtv.com/gb/watch/playback/1', 'The Walking Dead S1 E4 - NOW', '2026-11-12')], l, new Set())
    expect(o.targets).toEqual([{ with: 'Sam' }, { with: 'Mum' }])
  })

  it('guesses which episode is playing from the watch whose arranged time it is, but only asks about named ones', () => {
    let l = startWatchWith(seen(), twd, 'Mum', at('2026-11-01'))
    l = planWatchWith(l, twd.key, watchesWith(l.entries[twd.key]).find((x) => x.watch.with === 'Mum')!.index, { at: '2026-11-10T21:00' })
    const play = (when: Date, title = 'The Walking Dead') => recognise({ app: 'chrome.exe', title, status: 'playing', position: 2600, duration: 2700 }, l, details, today, when)
    // Mum's evening: her next one. Another evening: Sam's (ticked most recently).
    expect(play(at('2026-11-10', '21:30'))).toMatchObject({ season: 1, episode: 1, sure: false })
    expect(play(at('2026-11-12', '21:30'))).toMatchObject({ season: 1, episode: 4, sure: false })
    // A guess shows as playing, but finishing it doesn't ask to tick anything.
    expect(suggestionFromPlaying(play(at('2026-11-12'))!, '2026-11-12', l)).toBeNull()
    const named = play(at('2026-11-12'), 'The Walking Dead S1 E4')!
    expect(suggestionFromPlaying(named, '2026-11-12', l)?.targets).toEqual([{ with: 'Sam' }, { with: 'Mum' }])
    expect(suggestionFromPlaying({ ...named, episode: 2 }, '2026-11-12', l)?.targets).toEqual([{ with: 'Mum' }])
    // Guesses saved by earlier versions are dropped.
    const guess = { id: 'tv:2@S1E4', key: 'tv:2', name: 'The Walking Dead', season: 1, episode: 4, day: '2026-11-10', source: 'history' as const, service: 'NOW', url: null, sure: false }
    expect(refreshSuggestion(guess, l)).toBeNull()
  })

  it('keeps working for shows you only watch yourself, and old saved suggestions', () => {
    expect(tickTargets(lib.entries['tv:1'], 'S1E3')).toEqual([{ with: null }])
    expect(tickTargets(lib.entries['tv:1'], 'S1E2')).toEqual([])
    const old = { id: 'tv:1@S1E3', key: 'tv:1', name: 'Andor', season: 1, episode: 3, day: '2026-11-10', source: 'history' as const, service: null, url: null, sure: true }
    expect(refreshSuggestion(old, lib)?.targets).toEqual([{ with: null }])
    expect(tickSuggestion(lib, old).entries['tv:1'].episodes?.S1E3).toBe('2026-11-10')
    expect(tickSuggestion(lib, old, 'Sam')).toBe(lib)
  })
})

describe('the Chrome extension', () => {
  const report = (over: object = {}) => ({ url: 'https://www.disneyplus.com/en-gb/play/abc', texts: ['The Walking Dead', 'S5:E3 Four Walls and a Roof', 'Disney+'], position: 2650, duration: 2700, paused: false, ...over })

  it('reads the exact episode from the player', () => {
    const np = fromExtension(report())!
    expect(np).toMatchObject({ app: 'Chrome extension (Disney+)', status: 'playing', position: 2650, duration: 2700 })
    expect(recognise(np, lib, details, today)).toMatchObject({ key: 'tv:2', season: 5, episode: 3, sure: true, service: 'Disney+' })
    expect(fromExtension(report({ paused: true }))?.status).toBe('paused')
    expect(fromExtension(report({ ended: true }))?.status).toBe('stopped')
  })

  it('only takes tidy reports from streaming sites', () => {
    expect(fromExtension(null)).toBeNull()
    expect(fromExtension(report({ url: 'https://example.com/play/1' }))).toBeNull()
    expect(fromExtension(report({ url: 'http://www.disneyplus.com/play/1' }))).toBeNull()
    expect(fromExtension(report({ texts: [] }))).toBeNull()
    const np = fromExtension(report({ texts: ['  Andor ', 'andor', 3, 'x'.repeat(500), ...Array(20).fill(0).map((_, i) => `t${i}`)], position: -1, duration: 'long' }))!
    expect(np.title.split(' · ').slice(0, 2)).toEqual(['Andor', 'x'.repeat(200)])
    expect(np.title.split(' · ')).toHaveLength(12)
    expect([np.position, np.duration]).toEqual([null, null])
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
