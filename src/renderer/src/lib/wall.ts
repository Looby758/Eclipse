/**
 * Which posters go on the moving wall: yours first (most recent first), topped up with this
 * week's trending titles until there are enough to look full, so the wall is never empty. As your
 * library grows, your posters take over and trending ones drop off.
 */
export const WALL_COLUMNS = 7
export const WALL_PER_COLUMN = 8
const WALL_SIZE = WALL_COLUMNS * WALL_PER_COLUMN

/** Enough of your own posters that trending ones aren't needed. */
export const OWN_ENOUGH = 24

export function wallPosters(own: string[], trending: string[], size = WALL_SIZE): string[] {
  const mine = [...new Set(own)]
  const extra = mine.length >= OWN_ENOUGH ? [] : [...new Set(trending)].filter((p) => !mine.includes(p))
  const pool = [...mine, ...extra.slice(0, Math.max(0, OWN_ENOUGH - mine.length))]
  if (!pool.length) return []
  // Repeat the pool to fill the wall, shifting each pass so the same poster doesn't line up in a row.
  return Array.from({ length: size }, (_, i) => pool[(i + Math.floor(i / pool.length) * 3) % pool.length])
}
