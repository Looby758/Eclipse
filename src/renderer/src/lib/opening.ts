/**
 * Phase 51: an opening for Eclipse. The timings and the maths for posters flying into the wall,
 * kept apart from the page so they can be tested.
 */

/** When each part happens, in milliseconds from the start. */
export const OPENING = {
  /** The eclipse rises and the moon slides aside to show the crescent. */
  rise: 1150,
  /** Posters start flying out of the eclipse into the wall (the dark curtain lifts at the same time). */
  fly: 950,
  /** How long one poster's flight takes. */
  flight: 950,
  /** The furthest posters set off this much later than the ones in the middle. */
  spread: 520,
  /** The eclipse fades and Home comes up. */
  settle: 2250,
  /** Home fading in, after which the opening is gone. */
  reveal: 650,
  /** Skipping (any key or click) fades everything out this quickly. */
  skip: 220
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Flight {
  /** Where the poster starts, relative to where it ends up: the middle of the window. */
  x: number
  y: number
  /** How long after the posters set off this one does, in ms. */
  delay: number
  /** A slight turn while flying, in degrees. */
  turn: number
}

/**
 * For each poster on the wall, its flight from the eclipse in the middle of the window to its place.
 * Posters outside the window get null (they aren't seen, so they stay put). Nearer posters land
 * first, so the wall fills outwards like a ripple; a small fixed wobble per poster keeps it from
 * looking mechanical while staying the same every launch.
 */
export function flightsFor(tiles: Box[], view: { width: number; height: number }): (Flight | null)[] {
  const cx = view.width / 2
  const cy = view.height / 2
  const far = Math.hypot(cx, cy) || 1
  return tiles.map((t, i) => {
    const seen = t.left + t.width > 0 && t.left < view.width && t.top + t.height > 0 && t.top < view.height
    if (!seen || !t.width || !t.height) return null
    const tx = t.left + t.width / 2
    const ty = t.top + t.height / 2
    const share = Math.min(1, Math.hypot(tx - cx, ty - cy) / far)
    const wobble = ((i * 37) % 11) / 10 - 0.5
    return {
      x: Math.round(cx - tx),
      y: Math.round(cy - ty),
      delay: Math.max(0, Math.round(share * OPENING.spread + wobble * 60)),
      turn: Math.round(wobble * 16 * (tx < cx ? -1 : 1))
    }
  })
}

/** Plays only on a fresh launch, with nothing to set up, and with movement allowed. */
export function shouldPlayOpening(o: { fresh: boolean; still: boolean; reduceMotion: boolean; setup: boolean }): boolean {
  return o.fresh && !o.still && !o.reduceMotion && !o.setup
}
