import { describe, expect, it } from 'vitest'
import { computerName, judge, parseMarker, type Marker } from './guard'

const me = { computer: 'Loobys-MacBook-Air', session: 'b' }
const now = new Date('2026-11-17T20:00:00Z')
const marker = (over: Partial<Marker>): Marker => ({ computer: 'DESKTOP-4F2K9', platform: 'win', session: 'a', since: '2026-11-17T19:00:00Z', seen: '2026-11-17T19:59:30Z', ...over })

describe('two-computer guard', () => {
  it('is free with no marker, and mine with my own', () => {
    expect(judge(null, me, now)).toBe('free')
    expect(judge(marker({ computer: me.computer, session: 'b' }), me, now)).toBe('mine')
  })

  it('steps back while another computer has it open', () => {
    expect(judge(marker({}), me, now)).toBe('other')
  })

  it('ignores a marker left behind: stale, or from an earlier run on this computer', () => {
    expect(judge(marker({ seen: '2026-11-17T19:54:00Z' }), me, now)).toBe('free')
    expect(judge(marker({ seen: 'nonsense' }), me, now)).toBe('free')
    expect(judge(marker({ computer: me.computer }), me, now)).toBe('free')
  })

  it('reads marker files, and nothing else', () => {
    expect(parseMarker(JSON.stringify(marker({})))).toEqual(marker({}))
    expect(parseMarker(JSON.stringify({ ...marker({}), platform: 'amiga' }))?.platform).toBe('linux')
    expect(parseMarker('{"computer":')).toBeNull()
    expect(parseMarker('{"hello":1}')).toBeNull()
    expect(parseMarker(null)).toBeNull()
  })

  it('names the computer simply', () => {
    expect(computerName('Loobys-MacBook-Air.local')).toBe('Loobys-MacBook-Air')
    expect(computerName('DESKTOP-4F2K9')).toBe('DESKTOP-4F2K9')
  })
})
