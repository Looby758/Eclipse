import type { Library, TitleRef } from './types'
import { normalizeWatchSoon } from './lists'

/**
 * The favourites wall (phase 58): your all-time top films and shows, hung as framed posters in
 * your own order. Separate from the shelf of everything you've finished.
 */

/** Plenty for a hall of fame, and keeps the wall from turning into a second library. */
export const FAVOURITES_MAX = 30

export const isFavourite = (library: Library, key: string): boolean => !!library.favourites?.some((r) => r.key === key)

/** Hangs a title on the wall (at the end) or takes it down. */
export function setFavourite(library: Library, ref: TitleRef, on: boolean): Library {
  const list = library.favourites ?? []
  const has = list.some((r) => r.key === ref.key)
  if (on === has) return library
  if (on && list.length >= FAVOURITES_MAX) return library
  const { season: _s, episodes: _e, sections: _x, role: _r, roleEpisodes: _re, creditIds: _c, ...clean } = ref
  const next = on ? [...list, clean] : list.filter((r) => r.key !== ref.key)
  const out: Library = { ...library, favourites: next }
  if (!next.length) delete out.favourites
  return out
}

/** Moves a favourite from one place on the wall to another (dragging). */
export function moveFavourite(library: Library, from: number, to: number): Library {
  const list = [...(library.favourites ?? [])]
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return library
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return { ...library, favourites: list }
}

export function normalizeFavourites(raw: unknown): TitleRef[] | undefined {
  return normalizeWatchSoon(raw)?.slice(0, FAVOURITES_MAX)
}
