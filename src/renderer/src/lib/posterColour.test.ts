import { describe, expect, it } from 'vitest'
import { DEFAULT_GLOW, glowFrom } from './posterColour'

describe('poster glow', () => {
  it('keeps cool colours and makes them vivid', () => {
    expect(glowFrom({ h: 210, s: 40, l: 30 })).toEqual({ h: 210, s: 90, l: 62 })
    expect(glowFrom({ h: 330, s: 60, l: 50 }).h).toBe(330)
  })
  it('never glows brown, orange or dark green', () => {
    expect(glowFrom({ h: 30, s: 50, l: 25 }).h).toBe(340)
    expect(glowFrom({ h: 110, s: 50, l: 25 }).h).toBe(175)
  })
  it('falls back to violet for grey posters', () => {
    expect(glowFrom({ h: 0, s: 5, l: 40 })).toEqual(DEFAULT_GLOW)
  })
})
