import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'
import { ago } from './HealthCard'

// The Chrome extension's popup can't import from the app, so it keeps its own copy.
const { ago: popupAgo } = createRequire(import.meta.url)('../../../../extension/ago.js') as { ago: typeof ago }

const now = Date.UTC(2026, 10, 22, 13, 0)
const before = (mins: number): number => now - mins * 60_000

describe('ago', () => {
  for (const [name, fn] of [['app', ago], ['extension popup', popupAgo]] as const) {
    it(`picks a sensible unit (${name})`, () => {
      expect(fn(before(0.2), now)).toBe('just now')
      expect(fn(before(1), now)).toBe('1 minute ago')
      expect(fn(before(14), now)).toBe('14 minutes ago')
      expect(fn(before(59), now)).toBe('59 minutes ago')
      expect(fn(before(60), now)).toBe('1 hour ago')
      expect(fn(before(5 * 60 + 10), now)).toBe('5 hours ago')
      expect(fn(before(23 * 60), now)).toBe('23 hours ago')
      expect(fn(before(24 * 60), now)).toBe('1 day ago')
      expect(fn(before(2185), now)).toBe('1 day ago') // the 36 hours that used to read "2185 min ago"
      expect(fn(before(3 * 24 * 60 + 60), now)).toBe('3 days ago')
      expect(fn(now + 5000, now)).toBe('just now') // a clock a little ahead
    })
  }
})
