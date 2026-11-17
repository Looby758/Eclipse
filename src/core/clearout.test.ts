import { describe, expect, it } from 'vitest'
import { clearOutOrder, dropTitle, emptyLibrary, normalizeLibrary, restoreDropped, setNote, setStatus } from './library'
import { setWatchSoon } from './watchsoon'

const t = (id: number) => ({ key: `movie:${id}` as const, type: 'movie' as const, id, title: { name: `Film ${id}`, year: 2020, posterPath: null } })

describe('clearing out the watchlist', () => {
  it('drops a title whole, and puts it back as it was', () => {
    let lib = setStatus(emptyLibrary(), t(1), 'want', new Date('2025-01-01T00:00:00Z'))
    lib = setNote(lib, 'movie:1', 'Sam says it’s great')
    lib = setWatchSoon(lib, { key: 'movie:1', type: 'movie', id: 1, name: 'Film 1', year: 2020, posterPath: null }, true)
    const before = lib.entries['movie:1']
    const dropped = dropTitle(lib, 'movie:1', new Date('2026-11-17T20:00:00Z'))
    expect(dropped.entries['movie:1']).toBeUndefined()
    expect(dropped.watchSoon).toEqual([])
    expect(dropped.dropped).toEqual([{ entry: before, droppedAt: '2026-11-17T20:00:00.000Z', soon: true }])
    const back = restoreDropped(dropped, 'movie:1')
    expect(back.entries['movie:1']).toEqual(before)
    expect(back.watchSoon?.map((r) => r.key)).toEqual(['movie:1'])
    expect(back.dropped).toBeUndefined()
  })

  it('keeps the last 30, newest first', () => {
    let lib = emptyLibrary()
    for (let i = 1; i <= 32; i++) lib = dropTitle(setStatus(lib, t(i), 'want'), `movie:${i}`)
    expect(lib.dropped).toHaveLength(30)
    expect(lib.dropped?.[0].entry.key).toBe('movie:32')
  })

  it('orders the watchlist to go through', () => {
    let lib = emptyLibrary()
    lib = setStatus(lib, t(1), 'want', new Date('2024-01-01T00:00:00Z'))
    lib = setStatus(lib, t(2), 'want', new Date('2023-01-01T00:00:00Z'))
    lib = setStatus(lib, t(3), 'want', new Date('2025-01-01T00:00:00Z'))
    lib = setStatus(lib, t(4), 'watched', new Date('2022-01-01T00:00:00Z'))
    const keys = (o: 'oldest' | 'newest' | 'notMine') => clearOutOrder(lib, o, (k) => k === 'movie:2').map((e) => e.key)
    expect(keys('oldest')).toEqual(['movie:2', 'movie:1', 'movie:3'])
    expect(keys('newest')).toEqual(['movie:3', 'movie:1', 'movie:2'])
    expect(keys('notMine')).toEqual(['movie:1', 'movie:3', 'movie:2'])
  })

  it('reads recently dropped from the file', () => {
    const lib = dropTitle(setStatus(emptyLibrary(), t(1), 'want'), 'movie:1')
    const again = normalizeLibrary(JSON.parse(JSON.stringify({ ...lib, dropped: [...(lib.dropped ?? []), { nonsense: true }] })))
    expect(again.dropped).toEqual(lib.dropped)
  })
})
