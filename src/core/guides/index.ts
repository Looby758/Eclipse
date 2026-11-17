import type { MediaType, TitleRef } from '../types'
import { titleKey } from '../types'
import { MARVEL } from './marvel'
import { STAR_WARS } from './starWars'
import { normalizeName } from '../franchise'

/**
 * Hand-made watch orders for franchises that mix films and shows, which TMDB doesn't cover.
 * Each is a story (in-universe) order; release order is worked out from the release dates.
 * Every TMDB id was checked against themoviedb.org when these were written.
 */

export interface GuideEntry {
  type: MediaType
  id: number
  name: string
  year: number
  /** A short pointer, e.g. "Set in 1995". */
  note?: string
}

export interface Guide {
  id: string
  name: string
  /** What you might search for to find it (already lower case, without "The"). */
  aliases: string[]
  description: string
  /** In story order. */
  entries: GuideEntry[]
}

export const GUIDES: Guide[] = [MARVEL, STAR_WARS]

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id)

export const guideRefs = (g: Guide): TitleRef[] =>
  g.entries.map((e) => ({ key: titleKey(e.type, e.id), type: e.type, id: e.id, name: e.name, year: e.year, posterPath: null }))

/** The guides a title appears in. */
export const guidesWith = (key: string): Guide[] => GUIDES.filter((g) => g.entries.some((e) => titleKey(e.type, e.id) === key))

/** The guide a search is after ("star wars", "MCU"), if any. */
export function guideForQuery(query: string): Guide | undefined {
  const q = normalizeName(query)
  return q ? GUIDES.find((g) => g.aliases.some((a) => q === a || q.startsWith(`${a} `))) : undefined
}
