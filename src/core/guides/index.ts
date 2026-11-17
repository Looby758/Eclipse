import type { MediaType, Season, TitleRef } from '../types'
import { titleKey } from '../types'
import { MARVEL } from './marvel'
import { STAR_WARS } from './starWars'
import { WALKING_DEAD } from './walkingDead'
import { BREAKING_BAD } from './breakingBad'
import { X_MEN } from './xMen'
import { HARRY_POTTER } from './harryPotter'
import { THE_BOYS } from './theBoys'


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
  /** Shows only: which seasons this row covers, in this order. Left out, every season, one after another. */
  seasons?: number[]
  /** The parts of the order it belongs to, from the guide's `sections`. */
  sections?: string[]
}

export interface Guide {
  id: string
  name: string
  /** What you might search for to find it (already lower case, without "The"). */
  aliases: string[]
  description: string
  /** Parts of the order you can pick to see on their own (e.g. "The Defenders"), in the order shown. */
  sections?: string[]
  /** In story order. */
  entries: GuideEntry[]
}

export const GUIDES: Guide[] = [MARVEL, X_MEN, STAR_WARS, HARRY_POTTER, WALKING_DEAD, BREAKING_BAD, THE_BOYS]

export const guideById = (id: string): Guide | undefined => GUIDES.find((g) => g.id === id)

/** Each film and show in a guide once, in its first place. */
export const guideRefs = (g: Guide): TitleRef[] =>
  g.entries.filter((e, i) => g.entries.findIndex((f) => f.type === e.type && f.id === e.id) === i).map((e) => ({ key: titleKey(e.type, e.id), type: e.type, id: e.id, name: e.name, year: e.year, posterPath: null }))

/** The guides a title appears in. */
export const guidesWith = (key: string): Guide[] => GUIDES.filter((g) => g.entries.some((e) => titleKey(e.type, e.id) === key))

/** Lower case, no accents or punctuation, "&" as "and", and no leading "The". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** The guide a search is after ("star wars", "MCU"), if any. Longer names also match the start of a search ("star wars andor"). */
export function guideForQuery(query: string): Guide | undefined {
  const q = normalizeName(query)
  return q ? GUIDES.find((g) => g.aliases.some((a) => q === a || (a.includes(' ') && q.startsWith(`${a} `)))) : undefined
}

/** What a guide needs to know about a title to lay it out season by season. */
export interface GuideTitleInfo {
  name: string
  year: number | null
  date: string | null
  posterPath: string | null
  seasons: Season[]
}

/**
 * A guide's rows: films as they are, shows one row per season (each with its own air date, so
 * release order interleaves shows that ran side by side). Seasons with no date yet are left out.
 */
export function expandGuide(g: Guide, info: Record<string, GuideTitleInfo>): TitleRef[] {
  const out: TitleRef[] = []
  for (const e of g.entries) {
    const key = titleKey(e.type, e.id)
    const d = info[key]
    const base: TitleRef = { key, type: e.type, id: e.id, name: e.name, year: d?.year ?? e.year, posterPath: d?.posterPath ?? null, date: d?.date ?? null, ...(e.sections ? { sections: e.sections } : {}) }
    if (e.type === 'movie') {
      out.push(base)
      continue
    }
    const known = (d?.seasons ?? []).filter((s) => s.number > 0)
    if (!known.length) {
      // Details couldn't be fetched: list the named seasons (or the whole show) without dates.
      if (e.seasons) for (const n of e.seasons) out.push({ ...base, season: n })
      else out.push(base)
      continue
    }
    for (const n of e.seasons ?? known.map((s) => s.number)) {
      const s = known.find((k) => k.number === n)
      if (!s?.airDate) continue
      out.push({ ...base, season: n, episodes: s.episodeCount || undefined, date: s.airDate, year: Number(s.airDate.slice(0, 4)) || base.year, posterPath: s.posterPath ?? base.posterPath })
    }
  }
  return out
}

/** How many different films and shows a guide covers. */
export const guideTitleCount = (g: Guide): number => new Set(g.entries.map((e) => titleKey(e.type, e.id))).size
