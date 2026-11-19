import { describe, expect, it } from 'vitest'
import { OPENING, flightsFor, shouldPlayOpening } from './opening'

const view = { width: 1200, height: 800 }
const box = (cx: number, cy: number) => ({ left: cx - 50, top: cy - 75, width: 100, height: 150 })

describe('the opening', () => {
  it('flies each poster from the middle of the window to its place', () => {
    const [f] = flightsFor([box(100, 100)], view)
    expect(f).not.toBeNull()
    expect(f!.x).toBe(500)
    expect(f!.y).toBe(300)
  })

  it('lands the middle posters first and the corners last', () => {
    const [middle, corner] = flightsFor([box(600, 400), box(30, 30)], view)
    expect(middle!.delay).toBeLessThan(80)
    expect(corner!.delay).toBeGreaterThan(OPENING.spread - 80)
    expect(corner!.delay).toBeGreaterThan(middle!.delay)
  })

  it('leaves posters outside the window alone', () => {
    expect(flightsFor([box(-200, 400), box(600, 1100), box(1400, 400)], view)).toEqual([null, null, null])
  })

  it('is the same every launch', () => {
    const tiles = [box(200, 200), box(900, 600), box(600, 100)]
    expect(flightsFor(tiles, view)).toEqual(flightsFor(tiles, view))
  })

  it('plays only on a fresh launch with movement allowed and nothing to set up', () => {
    const base = { fresh: true, still: false, reduceMotion: false, setup: false }
    expect(shouldPlayOpening(base)).toBe(true)
    expect(shouldPlayOpening({ ...base, fresh: false })).toBe(false)
    expect(shouldPlayOpening({ ...base, still: true })).toBe(false)
    expect(shouldPlayOpening({ ...base, reduceMotion: true })).toBe(false)
    expect(shouldPlayOpening({ ...base, setup: true })).toBe(false)
  })
})
