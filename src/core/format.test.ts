import { describe, expect, it } from 'vitest'
import { sinceLabel } from './format'

describe('"Last watched …" in Library', () => {
  it('says it in days, then weeks, then months', () => {
    expect(sinceLabel(0)).toBe('today')
    expect(sinceLabel(1)).toBe('yesterday')
    expect(sinceLabel(4)).toBe('4 days ago')
    expect(sinceLabel(20)).toBe('3 weeks ago')
    expect(sinceLabel(75)).toBe('3 months ago')
    expect(sinceLabel(400)).toBe('over a year ago')
    expect(sinceLabel(800)).toBe('2 years ago')
  })
})
