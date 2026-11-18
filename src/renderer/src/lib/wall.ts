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
