import { describe, expect, it } from 'vitest'
import { emptyLibrary } from './library'
import { emptyHistory, normalizeHistory, serviceReports, servicesNews, streamingIds, updateHistory } from './services'
import type { Library, LibraryEntry, Provider, TitleDetails, WatchProviders } from './types'

const p = (id: number, name = `P${id}`): Provider => ({ id, name, logoPath: null })
const wp = (stream: number[], free: number[] = [], rent: number[] = []): WatchProviders => ({ region: 'GB', link: null, stream: stream.map((i) => p(i)), free: free.map((i) => p(i)), rent: rent.map((i) => p(i)), buy: [] })
const names = { 'tv:1': 'Andor', 'tv:2': 'Loki', 'movie:3': 'Dune' }
const providers = { 337: 'Disney+', 39: 'NOW TV', 8: 'Netflix' }

describe('arriving and leaving', () => {
  it('lists streaming and free providers, not rent or buy', () => {
    expect(streamingIds(wp([8, 337], [2], [3]))).toEqual([2, 8, 337])
  })

  it('the first snapshot has no news; then gains and losses show up', () => {
    let h = updateHistory(emptyHistory(), { day: '2026-11-01', titles: { 'tv:1': [39], 'tv:2': [] } }, names, providers)
    expect(h.events).toEqual([])
    h = updateHistory(h, { day: '2026-11-02', titles: { 'tv:1': [337], 'tv:2': [337], 'movie:3': [8] } }, names, providers)
    expect(h.events.map((e) => `${e.kind} ${e.name} ${e.provider}`).sort()).toEqual(['arrived Andor Disney+', 'arrived Loki Disney+', 'left Andor NOW TV'])
    // Dune was new to the snapshot (just added), so it isn't news.
    expect(h.events.some((e) => e.key === 'movie:3')).toBe(false)
  })

  it('takes one snapshot a day and forgets old news', () => {
    const h = updateHistory(emptyHistory(), { day: '2026-11-01', titles: { 'tv:1': [39] } }, names, providers)
    expect(updateHistory(h, { day: '2026-11-01', titles: { 'tv:1': [] } }, names, providers)).toBe(h)
    const old = { ...h, events: [{ day: '2024-01-01', key: 'tv:1', name: 'Andor', providerId: 39, provider: 'NOW TV', kind: 'left' as const }] }
    expect(updateHistory(old, { day: '2026-11-02', titles: { 'tv:1': [39] } }, names, providers).events).toEqual([])
  })

  it('groups recent news on your services, arrivals first', () => {
    let h = updateHistory(emptyHistory(), { day: '2026-11-01', titles: { 'tv:1': [39], 'tv:2': [], 'movie:3': [] } }, names, providers)
    h = updateHistory(h, { day: '2026-11-10', titles: { 'tv:1': [337], 'tv:2': [337], 'movie:3': [8] } }, names, providers)
    const news = servicesNews(h, [337, 39], '2026-11-17')
    expect(news.map((n) => `${n.kind} ${n.provider}: ${n.titles.map((t) => t.name).join(', ')}`)).toEqual(['arrived Disney+: Andor, Loki', 'left NOW TV: Andor'])
    expect(servicesNews(h, [337, 39], '2026-12-30')).toEqual([])
  })

  it('reads back a saved history, dropping nonsense', () => {
    expect(normalizeHistory(null)).toEqual(emptyHistory())
    const h = normalizeHistory({ snapshot: { day: '2026-11-01', titles: {} }, events: [{ day: '2026-11-01', key: 'tv:1', name: 'A', providerId: 8, provider: 'Netflix', kind: 'arrived' }, { nope: 1 }] })
    expect(h.events).toHaveLength(1)
    expect(h.snapshot?.day).toBe('2026-11-01')
  })
})

describe('do I still need it?', () => {
  const today = '2026-11-17'
  const entry = (key: string, status: LibraryEntry['status'], over: Partial<LibraryEntry> = {}): LibraryEntry => {
    const [type, id] = key.split(':')
    return { key, type, id: Number(id), status, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: { name: key, year: null, posterPath: null }, ...over } as LibraryEntry
  }
  const film = (runtime: number): TitleDetails => ({ type: 'movie', runtime, seasons: [], nextEpisode: null }) as unknown as TitleDetails
  const show: TitleDetails = { type: 'tv', runtime: 50, seasons: [{ number: 1, name: 'S1', episodeCount: 4, airDate: '2024-01-01', posterPath: null }], nextEpisode: null } as unknown as TitleDetails
  const lib = (entries: LibraryEntry[]): Library => ({ ...emptyLibrary(), entries: Object.fromEntries(entries.map((e) => [e.key, e])) })

  it('adds up what you have queued and watched lately on each service', () => {
    const library = lib([
      entry('movie:3', 'want'),
      entry('tv:1', 'watching', { episodes: { S1E1: '2026-11-10', S1E2: '2026-11-11' } }),
      entry('tv:2', 'watched', { watchedOn: '2026-09-01' })
    ])
    const [disney, now] = serviceReports(library, [p(337, 'Disney+'), p(39, 'NOW TV')], { 'movie:3': wp([337]), 'tv:1': wp([337]), 'tv:2': wp([39]) }, { 'movie:3': film(150), 'tv:1': show, 'tv:2': show }, { '39': 20 }, today)
    expect(disney.queuedMinutes).toBe(150 + 100)
    expect(disney.recentMinutes).toBe(100)
    expect(disney.recentTitles).toEqual(['tv:1'])
    expect(disney.pause).toBe(false)
    expect(now.queuedMinutes).toBe(0)
    expect(now.renews).toBe('2026-11-20')
    expect(now.daysToRenewal).toBe(3)
    expect(now.pause).toBe(true)
  })

  it('doesn’t suggest pausing far from the renewal day', () => {
    const [r] = serviceReports(lib([]), [p(39)], {}, {}, { '39': 10 }, today)
    expect(r.daysToRenewal).toBe(23)
    expect(r.pause).toBe(false)
  })
})

describe('best services for your watchlist', () => {
  it('ranks services by hours and picks the fewest that cover the most', async () => {
    const { bestServices } = await import('./services')
    const P = (id: number, name: string) => ({ id, name, logoPath: null })
    const wp = (stream: { id: number; name: string; logoPath: null }[], free: { id: number; name: string; logoPath: null }[] = []) => ({ region: 'GB', link: null, stream, free, rent: [], buy: [] })
    const netflix = P(8, 'Netflix')
    const ads = P(1796, 'Netflix Standard with Ads')
    const disney = P(337, 'Disney Plus')
    const now = P(39, 'Now TV')
    const titles = [
      { key: 'tv:1', name: 'Big show', minutes: 600 },
      { key: 'tv:2', name: 'Other show', minutes: 300 },
      { key: 'movie:3', name: 'Film', minutes: 120 },
      { key: 'movie:4', name: 'Free film', minutes: 100 },
      { key: 'movie:5', name: 'Rent only', minutes: 110 },
      { key: 'movie:6', name: 'Unchecked', minutes: 90 }
    ]
    const providers = {
      'tv:1': wp([netflix, ads, now]),
      'tv:2': wp([disney]),
      'movie:3': wp([netflix, disney]),
      'movie:4': wp([], [P(38, 'BBC iPlayer')]),
      'movie:5': wp([])
    }
    const b = bestServices(titles, providers, [39])
    expect(b.ranking.map((c) => [c.provider.name, c.minutes, c.mine])).toEqual([
      ['Netflix', 720, false],
      ['Now TV', 600, true],
      ['Disney Plus', 420, false]
    ])
    expect(b.combo.map((c) => [c.provider.name, c.addsMinutes])).toEqual([
      ['Netflix', 720],
      ['Disney Plus', 300]
    ])
    expect(b.free.map((t) => t.key)).toEqual(['movie:4'])
    expect(b.nowhere.map((t) => t.key)).toEqual(['movie:5'])
    expect(b.unchecked).toBe(1)
  })
})
