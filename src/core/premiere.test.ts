import { describe, expect, it } from 'vitest'
import { countdown, isPremiereNight, premiereOf, premierePosters, premieresTonight, ukMoment, usualReleaseTime, waitProgress } from './premiere'
import type { ComingSoon } from './shelf'

const ukDay = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d)

const soon = (over: Partial<ComingSoon> = {}): ComingSoon => ({
  key: 'tv:1',
  type: 'tv',
  id: 1,
  name: 'Daryl Dixon',
  posterPath: '/p.jpg',
  season: 3,
  date: '2026-11-23',
  label: 'Season 3',
  out: false,
  ...over
})

describe('premiere night (phase 50)', () => {
  it('turns a UK time into the right moment, winter and summer', () => {
    expect(ukMoment('2026-11-23', '08:00').toISOString()).toBe('2026-11-23T08:00:00.000Z')
    expect(ukMoment('2026-06-12', '08:00').toISOString()).toBe('2026-06-12T07:00:00.000Z')
    // The night the clocks go forward (29 March 2026): 02:30 doesn't exist, so it lands after the change.
    expect(ukMoment('2026-03-29', '03:00').toISOString()).toBe('2026-03-29T02:00:00.000Z')
  })

  it('knows the usual UK time for each service, and guesses 08:00 otherwise', () => {
    expect(usualReleaseTime('Disney+')).toEqual({ time: '08:00', nextDay: false, known: true })
    expect(usualReleaseTime('NOW')).toEqual({ time: '02:00', nextDay: true, known: true })
    expect(usualReleaseTime(null)).toEqual({ time: '08:00', nextDay: false, known: false })
  })

  it('puts an American evening show on NOW out the morning after TMDB’s date', () => {
    const p = premiereOf(soon(), 'NOW')!
    expect(p.day).toBe('2026-11-24')
    expect(p.at.toISOString()).toBe('2026-11-24T02:00:00.000Z')
    expect(p.usual).toBe(true)
  })

  it('uses the time you set instead of the usual one', () => {
    const p = premiereOf(soon(), 'Disney+', { day: '2026-11-23', time: '21:00' })!
    expect(p.at.toISOString()).toBe('2026-11-23T21:00:00.000Z')
    expect(p.usual).toBe(false)
    expect(premiereOf(soon(), 'Disney+', { day: 'soon', time: '9pm' } as never)!.time).toBe('08:00')
  })

  it('is only for shows with a date', () => {
    expect(premiereOf(soon({ type: 'movie' }), null)).toBeNull()
    expect(premiereOf(soon({ date: null }), null)).toBeNull()
  })

  it('takes over Home for the whole day it comes out, and not the day before or after', () => {
    const p = premiereOf(soon(), 'Disney+')!
    expect(isPremiereNight(p, new Date('2026-11-22T23:59:00Z'), ukDay)).toBe(false)
    expect(isPremiereNight(p, new Date('2026-11-23T00:00:00Z'), ukDay)).toBe(true)
    expect(isPremiereNight(p, new Date('2026-11-23T22:00:00Z'), ukDay)).toBe(true)
    expect(isPremiereNight(p, new Date('2026-11-24T00:01:00Z'), ukDay)).toBe(false)
  })

  it('puts the next one out first, and ones already out after', () => {
    const a = premiereOf(soon({ key: 'tv:1', name: 'A' }), 'Disney+')!
    const b = premiereOf(soon({ key: 'tv:2', name: 'B' }), 'Channel 4')!
    const c = premiereOf(soon({ key: 'tv:3', name: 'C', date: '2026-11-30' }), 'Netflix')!
    expect(premieresTonight([b, a, c], new Date('2026-11-23T07:00:00Z'), ukDay).map((p) => p.item.name)).toEqual(['A', 'B'])
    expect(premieresTonight([b, a, c], new Date('2026-11-23T09:00:00Z'), ukDay).map((p) => p.item.name)).toEqual(['B', 'A'])
  })

  it('counts down to the second, then says it’s out', () => {
    const at = new Date('2026-11-23T08:00:00Z')
    expect(countdown(at, new Date('2026-11-23T05:45:30Z'))).toEqual({ out: false, hours: 2, minutes: 14, seconds: 30 })
    expect(countdown(at, new Date('2026-11-23T07:59:59.500Z'))).toEqual({ out: false, hours: 0, minutes: 0, seconds: 1 })
    expect(countdown(at, new Date('2026-11-23T08:00:00Z')).out).toBe(true)
    expect(countdown(at, new Date('2026-11-23T12:00:00Z')).out).toBe(true)
  })

  it('fills the ring through the day, and is full once it’s out', () => {
    const at = new Date(2026, 10, 23, 8, 0)
    expect(waitProgress(at, new Date(2026, 10, 23, 0, 0))).toBe(0)
    expect(waitProgress(at, new Date(2026, 10, 23, 4, 0))).toBeCloseTo(0.5)
    expect(waitProgress(at, new Date(2026, 10, 23, 9, 0))).toBe(1)
    // Out at 02:00: counted from 6pm the evening before, so the ring is already moving.
    expect(waitProgress(new Date(2026, 10, 24, 2, 0), new Date(2026, 10, 24, 0, 0))).toBeCloseTo(0.75)
  })

  it('fills the wall with the season’s poster first, then English and textless posters, never anything else', () => {
    const posters = premierePosters('/s3.jpg', [{ path: '/a.jpg', language: 'en' }, { path: '/fr.jpg', language: 'fr' }, { path: '/b.jpg', language: null }, { path: '/s3.jpg', language: 'en' }], ['/s1.jpg', null, '/a.jpg'], '/mine.jpg')
    expect(posters).toEqual(['/s3.jpg', '/mine.jpg', '/a.jpg', '/b.jpg', '/s1.jpg'])
  })
})
