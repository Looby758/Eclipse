import { describe, expect, it } from 'vitest'
import { emptyLibrary, normalizeLibrary, recommenders, setFrom, setStatus } from './library'
import { listIdFor, sourceOf } from './lists'

const t = (id: number, name: string) => ({ key: `movie:${id}` as const, type: 'movie' as const, id, title: { name, year: 2020, posterPath: null } })

describe('who recommended it', () => {
  it('notes who recommended it, and gathers them up', () => {
    let lib = setStatus(setStatus(setStatus(emptyLibrary(), t(1, 'A'), 'want'), t(2, 'B'), 'watched'), t(3, 'C'), 'want')
    lib = setFrom(lib, 'movie:1', '  Sam ')
    lib = setFrom(lib, 'movie:2', 'sam')
    lib = setFrom(lib, 'movie:3', 'a podcast')
    expect(lib.entries['movie:1'].from).toBe('Sam')
    expect(recommenders(lib)).toEqual([
      { name: 'Sam', count: 2 },
      { name: 'a podcast', count: 1 }
    ])
    expect(setFrom(lib, 'movie:3', '').entries['movie:3'].from).toBeUndefined()
    expect(setFrom(lib, 'movie:1', 'Sam')).toBe(lib)
  })

  it('makes a list id for each, with any name', () => {
    const id = listIdFor({ kind: 'from', name: 'Sam & Jo / the pub' })
    expect(sourceOf(id)).toEqual({ kind: 'from', name: 'Sam & Jo / the pub' })
  })

  it('keeps it in the file', () => {
    const lib = normalizeLibrary({ version: 1, entries: { 'movie:1': { ...t(1, 'A'), status: 'want', addedAt: '', updatedAt: '', from: '  Sam  ' } } })
    expect(lib.entries['movie:1'].from).toBe('Sam')
  })
})
