import { describe, expect, it } from 'vitest'
import { OWN_ENOUGH, RECS_ON_WALL, wallPosters } from './wall'

const range = (n: number, p: string): string[] => Array.from({ length: n }, (_, i) => `/${p}${i}.jpg`)

describe('poster wall', () => {
  it('is empty only when there is nothing at all', () => {
    expect(wallPosters([], [])).toEqual([])
  })
  it('fills an empty library with trending posters', () => {
    const wall = wallPosters([], range(40, 't'), 56)
    expect(wall).toHaveLength(56)
    expect(wall.every((p) => p.startsWith('/t'))).toBe(true)
  })
  it('puts your posters first and tops up with trending', () => {
    const wall = wallPosters(['/mine.jpg'], ['/mine.jpg', ...range(40, 't')], 56)
    expect(wall[0]).toBe('/mine.jpg')
    expect(new Set(wall).size).toBe(OWN_ENOUGH)
  })
  it('drops trending once your library is big enough', () => {
    const wall = wallPosters(range(30, 'm'), range(40, 't'), 56)
    expect(wall.some((p) => p.startsWith('/t'))).toBe(false)
  })
  it('mixes in one recommendation after every two of yours', () => {
    const wall = wallPosters(range(30, 'm'), [], 9, range(10, 'r'))
    expect(wall).toEqual(['/m0.jpg', '/m1.jpg', '/r0.jpg', '/m2.jpg', '/m3.jpg', '/r1.jpg', '/m4.jpg', '/m5.jpg', '/r2.jpg'])
  })
  it('never shows a recommendation you already have, and caps how many go on', () => {
    const wall = wallPosters(['/m0.jpg'], [], 200, ['/m0.jpg', ...range(40, 'r')])
    expect(wall.filter((p) => p === '/m0.jpg').length).toBeGreaterThan(0)
    expect(new Set(wall.filter((p) => p.startsWith('/r'))).size).toBe(RECS_ON_WALL)
  })
  it('counts recommendations toward a full wall, so trending drops off sooner', () => {
    const wall = wallPosters(range(10, 'm'), range(40, 't'), 56, range(16, 'r'))
    expect(wall.some((p) => p.startsWith('/t'))).toBe(false)
  })
  it('fills the wall with recommendations when the library is empty', () => {
    const wall = wallPosters([], range(40, 't'), 56, range(5, 'r'))
    expect(wall[0]).toBe('/r0.jpg')
    expect(new Set(wall).size).toBe(OWN_ENOUGH)
  })
})
