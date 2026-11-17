import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, type LibraryEntry, type TitleDetails, type WatchProviders } from './types'
import {
  NOT_CHECKED,
  OTHER_STREAMING,
  RENT_OR_BUY,
  bedtimeTonight,
  budgetPerNight,
  dayBefore,
  dayMinutes,
  eveningMinutes,
  finishPlan,
  fitTonight,
  formatHours,
  nextFriday,
  nextPremiere,
  nextRenewal,
  nightsBetween,
  planFor,
  startBy,
  timeLeft,
  tonight,
  watchlistHours,
  weekStart
} from './time'

const ev = { startTime: '20:00', bedtime: '23:00', watchDays: [1, 2, 3, 4, 5] }
const show = (over: Partial<TitleDetails> = {}): Pick<TitleDetails, 'type' | 'runtime' | 'seasons' | 'nextEpisode'> => ({
  type: 'tv',
  runtime: 45,
  seasons: [
    { number: 1, name: 'S1', episodeCount: 10, airDate: '2024-01-01', posterPath: null },
    { number: 2, name: 'S2', episodeCount: 8, airDate: '2026-11-01', posterPath: null },
    { number: 0, name: 'Specials', episodeCount: 3, airDate: null, posterPath: null }
  ],
  nextEpisode: null,
  ...over
})
const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({ key: 'tv:1', type: 'tv', id: 1, status: 'watching', addedAt: '', updatedAt: '', title: { name: 'X', year: null, posterPath: null }, ...over })
// 2026-11-17 is a Tuesday.
const at = (day: string, time: string): Date => new Date(`${day}T${time}:00`)

describe('timeLeft', () => {
  it('counts unwatched regular episodes, not specials', () => {
    const e = entry({ episodes: { S1E1: '2026-01-01', S1E2: '2026-01-01', S0E1: '2026-01-01' } })
    expect(timeLeft(show(), e, '2026-11-17')).toEqual({ episodes: 16, minutes: 720, estimated: false })
  })
  it("leaves out episodes and seasons that aren't out yet", () => {
    const airing = show({ nextEpisode: { season: 2, episode: 5, name: '', airDate: '2026-11-20' } })
    expect(timeLeft(airing, undefined, '2026-11-17').episodes).toBe(14)
    const future = show({ seasons: [...show().seasons, { number: 3, name: 'S3', episodeCount: 9, airDate: '2027-03-01', posterPath: null }] })
    expect(timeLeft(future, undefined, '2026-11-17').episodes).toBe(18)
  })
  it('handles films, watched things and unknown lengths', () => {
    expect(timeLeft({ type: 'movie', runtime: 166, seasons: [], nextEpisode: null }, undefined, '2026-11-17')).toEqual({ episodes: 0, minutes: 166, estimated: false })
    expect(timeLeft(show(), entry({ status: 'watched' }), '2026-11-17').minutes).toBe(0)
    expect(timeLeft(show({ runtime: null }), undefined, '2026-11-17')).toMatchObject({ minutes: 18 * 45, estimated: true })
  })
})

describe('evenings', () => {
  it('works out what fits before bed', () => {
    expect(fitTonight(at('2026-11-17', '21:00'), ev, 45)).toBe(2)
    expect(fitTonight(at('2026-11-17', '18:00'), ev, 45)).toBe(4)
    expect(fitTonight(at('2026-11-17', '23:30'), ev, 45)).toBe(0)
    expect(startBy(166, ev, at('2026-11-17', '19:00'))).toBe('20:14')
  })
  it('treats just after midnight as last night when bedtime is after midnight', () => {
    const late = { ...ev, bedtime: '01:00' }
    expect(tonight(at('2026-11-18', '00:15'), late)).toMatchObject({ day: '2026-11-17', minutesLeft: 45, bedtime: '01:00' })
    expect(startBy(90, late, at('2026-11-17', '21:00'))).toBe('23:30')
  })
})

describe('your week (phase 35)', () => {
  const off: { start: string; end: string }[] = []
  // Sun 19:00–22:30, weeknights 20:00–23:00, Fri to 00:30, Sat 14:00–17:00 and 20:00–00:30.
  const week = {
    ...ev,
    schedule: [
      [{ start: '19:00', end: '22:30' }],
      [{ start: '20:00', end: '23:00' }],
      [{ start: '20:00', end: '23:00' }],
      off,
      [{ start: '20:00', end: '23:00' }],
      [{ start: '20:00', end: '00:30' }],
      [{ start: '14:00', end: '17:00' }, { start: '20:00', end: '00:30' }]
    ]
  }
  it('gives each day its own times, and days off', () => {
    expect(dayMinutes('2026-11-17', week)).toBe(180) // Tue
    expect(dayMinutes('2026-11-18', week)).toBe(0) // Wed off
    expect(dayMinutes('2026-11-20', week)).toBe(270) // Fri to 00:30
    expect(dayMinutes('2026-11-21', week)).toBe(450) // Sat, two slots
    expect(nightsBetween('2026-11-16', '2026-11-22', week)).toEqual(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(eveningMinutes(week)).toBe(450)
  })
  it('counts a second slot, and what is left of each', () => {
    // Saturday at 15:00: 2h left of the afternoon and 4h30 tonight.
    const t = tonight(at('2026-11-21', '15:00'), week)
    expect(t.minutesLeft).toBe(120 + 270)
    expect(fitTonight(at('2026-11-21', '15:00'), week, 45)).toBe(2 + 6)
    expect(t.bedtime).toBe('00:30')
    // Friday after midnight still counts as Friday.
    expect(tonight(at('2026-11-21', '00:10'), week)).toMatchObject({ day: '2026-11-20', minutesLeft: 20 })
  })
  it('changes just tonight', () => {
    const now = at('2026-11-17', '19:00')
    expect(dayMinutes('2026-11-17', { ...week, justTonight: { day: '2026-11-17', off: true } })).toBe(0)
    expect(dayMinutes('2026-11-17', { ...week, justTonight: { day: '2026-11-17', start: '21:30' } })).toBe(90)
    expect(dayMinutes('2026-11-17', { ...week, justTonight: { day: '2026-11-17', bedtime: '00:00' } })).toBe(240)
    // A night off can be turned into a night in.
    expect(dayMinutes('2026-11-18', { ...week, justTonight: { day: '2026-11-18', start: '21:00' } })).toBe(120)
    // Only that evening.
    expect(dayMinutes('2026-11-24', { ...week, justTonight: { day: '2026-11-17', off: true } })).toBe(180)
    expect(bedtimeTonight(now, { ...week, justTonight: { day: '2026-11-17', bedtime: '23:45' } })).toBe('23:45')
  })
  it('leaves gaps between episodes and a wind-down before bed', () => {
    const now = at('2026-11-17', '19:00')
    expect(fitTonight(now, week, 45)).toBe(4)
    expect(fitTonight(now, { ...week, gapMinutes: 5 }, 45)).toBe(3)
    expect(fitTonight(now, { ...week, windDownMinutes: 30 }, 45)).toBe(3)
    expect(startBy(60, { ...week, windDownMinutes: 30 }, now)).toBe('21:30')
  })
  it('spreads plans to stay under a weekly budget', () => {
    // 6 nights, 9 hours a week: 90 minutes a night, so 2 episodes even on a long Saturday.
    const b = { ...week, weeklyBudgetMinutes: 540 }
    expect(budgetPerNight(b)).toBe(90)
    expect(planFor('2026-11-21', b, 45)).toBe(2)
    expect(planFor('2026-11-21', week, 45)).toBe(10)
    const p = finishPlan({ episodes: 6, minutes: 270, estimated: false }, 45, '2026-11-30', at('2026-11-17', '19:00'), b)
    expect(p.earliestFinish).toBe('2026-11-20') // Tue, Thu, Fri: 2 each
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
  })
})

describe('finishPlan', () => {
  const left = { episodes: 10, minutes: 450, estimated: false }
  it('spreads episodes over your nights up to the deadline', () => {
    // Tue 17 at 19:00 → Sat 21 (not a watching night): Tue, Wed, Thu, Fri = 4 nights.
    const p = finishPlan(left, 45, '2026-11-21', at('2026-11-17', '19:00'), ev)
    expect(p).toMatchObject({ nights: 4, perNight: 3, maxPerNight: 4, realistic: true, tonight: 4, earliestFinish: '2026-11-19' })
  })
  it('says when it is not realistic, and the earliest finish', () => {
    const p = finishPlan({ ...left, episodes: 30 }, 45, '2026-11-21', at('2026-11-17', '22:30'), ev)
    expect(p.realistic).toBe(false)
    expect(p.tonight).toBe(0)
    expect(p.nights).toBe(3)
    // Wed–Fri 12, then Mon–Thu next week (skipping the weekend): 4+4+4+4+4+4+4+2.
    expect(p.earliestFinish).toBe('2026-11-27')
  })
  it('copes with no nights at all', () => {
    expect(finishPlan(left, 45, '2026-11-21', at('2026-11-17', '19:00'), { ...ev, watchDays: [] })).toMatchObject({ nights: 0, realistic: false, earliestFinish: null })
  })
})

describe('deadlines', () => {
  it('finds next Friday, premieres and renewals', () => {
    expect(nextFriday('2026-11-17')).toBe('2026-11-20')
    expect(nextFriday('2026-11-20')).toBe('2026-11-20')
    expect(nextPremiere({ seasons: [...show().seasons, { number: 3, name: '', episodeCount: 8, airDate: '2027-03-01', posterPath: null }], nextEpisode: null }, '2026-11-17')).toBe('2027-03-01')
    expect(nextPremiere(show(), '2026-11-17')).toBeNull()
    expect(nextRenewal(25, '2026-11-17')).toBe('2026-11-25')
    expect(nextRenewal(5, '2026-11-17')).toBe('2026-12-05')
    expect(nextRenewal(31, '2026-11-17')).toBe('2026-11-30')
    expect(nextRenewal(10, '2026-12-17')).toBe('2027-01-10')
    expect(dayBefore('2026-12-01')).toBe('2026-11-30')
  })
})

describe('watchlistHours', () => {
  const P = (stream: number[], rent: number[] = []): WatchProviders => ({
    region: 'GB',
    link: null,
    stream: stream.map((id) => ({ id, name: id === 337 ? 'Disney Plus' : id === 39 ? 'Now TV' : 'Netflix', logoPath: null })),
    free: [],
    rent: rent.map((id) => ({ id, name: 'Apple TV', logoPath: null })),
    buy: []
  })
  it('totals and splits by your services first', () => {
    const items = [
      { key: 'a', left: { episodes: 0, minutes: 120, estimated: false } },
      { key: 'b', left: { episodes: 4, minutes: 180, estimated: false } },
      { key: 'c', left: { episodes: 0, minutes: 100, estimated: false } },
      { key: 'd', left: { episodes: 0, minutes: 90, estimated: false } },
      { key: 'e', left: { episodes: 0, minutes: 60, estimated: false } },
      { key: 'f', left: { episodes: 0, minutes: 0, estimated: false } }
    ]
    const r = watchlistHours(items, { a: P([39, 337]), b: P([337]), c: P([8]), d: P([], [2]) }, [337, 39])
    expect(r.minutes).toBe(550)
    expect(r.titles).toBe(5)
    expect(r.buckets.map((b) => [b.label, b.minutes, b.titles])).toEqual([
      ['Disney Plus', 300, 2],
      [OTHER_STREAMING, 100, 1],
      [RENT_OR_BUY, 90, 1],
      [NOT_CHECKED, 60, 1]
    ])
  })
  it('formats hours', () => {
    expect(formatHours(214 * 60 + 20)).toBe('214 hours')
    expect(formatHours(200)).toBe('3h 20m')
    expect(formatHours(45)).toBe('45m')
  })
  it('has evening defaults', () => {
    expect(DEFAULT_PREFERENCES).toMatchObject({ startTime: '20:00', bedtime: '23:00' })
  })
})
