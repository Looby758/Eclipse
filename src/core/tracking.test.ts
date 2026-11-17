import { describe, expect, it } from 'vitest'
import { emptyLibrary, nextEpisodeFor, normalizeLibrary, preferencesOf, setEpisodes, setNote, setPreferences, setStatus, setWatchedOn, showProgress } from './library'

const andor = { key: 'tv:83867' as const, type: 'tv' as const, id: 83867, title: { name: 'Andor', year: 2022, posterPath: null } }
const seasons = [
  { number: 0, episodeCount: 3 },
  { number: 1, episodeCount: 12 },
  { number: 2, episodeCount: 12 }
]
const day = (d: string): Date => new Date(`${d}T20:00:00`)

describe('episode ticking', () => {
  it('adds the show as Watching and records the date', () => {
    const lib = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, day('2026-11-10'))
    expect(lib.entries[andor.key]).toMatchObject({ status: 'watching', episodes: { S1E1: '2026-11-10' } })
  })

  it('keeps the first date when ticked again, and unticks', () => {
    let lib = setEpisodes(emptyLibrary(), andor, ['S1E1'], true, day('2026-11-10'))
    lib = setEpisodes(lib, andor, ['S1E1', 'S1E2'], true, day('2026-11-11'))
    expect(lib.entries[andor.key].episodes).toEqual({ S1E1: '2026-11-10', S1E2: '2026-11-11' })
    lib = setEpisodes(lib, andor, ['S1E1', 'S1E2'], false)
    expect(lib.entries[andor.key].episodes).toBeUndefined()
  })

  it('moves Want to watch and Stopped to Watching, but leaves Watched alone', () => {
    const want = setStatus(emptyLibrary(), andor, 'want')
    expect(setEpisodes(want, andor, ['S1E1'], true).entries[andor.key].status).toBe('watching')
    const done = setStatus(emptyLibrary(), andor, 'watched')
    expect(setEpisodes(done, andor, ['S1E1'], true).entries[andor.key].status).toBe('watched')
  })

  it('ignores unticking a show that is not in the library, and bad keys', () => {
    expect(setEpisodes(emptyLibrary(), andor, ['S1E1'], false)).toEqual(emptyLibrary())
    expect(setEpisodes(emptyLibrary(), andor, ['nonsense'], true).entries[andor.key].episodes).toBeUndefined()
  })

  it('works out progress and the next episode, ignoring specials', () => {
    let lib = setEpisodes(emptyLibrary(), andor, ['S0E1', 'S1E1', 'S1E2'], true)
    const entry = lib.entries[andor.key]
    expect(showProgress(entry, seasons)).toEqual({ watched: 2, total: 24 })
    expect(nextEpisodeFor(entry, seasons)).toEqual({ season: 1, episode: 3 })
    lib = setEpisodes(lib, andor, ['S1E12'], true)
    expect(nextEpisodeFor(lib.entries[andor.key], seasons)).toEqual({ season: 2, episode: 1 })
    expect(nextEpisodeFor(undefined, seasons)).toEqual({ season: 1, episode: 1 })
    lib = setEpisodes(lib, andor, ['S2E12'], true)
    expect(nextEpisodeFor(lib.entries[andor.key], seasons)).toBeNull()
  })
})

describe('notes, dates and preferences', () => {
  it('sets and clears a one-line note', () => {
    let lib = setStatus(emptyLibrary(), andor, 'watched')
    lib = setNote(lib, andor.key, '  watched with Dad\n at Christmas ')
    expect(lib.entries[andor.key].note).toBe('watched with Dad at Christmas')
    expect(setNote(lib, andor.key, '   ').entries[andor.key].note).toBeUndefined()
    expect(setNote(emptyLibrary(), andor.key, 'x')).toEqual(emptyLibrary())
  })

  it('sets and clears the watch date, refusing nonsense', () => {
    let lib = setStatus(emptyLibrary(), andor, 'watched', day('2026-11-10'))
    lib = setWatchedOn(lib, andor.key, '2025-12-25')
    expect(lib.entries[andor.key].watchedOn).toBe('2025-12-25')
    expect(setWatchedOn(lib, andor.key, 'Christmas')).toBe(lib)
    expect(setWatchedOn(lib, andor.key, null).entries[andor.key].watchedOn).toBeUndefined()
  })

  it('keeps preferences tidy', () => {
    expect(preferencesOf(emptyLibrary())).toMatchObject({ region: 'GB', services: [], bedtime: '23:00', watchDays: [1, 2, 3, 4, 5] })
    const lib = setPreferences(emptyLibrary(), { services: [337, 39, 337] })
    expect(preferencesOf(lib)).toMatchObject({ region: 'GB', services: [337, 39] })
  })

  it('reads the new fields back from the file, dropping broken ones', () => {
    const lib = normalizeLibrary({
      preferences: { region: 'gb!', services: [337, 'x'] },
      entries: { 'tv:1': { status: 'watching', note: ' hi ', rating: 8, episodes: { S1E1: '2026-01-01', S1E2: 'yesterday', bad: '2026-01-01' } } }
    })
    expect(lib.preferences).toMatchObject({ region: 'GB', services: [337], startTime: '20:00' })
    expect(lib.entries['tv:1']).toMatchObject({ note: 'hi', rating: 8, episodes: { S1E1: '2026-01-01' } })
  })
})

describe('your week in preferences (phase 35)', () => {
  it('builds a week from an older library, and keeps the usual evening in step', () => {
    const old = normalizeLibrary({ version: 1, entries: {}, preferences: { startTime: '19:30', bedtime: '22:30', watchDays: [5, 6] } })
    const p = preferencesOf(old)
    expect(p.schedule[5]).toEqual([{ start: '19:30', end: '22:30' }])
    expect(p.schedule[1]).toEqual([])
    const sat = setPreferences(old, { schedule: p.schedule.map((s, d) => (d === 6 ? [{ start: '20:00', end: '00:30' }, { start: '14:00', end: '17:00' }] : d === 0 ? [{ start: '19:30', end: '22:30' }] : s)) })
    const q = preferencesOf(sat)
    expect(q.schedule[6]).toEqual([{ start: '14:00', end: '17:00' }, { start: '20:00', end: '00:30' }])
    expect(q.watchDays).toEqual([0, 5, 6])
    expect(q).toMatchObject({ startTime: '19:30', bedtime: '22:30', gapMinutes: 0, windDownMinutes: 0, weeklyBudgetMinutes: 0 })
  })
  it('rebuilds the week when an older copy changes the usual evening', () => {
    const lib = setPreferences(emptyLibrary(), { bedtime: '23:30' })
    expect(preferencesOf(lib).schedule[2]).toEqual([{ start: '20:00', end: '23:30' }])
  })
  it('keeps a sensible "just tonight"', () => {
    expect(preferencesOf(setPreferences(emptyLibrary(), { justTonight: { day: '2026-11-17', off: true, start: '21:00' } })).justTonight).toEqual({ day: '2026-11-17', off: true })
    expect(preferencesOf(setPreferences(emptyLibrary(), { justTonight: { day: 'soon' } as never })).justTonight).toBeUndefined()
  })
})
