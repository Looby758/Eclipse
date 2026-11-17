import { describe, expect, it } from 'vitest'
import { countByStatus, emptyLibrary, entriesWith, localDate, normalizeLibrary, setStatus } from './library'

const dune = { key: 'movie:438631' as const, type: 'movie' as const, id: 438631, title: { name: 'Dune', year: 2021, posterPath: '/d.jpg' } }
const andor = { key: 'tv:83867' as const, type: 'tv' as const, id: 83867, title: { name: 'Andor', year: 2022, posterPath: null } }

describe('library', () => {
  it('adds, changes and removes titles without touching the original', () => {
    const empty = emptyLibrary()
    const a = setStatus(empty, dune, 'want', new Date('2026-01-01T10:00:00Z'))
    expect(empty.entries).toEqual({})
    expect(a.entries['movie:438631']).toMatchObject({ status: 'want', addedAt: '2026-01-01T10:00:00.000Z' })
    const b = setStatus(a, dune, 'stopped', new Date('2026-01-02T10:00:00Z'))
    expect(b.entries['movie:438631']).toMatchObject({ status: 'stopped', addedAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-02T10:00:00.000Z' })
    expect(setStatus(b, dune, null).entries).toEqual({})
  })

  it('records the day something was watched, once', () => {
    const first = setStatus(emptyLibrary(), dune, 'watched', new Date(2026, 4, 3, 23, 30))
    expect(first.entries[dune.key].watchedOn).toBe('2026-05-03')
    const again = setStatus(setStatus(first, dune, 'want'), dune, 'watched', new Date(2026, 6, 1))
    expect(again.entries[dune.key].watchedOn).toBe('2026-05-03')
  })

  it('lists and counts by status, newest first', () => {
    let lib = setStatus(emptyLibrary(), dune, 'want', new Date('2026-01-01'))
    lib = setStatus(lib, andor, 'want', new Date('2026-01-02'))
    expect(entriesWith(lib, 'want').map((e) => e.title.name)).toEqual(['Andor', 'Dune'])
    expect(entriesWith(lib, 'want', 'movie').map((e) => e.title.name)).toEqual(['Dune'])
    expect(countByStatus(lib)).toEqual({ want: 2, watching: 0, watched: 0, stopped: 0 })
  })

  it('opens a damaged or hand-edited file without failing', () => {
    expect(normalizeLibrary(null)).toEqual(emptyLibrary())
    expect(normalizeLibrary('nonsense')).toEqual(emptyLibrary())
    const lib = normalizeLibrary({
      entries: {
        'movie:1': { status: 'watched', watchedOn: '2025-12-25', title: { name: 'Elf' } },
        'movie:2': { status: 'loved' },
        'book:3': { status: 'want' },
        'tv:4': { status: 'watching', watchedOn: 'yesterday' }
      }
    })
    expect(Object.keys(lib.entries)).toEqual(['movie:1', 'tv:4'])
    expect(lib.entries['movie:1']).toMatchObject({ type: 'movie', id: 1, watchedOn: '2025-12-25', title: { name: 'Elf', year: null } })
    expect(lib.entries['tv:4'].watchedOn).toBeUndefined()
  })

  it('uses the local date', () => {
    expect(localDate(new Date(2026, 0, 9))).toBe('2026-01-09')
  })
})
