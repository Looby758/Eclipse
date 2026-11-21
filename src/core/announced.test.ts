import { describe, expect, it } from 'vitest'
import { announcedSeasons, markAnnouncedSeen, seasonComing } from './announced'
import { emptyLibrary, normalizeLibrary, setEpisodes, setStatus } from './library'
import type { Library, NextEpisode, TitleDetails } from './types'

const owl = { key: 'tv:206586' as const, type: 'tv' as const, id: 206586, title: { name: 'The Ones Who Live', year: 2024, posterPath: null } }
const today = '2026-11-21'
const season = (number: number, episodeCount: number, airDate: string | null) => ({ number, name: '', episodeCount, airDate, posterPath: null })
const show = (seasons: ReturnType<typeof season>[], status = 'Returning Series', nextEpisode: NextEpisode | null = null) =>
  ({ key: owl.key, type: 'tv', name: 'The Ones Who Live', posterPath: null, runtime: 50, status, seasons, nextEpisode }) as unknown as TitleDetails
const s1 = season(1, 6, '2024-02-25')
const finished = (): Library => setEpisodes(emptyLibrary(), owl, ['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5', 'S1E6'], true)

describe('new season announced', () => {
  it('says so for a show you finished, with or without a date', () => {
    expect(announcedSeasons(finished(), { [owl.key]: show([s1, season(2, 0, null)]) }, today)).toMatchObject([{ id: 'tv:206586@S2', season: 2, date: null }])
    expect(announcedSeasons(finished(), { [owl.key]: show([s1, season(2, 6, '2027-03-01')]) }, today)).toMatchObject([{ season: 2, date: '2027-03-01' }])
  })

  it('counts a show marked Watched without ticks', () => {
    const lib = setStatus(emptyLibrary(), owl, 'watched')
    expect(announcedSeasons(lib, { [owl.key]: show([s1, season(2, 0, null)]) }, today)).toHaveLength(1)
  })

  it('finds a season TMDB only knows as the next episode', () => {
    expect(seasonComing(show([s1], 'Returning Series', { season: 2, episode: 1, name: '', airDate: '2027-01-10' }), today)).toEqual({ season: 2, date: '2027-01-10' })
  })

  it('stays quiet when nothing new is coming, the season is out, or you are behind', () => {
    expect(announcedSeasons(finished(), { [owl.key]: show([s1]) }, today)).toEqual([])
    expect(announcedSeasons(finished(), { [owl.key]: show([s1, season(2, 6, '2026-11-01')]) }, today)).toEqual([])
    const behind = setEpisodes(emptyLibrary(), owl, ['S1E1'], true)
    expect(announcedSeasons(behind, { [owl.key]: show([s1, season(2, 0, null)]) }, today)).toEqual([])
  })

  it('drops a show cancelled after the announcement', () => {
    expect(announcedSeasons(finished(), { [owl.key]: show([s1, season(2, 0, null)], 'Canceled') }, today)).toEqual([])
    expect(announcedSeasons(finished(), { [owl.key]: show([s1, season(2, 0, null)], 'Ended') }, today)).toEqual([])
  })

  it('leaves out stopped shows', () => {
    const lib = setStatus(finished(), owl, 'stopped')
    expect(announcedSeasons(lib, { [owl.key]: show([s1, season(2, 0, null)]) }, today)).toEqual([])
  })

  it('shows each season once after Got it, and keeps that through a save', () => {
    const d = { [owl.key]: show([s1, season(2, 0, null)]) }
    const seen = markAnnouncedSeen(finished(), 'tv:206586@S2')
    expect(announcedSeasons(seen, d, today)).toEqual([])
    expect(normalizeLibrary(JSON.parse(JSON.stringify(seen))).announcedSeen).toEqual(['tv:206586@S2'])
    expect(markAnnouncedSeen(finished(), 'nonsense').announcedSeen).toBeUndefined()
    // Once you've caught up on season 2, season 3 is news of its own.
    const s2 = setEpisodes(seen, owl, ['S2E1', 'S2E2', 'S2E3', 'S2E4', 'S2E5', 'S2E6'], true)
    expect(announcedSeasons(s2, { [owl.key]: show([s1, season(2, 6, '2025-01-01'), season(3, 0, null)]) }, today)).toMatchObject([{ id: 'tv:206586@S3' }])
  })
})
