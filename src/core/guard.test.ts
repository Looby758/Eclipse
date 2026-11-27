import { describe, expect, it } from 'vitest'
import { IDLE_MS, STALE_MS, computerName, decide, isPresenceFileName, parsePresence, presenceFileName, type Me, type Presence } from './guard'

const now = Date.parse('2026-11-26T20:00:00Z')
const ago = (ms: number): string => new Date(now - ms).toISOString()
const mac = (over: Partial<Presence> = {}): Presence => ({ computer: 'Loobys-MacBook-Air', platform: 'mac', session: 'm', since: ago(86_400_000), seen: ago(10_000), active: ago(10 * 60_000), saving: true, saves: 100, ...over })
const pc = (over: Partial<Me> = {}): Me => ({ computer: 'DESKTOP-4F2K9', session: 'p', active: now - 2_000, saving: false, saves: 100, ...over })

describe('the computer you’re using saves', () => {
  it('saves straight away when Eclipse is only open here', () => {
    expect(decide(pc(), [], now)).toEqual({ saving: true, other: null, waiting: null })
  })

  it('waits for the Mac to step back when you move to the PC, then saves', () => {
    // You're on the PC; the Mac's been left for ten minutes but is still saving.
    expect(decide(pc(), [mac()], now)).toMatchObject({ saving: false, waiting: 'catching-up' })
    // The Mac sees the PC was used more recently, and steps back.
    const macMe: Me = { computer: 'Loobys-MacBook-Air', session: 'm', active: now - 10 * 60_000, saving: true, saves: 100 }
    const pcThere: Presence = { computer: 'DESKTOP-4F2K9', platform: 'win', session: 'p', since: ago(60_000), seen: ago(3_000), active: ago(2_000), saving: false, saves: 100 }
    expect(decide(macMe, [pcThere], now)).toMatchObject({ saving: false, waiting: 'in-use' })
    // Now the PC saves.
    expect(decide(pc(), [mac({ saving: false })], now)).toEqual(expect.objectContaining({ saving: true, waiting: null }))
  })

  it('does not save until Drive has brought every save the Mac made', () => {
    expect(decide(pc({ saves: 98 }), [mac({ saving: false })], now)).toMatchObject({ saving: false, waiting: 'catching-up' })
    expect(decide(pc({ saves: 100 }), [mac({ saving: false })], now).saving).toBe(true)
  })

  it('keeps saving on the Mac while it’s being used, even if the PC was touched too', () => {
    const busyMac = mac({ active: ago(20_000) })
    expect(decide(pc(), [busyMac], now)).toMatchObject({ saving: false, waiting: 'in-use' })
    const macMe: Me = { computer: 'Loobys-MacBook-Air', session: 'm', active: now - 20_000, saving: true, saves: 100 }
    expect(decide(macMe, [{ ...busyMac, computer: 'DESKTOP-4F2K9', session: 'p', active: ago(2_000), saving: false }], now).saving).toBe(true)
  })

  it('does not hand saving back while you stay on the PC', () => {
    expect(decide(pc({ saving: true }), [mac({ saving: false })], now).saving).toBe(true)
  })

  it('ignores a Mac that’s asleep or offline (its file has gone stale)', () => {
    expect(decide(pc({ saves: 50 }), [mac({ seen: ago(STALE_MS + 1_000) })], now).saving).toBe(true)
  })

  it('carries on after the Mac quits, once its last saves have synced', () => {
    expect(decide(pc({ saves: 99 }), [mac({ closed: true, saving: false })], now)).toMatchObject({ saving: false, waiting: 'catching-up' })
    expect(decide(pc({ saves: 100 }), [mac({ closed: true, saving: false })], now).saving).toBe(true)
  })

  it('Take over saves here now, and the Mac steps back when it sees it', () => {
    expect(decide(pc({ saves: 90, forced: true }), [mac({ active: ago(5_000) })], now).saving).toBe(true)
    const macMe: Me = { computer: 'Loobys-MacBook-Air', session: 'm', active: now - 5_000, saving: true, saves: 100 }
    const pcSaving: Presence = { computer: 'DESKTOP-4F2K9', platform: 'win', session: 'p', since: ago(60_000), seen: ago(1_000), active: ago(1_000), saving: true, saves: 90 }
    expect(decide(macMe, [pcSaving], now).saving).toBe(false)
  })

  it('settles on one when both start saving at once', () => {
    const a: Me = { computer: 'A', session: 'a', active: now - 1_000, saving: true, saves: 5 }
    const b: Presence = { computer: 'B', platform: 'win', session: 'b', since: ago(1_000), seen: ago(1_000), active: ago(30_000), saving: true, saves: 5 }
    expect(decide(a, [b], now).saving).toBe(true)
    expect(decide({ computer: 'B', session: 'b', active: now - 30_000, saving: true, saves: 5 }, [{ ...b, computer: 'A', session: 'a', active: ago(1_000) }], now).saving).toBe(false)
  })

  it('needs a minute without use before handing over, so using both at once doesn’t flip back and forth', () => {
    const macMe: Me = { computer: 'Loobys-MacBook-Air', session: 'm', active: now - (IDLE_MS - 5_000), saving: true, saves: 100 }
    const pcThere: Presence = { computer: 'DESKTOP-4F2K9', platform: 'win', session: 'p', since: ago(60_000), seen: ago(3_000), active: ago(1_000), saving: false, saves: 100 }
    expect(decide(macMe, [pcThere], now).saving).toBe(true)
    expect(decide({ ...macMe, active: now - IDLE_MS }, [pcThere], now).saving).toBe(false)
  })

  it('ignores a file from this same computer (left from an earlier run)', () => {
    expect(decide(pc(), [mac({ computer: 'DESKTOP-4F2K9', active: ago(0) })], now).saving).toBe(true)
  })
})

describe('presence files', () => {
  it('names each computer its own file, and leaves Drive conflict copies alone', () => {
    expect(presenceFileName('DESKTOP-4F2K9')).toBe('eclipse-open-desktop-4f2k9.json')
    expect(isPresenceFileName('eclipse-open-desktop-4f2k9.json')).toBe(true)
    expect(isPresenceFileName('eclipse-open-desktop-4f2k9 (1).json')).toBe(false)
    expect(isPresenceFileName('eclipse-open.json')).toBe(false)
  })

  it('reads presence files, and nothing else', () => {
    expect(parsePresence(JSON.stringify(mac()))).toEqual(mac())
    expect(parsePresence(JSON.stringify({ ...mac(), platform: 'amiga', saves: -3 }))).toMatchObject({ platform: 'linux', saves: 0 })
    expect(parsePresence(JSON.stringify({ ...mac(), closed: true }))?.closed).toBe(true)
    expect(parsePresence('{"computer":')).toBeNull()
    expect(parsePresence('{"hello":1}')).toBeNull()
    expect(parsePresence(null)).toBeNull()
  })

  it('tidies the computer name', () => {
    expect(computerName('Loobys-MacBook-Air.local')).toBe('Loobys-MacBook-Air')
  })
})
