import { describe, expect, it } from 'vitest'
import { emptyLibrary, setEpisodes, setNote, setStatus, startRewatch } from './library'
import { backupsToDrop, describeChange, librarySummary, removeQuestion } from './safety'

const show = { key: 'tv:1396' as const, type: 'tv' as const, id: 1396, title: { name: 'Breaking Bad', year: 2008, posterPath: null } }
const film = { key: 'movie:1' as const, type: 'movie' as const, id: 1, title: { name: 'Dune', year: 2021, posterPath: null } }
const now = new Date('2026-11-17T20:00:00Z')

describe('asking before removing', () => {
  it('says nothing for a plain watchlist title', () => {
    const lib = setStatus(emptyLibrary(), film, 'want', now)
    expect(removeQuestion(lib.entries['movie:1'])).toBeNull()
  })

  it('names the episodes, rewatches and note it would forget', () => {
    let lib = setEpisodes(emptyLibrary(), show, ['S1E1', 'S1E2', 'S1E3'], true, now)
    lib = setNote(lib, 'tv:1396', 'with Dad')
    lib = startRewatch(lib, show, now)
    expect(removeQuestion(lib.entries['tv:1396'])).toEqual({
      title: 'Remove Breaking Bad?',
      detail: 'This forgets 3 watched episodes, 1 rewatch and your note.'
    })
  })

  it('mentions a watched film', () => {
    const lib = setStatus(emptyLibrary(), film, 'watched', now)
    expect(removeQuestion(lib.entries['movie:1'])?.detail).toBe('This forgets the day you watched it (2026-11-17).')
  })
})

describe('naming a change for Undo', () => {
  it('describes removing, adding, ticking and moving', () => {
    const empty = emptyLibrary()
    const added = setStatus(empty, show, 'want', now)
    expect(describeChange(empty, added)).toBe('Added Breaking Bad to Want to watch')
    const ticked = setEpisodes(added, show, ['S1E1', 'S1E2'], true, now)
    expect(describeChange(added, ticked)).toBe('Ticked 2 episodes of Breaking Bad')
    expect(describeChange(ticked, setEpisodes(ticked, show, ['S1E2'], false, now))).toBe('Unticked 1 episode of Breaking Bad')
    expect(describeChange(ticked, setStatus(ticked, show, 'stopped', now))).toBe('Breaking Bad: Stopped')
    expect(describeChange(ticked, setStatus(ticked, show, null))).toBe('Removed Breaking Bad')
    expect(describeChange(ticked, ticked)).toBeNull()
  })
})

describe('daily backups', () => {
  it('keeps the last 14 days and the first of each month before that', () => {
    const days = ['2026-09-03', '2026-09-20', '2026-10-01', '2026-10-15', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-17']
    expect(backupsToDrop(days, '2026-11-17')).toEqual(['2026-09-20', '2026-10-15'])
  })

  it('sums up a library', () => {
    const lib = setStatus(setEpisodes(emptyLibrary(), show, ['S1E1', 'S1E2'], true, now), film, 'watched', now)
    expect(librarySummary(lib)).toEqual({ titles: 2, episodes: 2, watched: 1 })
  })
})
