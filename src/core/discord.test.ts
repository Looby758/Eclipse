import { describe, expect, it } from 'vitest'
import { activityFor, decodeFrames, encodeFrame, ipcPaths, needsSending, validAppId } from './discord'
import type { Recognised } from './watching'

const playing = (over: Partial<Recognised> = {}): Recognised => ({
  key: 'tv:1402',
  name: 'The Walking Dead',
  type: 'tv',
  season: 9,
  episode: 4,
  sure: true,
  service: 'Disney+',
  position: 600,
  duration: 2700,
  playing: true,
  ...over
})

describe('activityFor', () => {
  const now = 1_700_000_000_000
  it('says what is playing, with the episode and the time left', () => {
    const a = activityFor(playing(), '/poster.jpg', now)!
    expect(a.type).toBe(3)
    expect(a.details).toBe('The Walking Dead · S9 E4')
    expect(a.state).toBe('on Disney+')
    expect(a.timestamps).toEqual({ start: now - 600_000, end: now - 600_000 + 2_700_000 })
    expect(a.assets).toEqual({ large_image: 'https://image.tmdb.org/t/p/w342/poster.jpg', large_text: 'The Walking Dead' })
  })
  it('never names a guessed episode', () => {
    expect(activityFor(playing({ sure: false }), null, now)!.details).toBe('The Walking Dead')
  })
  it('films have no episode', () => {
    expect(activityFor(playing({ type: 'movie', name: 'Dune', season: null, episode: null, service: null }), null, now)).toMatchObject({ details: 'Dune' })
  })
  it('paused: says so, without a clock', () => {
    const a = activityFor(playing({ playing: false }), null, now)!
    expect(a.state).toBe('Paused · on Disney+')
    expect(a.timestamps).toBeUndefined()
  })
  it('nothing playing, nothing shown', () => {
    expect(activityFor(null, null)).toBeNull()
  })
  it('only a start time when the length is unknown', () => {
    expect(activityFor(playing({ duration: null }), null, now)!.timestamps).toEqual({ start: now - 600_000 })
  })
})

describe('needsSending', () => {
  const a = activityFor(playing(), null, 1_000_000_000)
  it('not again while the clock runs on as expected', () => {
    expect(needsSending(a, activityFor(playing({ position: 605 }), null, 1_000_005_000))).toBe(false)
  })
  it('again after skipping ahead, a new episode, pausing or stopping', () => {
    expect(needsSending(a, activityFor(playing({ position: 900 }), null, 1_000_005_000))).toBe(true)
    expect(needsSending(a, activityFor(playing({ episode: 5 }), null, 1_000_000_000))).toBe(true)
    expect(needsSending(a, activityFor(playing({ playing: false }), null, 1_000_000_000))).toBe(true)
    expect(needsSending(a, null)).toBe(true)
    expect(needsSending(null, null)).toBe(false)
  })
})

describe('frames', () => {
  it('round-trips, and waits for the rest of a message that came in parts', () => {
    const both = Buffer.concat([encodeFrame(1, { evt: 'READY' }), encodeFrame(3, { x: 1 })])
    const first = decodeFrames(both.subarray(0, both.length - 3))
    expect(first.frames).toEqual([{ op: 1, data: { evt: 'READY' } }])
    const second = decodeFrames(Buffer.concat([first.rest, both.subarray(both.length - 3)]))
    expect(second.frames).toEqual([{ op: 3, data: { x: 1 } }])
    expect(second.rest.length).toBe(0)
  })
})

describe('ipcPaths', () => {
  it('Windows pipes, and the temp folder elsewhere', () => {
    expect(ipcPaths('win32', {})[0]).toBe('\\\\?\\pipe\\discord-ipc-0')
    expect(ipcPaths('darwin', { TMPDIR: '/var/folders/x/T/' })[0]).toBe('/var/folders/x/T/discord-ipc-0')
    expect(ipcPaths('linux', {})).toContain('/tmp/app/com.discordapp.Discord/discord-ipc-0')
  })
})

it('validAppId', () => {
  expect(validAppId('1234567890123456789')).toBe(true)
  expect(validAppId('abc')).toBe(false)
})
