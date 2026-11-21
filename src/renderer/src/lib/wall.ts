/**
 * Which posters go on the moving wall: yours (most recent first) with recommendations for you mixed
 * in (about one poster in three, the same picks as Search's "Recommended for you"), topped up with
 * this week's trending titles until there are enough to look full, so the wall is never empty. As
 * your library grows, your posters and recommendations take over and trending ones drop off.
 */
export const WALL_COLUMNS = 7
export const WALL_PER_COLUMN = 8
const WALL_SIZE = WALL_COLUMNS * WALL_PER_COLUMN

/** Enough of your own posters that trending ones aren't needed. */
export const OWN_ENOUGH = 24

/** At most this many recommendations go on the wall. */
export const RECS_ON_WALL = 16

export function wallPosters(own: string[], trending: string[], size = WALL_SIZE, recs: string[] = []): string[] {
  const mine = [...new Set(own)]
  const picks = [...new Set(recs)].filter((p) => !mine.includes(p)).slice(0, RECS_ON_WALL)
  // Two of yours, then one recommendation, and whatever is left of either after that.
  const mixed: string[] = []
  for (let i = 0, j = 0; i < mine.length || j < picks.length; ) {
    if (i < mine.length) mixed.push(mine[i++])
    if (i < mine.length && i % 2 === 1) mixed.push(mine[i++])
    if (j < picks.length) mixed.push(picks[j++])
  }
  const extra = mixed.length >= OWN_ENOUGH ? [] : [...new Set(trending)].filter((p) => !mixed.includes(p))
  const pool = [...mixed, ...extra.slice(0, Math.max(0, OWN_ENOUGH - mixed.length))]
  if (!pool.length) return []
  // Repeat the pool to fill the wall, shifting each pass so the same poster doesn't line up in a row.
  return Array.from({ length: size }, (_, i) => pool[(i + Math.floor(i / pool.length) * 3) % pool.length])
}

/** Spotlight Home's rows: each poster's size and the gap, matching --row-tile-w/h and --row-gap in theme.css. */
export const ROW_TILE_W = 132
export const ROW_TILE_H = 198
export const ROW_GAP = 14
/** How far the rows reach past the window's edges (the -60px -200px inset on .wall-rows). */
const OVER_Y = 60
const OVER_X = 200

/**
 * How many rows, and posters in each, it takes to cover a window this size (in CSS pixels, which
 * grow when you zoom out). Each row holds its posters twice and slides by half, so one copy has to
 * reach past both sides. Never fewer than the 6 rows of 14 the wall always had.
 */
export function wallGrid(width: number, height: number): { rows: number; perRow: number } {
  const rows = Math.max(6, Math.ceil((height + 2 * OVER_Y) / (ROW_TILE_H + ROW_GAP)) + 1)
  const perRow = Math.max(14, Math.ceil((width + 2 * OVER_X) / (ROW_TILE_W + ROW_GAP)) + 1)
  return { rows, perRow }
}

// ---- Phase 62: the rainbow wall ----

/** A poster's main colour: hue (0–360), how colourful and how light it is overall (0–100), and how strongly that hue stands out (c). */
export interface PosterColour {
  h: number
  s: number
  l: number
  c: number
}

/** Below this, a poster counts as black, white or grey and goes with the greys. */
export const GREY_BELOW = 20

/**
 * Posters in rainbow order: colourful ones by hue, from red round through orange, yellow, green,
 * blue and purple, then the greys from light to dark. Posters whose colour isn't known yet go last.
 */
export function rainbowOrder(paths: string[], colours: Record<string, PosterColour | undefined>): string[] {
  const unique = [...new Set(paths)]
  // Start the circle at magenta-red (hue 340), so reds sit together instead of at both ends.
  const turn = (h: number): number => (h - 340 + 360) % 360
  const bright = unique.filter((p) => colours[p] && colours[p]!.c >= GREY_BELOW).sort((a, b) => turn(colours[a]!.h) - turn(colours[b]!.h) || colours[b]!.l - colours[a]!.l)
  const grey = unique.filter((p) => colours[p] && colours[p]!.c < GREY_BELOW).sort((a, b) => colours[b]!.l - colours[a]!.l)
  const unknown = unique.filter((p) => !colours[p])
  return [...bright, ...grey, ...unknown]
}

/**
 * The wall in bands of colour: posters in rainbow order, cut into `lines` runs (one per row, or per
 * column on the tilted wall), each run repeated only as much as it needs to fill its line. `hue` is
 * each band's colour (null for a band of greys), for tinting the band so the rainbow reads at a glance.
 */
export function rainbowLines(paths: string[], colours: Record<string, PosterColour | undefined>, lines: number, perLine: number): { lines: string[][]; hues: (number | null)[] } {
  const order = rainbowOrder(paths, colours)
  if (!order.length || lines < 1) return { lines: [], hues: [] }
  const runs = Array.from({ length: lines }, (_, r) => {
    const from = Math.floor((r * order.length) / lines)
    const to = Math.max(from + 1, Math.floor(((r + 1) * order.length) / lines))
    return order.slice(from, Math.min(to, order.length))
  })
  return {
    lines: runs.map((run) => Array.from({ length: perLine }, (_, k) => run[k % run.length])),
    hues: runs.map((run) => bandHue(run, colours))
  }
}

/** The average hue of a band's colourful posters (round the colour wheel), or null when it's mostly greys. */
export function bandHue(run: string[], colours: Record<string, PosterColour | undefined>): number | null {
  const bright = run.map((p) => colours[p]).filter((c): c is PosterColour => !!c && c.c >= GREY_BELOW)
  if (bright.length * 2 < run.length) return null
  let x = 0
  let y = 0
  for (const c of bright) {
    x += Math.cos((c.h * Math.PI) / 180)
    y += Math.sin((c.h * Math.PI) / 180)
  }
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
}
