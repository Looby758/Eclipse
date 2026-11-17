import { describe, expect, it } from 'vitest'
import { availability, guessServices, onMyServices, passesFilter } from './providers'
import { parseProviders, parseSeason } from './tmdb'

const disney = { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/d.png', display_priority: 2 }
const now = { provider_id: 39, provider_name: 'Now TV', logo_path: '/n.png', display_priority: 5 }
const netflix = { provider_id: 8, provider_name: 'Netflix', logo_path: '/x.png', display_priority: 1 }
const apple = { provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.png', display_priority: 3 }

describe('where to watch', () => {
  it('reads TMDB providers for a region, merging free and with-ads', () => {
    const p = parseProviders('GB', { link: 'https://x', flatrate: [now, disney], rent: [apple], buy: [apple], ads: [netflix] })
    expect(p.stream.map((s) => s.id)).toEqual([337, 39])
    expect(p.free.map((s) => s.id)).toEqual([8])
    expect(parseProviders('GB', undefined)).toEqual({ region: 'GB', link: null, stream: [], free: [], rent: [], buy: [] })
  })

  it('sorts titles into mine, elsewhere, rent or buy, and nowhere', () => {
    const mine = [337, 39]
    expect(availability(parseProviders('GB', { flatrate: [disney] }), mine)).toBe('mine')
    expect(availability(parseProviders('GB', { flatrate: [netflix] }), mine)).toBe('stream')
    const iplayer = { provider_id: 38, provider_name: 'BBC iPlayer', logo_path: '/b.png', display_priority: 4 }
    expect(availability(parseProviders('GB', { flatrate: [netflix], free: [iplayer] }), mine)).toBe('free')
    expect(availability(parseProviders('GB', { free: [iplayer] }), [38])).toBe('mine')
    expect(availability(parseProviders('GB', { rent: [apple] }), mine)).toBe('rentbuy')
    expect(availability(parseProviders('GB', {}), mine)).toBe('none')
    expect(onMyServices(parseProviders('GB', { flatrate: [netflix, now] }), mine).map((s) => s.name)).toEqual(['Now TV'])
  })

  it('filters', () => {
    expect(passesFilter('any', undefined)).toBe(true)
    expect(passesFilter('mine', 'mine')).toBe(true)
    expect(passesFilter('mine', 'stream')).toBe(false)
    expect(passesFilter('none', undefined)).toBe(false)
    expect(passesFilter('mineOrFree', 'free')).toBe(true)
    expect(passesFilter('mineOrFree', 'mine')).toBe(true)
    expect(passesFilter('mineOrFree', 'stream')).toBe(false)
  })

  it('guesses Disney+ and NOW TV from the list', () => {
    const list = [netflix, disney, now, apple, { provider_id: 591, provider_name: 'Now TV Cinema' }].map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: null }))
    expect(guessServices(list)).toEqual([337, 39])
    expect(guessServices([{ id: 1, name: 'Disney+', logoPath: null }])).toEqual([1])
  })
})

describe('seasons', () => {
  it('reads episodes in order', () => {
    const s = parseSeason(1, { name: 'Season 1', season_number: 1, episodes: [{ season_number: 1, episode_number: 2, name: 'B', vote_count: 0, vote_average: 0 }, { season_number: 1, episode_number: 1, name: 'A', air_date: '2022-09-21', runtime: 40, vote_count: 50, vote_average: 8.1 }] })
    expect(s.episodes.map((e) => e.name)).toEqual(['A', 'B'])
    expect(s.episodes[0]).toMatchObject({ airDate: '2022-09-21', runtime: 40, voteAverage: 8.1 })
    expect(s.episodes[1].voteAverage).toBeNull()
  })
})
