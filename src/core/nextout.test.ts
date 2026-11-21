import { describe, expect, it } from 'vitest'
import { emptyLibrary, episodeIsOut, nextOutEpisodeFor, setEpisodes, withoutWaiting } from './library'
import { timeLeft } from './time'
import type { LibraryEntry, NextEpisode, TitleDetails } from './types'

const daryl = { key: 'tv:211684' as const, type: 'tv' as const, id: 211684, title: { name: 'The Walking Dead: Daryl Dixon', year: 2023, posterPath: null } }
const today = '2026-11-21'
const season = (number: number, episodeCount: number, airDate: string | null) => ({ number, name: '', episodeCount, airDate, posterPath: null })
const show = (seasons: ReturnType<typeof season>[], nextEpisode: NextEpisode | null = null) =>
  ({ key: daryl.key, type: 'tv', runtime: 50, seasons, nextEpisode }) as unknown as TitleDetails
const ticked = (keys: string[]): LibraryEntry => setEpisodes(emptyLibrary(), daryl, keys, true).entries[daryl.key]
const allOf = (s: number, n: number): string[] => Array.from({ length: n }, (_, i) => `S${s}E${i + 1}`)
const throughS3 = ticked([...allOf(1, 6), ...allOf(2, 6), ...allOf(3, 6)])
const three = [season(1, 6, '2023-09-10'), season(2, 6, '2024-09-29'), season(3, 6, '2025-09-07')]

describe('the next episode that is out', () => {
  it('skips a next season that starts later', () => {
    const d = show([...three, season(4, 6, '2027-06-01')])
    expect(episodeIsOut(d, today, 4, 1)).toBe(false)
    expect(nextOutEpisodeFor(throughS3, d, today)).toBeNull()
    expect(timeLeft(d, throughS3, today).episodes).toBe(0)
  })

  it('skips an announced season with no date yet', () => {
    const d = show([...three, season(4, 6, null)])
    expect(nextOutEpisodeFor(throughS3, d, today)).toBeNull()
    expect(timeLeft(d, throughS3, today).episodes).toBe(0)
  })

  it('skips the next episode while it has not aired', () => {
    const d = show([...three, season(4, 6, '2026-11-15')], { season: 4, episode: 2, name: '', airDate: '2026-11-22' })
    const s4e1 = ticked([...Object.keys(throughS3.episodes!), 'S4E1'])
    expect(nextOutEpisodeFor(throughS3, d, today)).toEqual({ season: 4, episode: 1 })
    expect(nextOutEpisodeFor(s4e1, d, today)).toBeNull()
    expect(nextOutEpisodeFor(s4e1, d, '2026-11-22')).toEqual({ season: 4, episode: 2 })
  })

  it('still counts an older season with a missing date as out', () => {
    const d = show([season(1, 6, null), season(2, 6, '2024-09-29')])
    expect(nextOutEpisodeFor(undefined, d, today)).toEqual({ season: 1, episode: 1 })
  })

  it('takes waiting shows off Home, keeping ones not loaded yet', () => {
    const waiting = show([...three, season(4, 6, null)])
    const other = { ...throughS3, key: 'tv:1' as const, id: 1 }
    const film = { ...throughS3, key: 'movie:2' as const, type: 'movie' as const, id: 2 }
    expect(withoutWaiting([throughS3, other, film], { [daryl.key]: waiting }, today)).toEqual([other, film])
    expect(withoutWaiting([throughS3], { [daryl.key]: show([...three, season(4, 6, '2026-11-01')]) }, today)).toEqual([throughS3])
  })
})
