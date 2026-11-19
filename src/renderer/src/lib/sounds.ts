import { useSyncExternalStore } from 'react'
import { justFinished } from '@core/finale'
import { localDate } from '@core/library'
import { seasonsFinished, ticksToday } from '@core/sounds'
import type { Library } from '@core/types'
import { useApp } from '../store/app'

/**
 * Phase 54: sound design. A soft click when you tick an episode (anywhere: a title page, Home, the
 * tray, the phone remote or the player finishing one) and a richer, brighter chime when a tick
 * finishes a season. Off unless you turn it on (Settings → Appearance), remembered on this computer.
 *
 * Everything is made here with the Web Audio API, so there are no sound files and no packages, and
 * everything sits high and light: nothing low, no rumble or boom. Theme tunes are not used here;
 * they play only in the send-off when you finish a show (phase 46), which brings its own chime, so
 * the last tick of a show clicks but doesn't also chime for its season.
 */

// ---- The setting ----

const KEY = 'eclipse.sounds'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()

export const soundsOn = (): boolean => on

export function setSounds(value: boolean): void {
  on = value
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // Not remembered; still on for now.
  }
  for (const l of listeners) l()
}

export function useSounds(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on
  )
}

// ---- The sounds ----

let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio(): { ctx: AudioContext; out: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.9
      // Nothing below this gets through, so a laptop speaker never thumps.
      const floor = ctx.createBiquadFilter()
      floor.type = 'highpass'
      floor.frequency.value = 380
      master.connect(floor)
      floor.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return { ctx, out: master! }
  } catch {
    return null
  }
}

/** One bell-like note: a sine with a quick, soft attack and a long fade. */
function note(c: AudioContext, out: AudioNode, freq: number, peak: number, at: number, length: number): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  o.connect(g)
  g.connect(out)
  o.start(at)
  o.stop(at + length + 0.05)
}

/** The tick: a tiny tap of air and a short, high "tock", like a soft pen click. About 80 ms. */
export function playTick(): void {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t = c.currentTime + 0.005

  // The tap: a few milliseconds of filtered noise.
  const len = Math.floor(c.sampleRate * 0.03)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6)
  const noise = c.createBufferSource()
  noise.buffer = buffer
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 3200
  band.Q.value = 1.4
  const ng = c.createGain()
  ng.gain.value = 0.18
  noise.connect(band)
  band.connect(ng)
  ng.connect(out)
  noise.start(t)

  // The tock: a high sine that drops a little as it fades.
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(1900, t)
  o.frequency.exponentialRampToValueAtTime(1350, t + 0.05)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + 0.1)
}

/**
 * Finishing a season: a rising four-note bell (E, G sharp, B, E, all high) with a soft sparkle an
 * octave up on each, ringing out for about two seconds. Richer than the tick, lighter than the
 * send-off.
 */
export function playSeasonChime(delay = 0.12): void {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t = c.currentTime + delay
  const notes: [number, number][] = [
    [1318.5, 0.055],
    [1661.2, 0.05],
    [1975.5, 0.045],
    [2637.0, 0.04]
  ]
  notes.forEach(([f, v], i) => {
    const at = t + i * 0.085
    note(c, out, f, v, at, 2.2 - i * 0.2)
    // A quieter, slightly detuned octave gives it the shimmer of a real bell.
    note(c, out, f * 2.003, v * 0.25, at, 0.9)
  })
  // The last note rings again, softer, as it settles.
  note(c, out, 2637.0, 0.018, t + 0.75, 1.6)
}

// ---- Listening for ticks ----

/**
 * Watches the library for new ticks dated today and plays the tick, plus the season chime when a
 * tick finishes a season (but not the show's last one: the send-off has its own). The first library
 * seen is where it starts from, so opening Eclipse is silent. Returns a function that stops it.
 */
export function watchSounds(): () => void {
  let before: Library | null = null
  return useApp.subscribe((s, old) => {
    if (s.library === old.library) return
    const after = s.library
    const from = before
    before = after
    if (!from || !Object.keys(from.entries).length || !on) return
    const today = localDate(new Date())
    const keys = ticksToday(from, after, today)
    if (!keys.length) return
    playTick()
    void chimeIfSeason(from, after, keys, today)
  })
}

async function chimeIfSeason(before: Library, after: Library, keys: string[], today: string): Promise<void> {
  for (const key of keys) {
    const e = after.entries[key]
    try {
      const r = await window.api.details('tv', e.id)
      if (!r.ok) continue
      const d = r.value.data
      if (justFinished(before.entries[key], e, d.seasons, d.status, today)) continue
      if (seasonsFinished(before.entries[key], e, d.seasons, today).length) {
        playSeasonChime()
        return
      }
    } catch {
      // No details (offline, no key): just the tick.
    }
  }
}
