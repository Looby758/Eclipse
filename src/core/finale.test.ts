import { describe, expect, it } from 'vitest'
import { finaleStats, finaleTimeline, isComplete, justFinished, themeShape } from './finale'
import { emptyLibrary } from './library'
import type { Episode, Library, LibraryEntry } from './types'

const seasons = [
  { number: 0, episodeCount: 3 },
  { number: 1, episodeCount: 3 },
  { number: 2, episodeCount: 2 }
]

function entry(episodes: Record<string, string>, extra: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    key: 'tv:1402',
    type: 'tv',
    id: 1402,
    status: 'watching',
    addedAt: '2025-03-01T10:00:00Z',
    updatedAt: '2025-03-01T10:00:00Z',
    episodes,
    title: { name: 'The Walking Dead', year: 2010, posterPath: '/p.jpg' } as LibraryEntry['title'],
    ...extra
  }
}

const all = { S1E1: '2025-03-03', S1E2: '2025-03-03', S1E3: '2025-03-03', S2E1: '2025-06-01', S2E2: '2025-06-02' }
const ep = (season: number, number: number, voteAverage: number, voteCount = 50, runtime: number | null = 44): Episode => ({ season, number, name: `E${number}`, airDate: null, runtime, overview: '', voteAverage, voteCount, stillPath: null })

describe('justFinished', () => {
  const almost = entry({ ...all, S2E2: undefined as unknown as string })
  delete almost.episodes!.S2E2

  it('fires when the last episode of an ended show is ticked today', () => {
    expect(isComplete(almost, seasons)).toBe(false)
    expect(justFinished(almost, entry(all), seasons, 'Ended', '2025-06-02')).toBe(true)
    // After midnight still counts as last night.
    expect(justFinished(almost, entry(all), seasons, 'Canceled', '2025-06-03')).toBe(true)
  })

  it("doesn't fire for shows still going, old finishes, or ones already complete", () => {
    expect(justFinished(almost, entry(all), seasons, 'Returning Series', '2025-06-02')).toBe(false)
    expect(justFinished(almost, entry(all), seasons, 'Ended', '2025-07-01')).toBe(false)
    expect(justFinished(entry(all), entry(all), seasons, 'Ended', '2025-06-02')).toBe(false)
  })

  it('ignores specials and shows ticked as seen with no date', () => {
    const seen = entry({ S1E1: 'seen', S1E2: 'seen', S1E3: 'seen', S2E1: 'seen', S2E2: 'seen' })
    expect(justFinished(undefined, seen, seasons, 'Ended', '2025-06-02')).toBe(false)
  })
})

describe('finaleStats', () => {
  const lib = (e: LibraryEntry): Library => ({ ...emptyLibrary(), entries: { [e.key]: e } })

  it('works out the dates, totals and moments', () => {
    const e = entry(all, { rewatches: [{ startedOn: '2025-03-01', with: 'Sam', episodes: { S1E1: '2025-03-01', S1E2: '2025-03-02' } }] })
    const s = finaleStats(lib(e), e.key, seasons, [ep(1, 1, 7.9), ep(1, 2, 8.4), ep(1, 3, 9.6, 2), ep(2, 1, 9.1), ep(2, 2, 8.0, 50, null)], 45)!
    expect(s.startedOn).toBe('2025-03-03')
    expect(s.finishedOn).toBe('2025-06-02')
    expect(s.days).toBe(92)
    expect(s.episodes).toBe(5)
    expect(s.seasons).toBe(2)
    expect(s.minutes).toBe(44 * 4 + 45)
    expect(s.firstEpisode).toEqual({ season: 1, episode: 1, name: 'E1' })
    expect(s.longestNight).toEqual({ count: 3, day: '2025-03-03' })
    expect(s.longestBreak).toEqual({ days: 90, afterSeason: 1 })
    // S1E3's 9.6 has too few votes to count.
    expect(s.best).toEqual({ season: 2, episode: 1, name: 'E1', rating: 9.1 })
    expect(s.together).toEqual([{ who: 'Sam', episodes: 2 }])
    expect(s.finishedCount).toBe(1)
  })

  it('leaves out moments that are too small', () => {
    const e = entry({ S1E1: '2025-03-01', S1E2: '2025-03-02', S1E3: '2025-03-03', S2E1: '2025-03-04', S2E2: '2025-03-05' })
    const s = finaleStats(lib(e), e.key, seasons, [], null)!
    expect(s.longestNight).toBeNull()
    expect(s.longestBreak).toBeNull()
    expect(s.best).toBeNull()
    expect(s.together).toEqual([])
    expect(s.minutes).toBe(5 * 45)
  })
})

/** Levels shaped like The Walking Dead's theme on Plex: quiet, band in at 7.5s, drops back at 19s, last hit at 23.5s, cut at 29.5s. */
function twdLevels(step = 0.05): number[] {
  const out: number[] = []
  for (let t = 0; t < 29.5; t += step) {
    const db = t < 7.5 ? -26 : t < 19 ? -17 : t < 23.5 ? -26 : t < 24.5 ? -17 : -25.5
    out.push(10 ** (db / 20) * (1 + 0.05 * Math.sin(t * 13)))
  }
  return out
}

describe('themeShape', () => {
  it('finds where the band comes in and the last hit', () => {
    const s = themeShape(twdLevels(), 0.05)
    expect(s.duration).toBeCloseTo(29.5, 0)
    expect(s.drop).toBeGreaterThan(7)
    expect(s.drop).toBeLessThan(8)
    expect(s.lastHit).toBeGreaterThan(23)
    expect(s.lastHit).toBeLessThan(24)
  })

  it('finds nothing in a flat tune', () => {
    const s = themeShape(Array(600).fill(0.05), 0.05)
    expect(s.drop).toBeNull()
    expect(s.lastHit).toBeNull()
  })
})

describe('finaleTimeline', () => {
  it('lines the highlights up with the theme', () => {
    const t = finaleTimeline(5, { duration: 29.5, drop: 7.5, lastHit: 23.5 })
    expect(t.highlights.length).toBe(5)
    expect(t.highlights.filter((x) => x < 7.5).length).toBe(2)
    expect(t.highlights[2]).toBe(7.5)
    expect(t.flashAt).toBe(7.5)
    expect(t.countAt).toBeCloseTo(19.3)
    expect(t.finaleAt).toBe(23.5)
    expect(t.themeOutAt! + t.themeOutFor).toBeLessThan(29.5)
    // Every highlight gets time to be read.
    const gaps = [...t.highlights, t.countAt].slice(1).map((x, i) => x - t.highlights[i])
    expect(Math.min(...gaps)).toBeGreaterThan(2.4)
  })

  it('runs at an even pace without a theme', () => {
    const t = finaleTimeline(3, null)
    expect(t.highlights).toEqual([1.3, 5.1, 8.9])
    expect(t.themeOutAt).toBeNull()
    expect(t.finaleAt).toBeCloseTo(16.9)
  })

  it('drops highlights that would be unreadable in a short theme', () => {
    const t = finaleTimeline(5, { duration: 16, drop: 3, lastHit: 12 })
    const gaps = [...t.highlights, t.countAt].slice(1).map((x, i) => x - t.highlights[i])
    expect(Math.min(...gaps)).toBeGreaterThan(2.39)
    expect(t.highlights.length).toBeLessThan(5)
  })
})
