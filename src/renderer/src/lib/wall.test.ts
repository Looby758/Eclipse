import { describe, expect, it } from 'vitest'
import { OWN_ENOUGH, wallPosters } from './wall'

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
})
