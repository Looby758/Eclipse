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
 * everything sits in the middle of the range: nothing low, no rumble or boom. Theme tunes are not used here;
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

/**
 * A soft mallet note, like a vibraphone or a wooden bar: the note itself, plus a quieter octave and
 * a faint higher overtone that die away first, so it starts bright and settles warm.
 */
function mallet(c: AudioContext, out: AudioNode, freq: number, peak: number, at: number, length: number): void {
  note(c, out, freq, peak, at, length)
  note(c, out, freq * 2, peak * 0.16, at, length * 0.35)
  note(c, out, freq * 4, peak * 0.05, at, length * 0.12)
}

/**
 * The tick: a quick, soft two-note "pop" up a fourth (G then C, in the middle of the range), like a
 * little wooden bar being struck twice. No pitch slides. About a quarter of a second.
 */
export function playTick(): void {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t = c.currentTime + 0.005
  mallet(c, out, 783.99, 0.085, t, 0.22)
  mallet(c, out, 1046.5, 0.095, t + 0.055, 0.3)
}

/**
 * Finishing a season: a warm, rising four-note chord (C, E, G, then the C above, in the middle of
 * the range) struck like a vibraphone and left to ring for about two seconds. Richer than the
 * tick, gentler than the send-off, and nothing low.
 */
export function playSeasonChime(delay = 0.18): void {
  const a = audio()
  if (!a) return
  const { ctx: c, out } = a
  const t = c.currentTime + delay
  const notes: [number, number][] = [
    [523.25, 0.07],
    [659.25, 0.065],
    [783.99, 0.06],
    [1046.5, 0.06]
  ]
  notes.forEach(([f, v], i) => mallet(c, out, f, v, t + i * 0.11, 2.4 - i * 0.15))
  // The chord rings together for a moment at the end, softly.
  for (const [f, v] of notes.slice(0, 3)) note(c, out, f, v * 0.3, t + 0.55, 1.8)
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
