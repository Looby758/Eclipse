import type { Library } from './types'

/**
 * Choose your own posters (phase 55). Eclipse always uses TMDB's default poster on its own and
 * never asks; picking one of the alternatives on a title's page saves it here, by title key, and
 * it's used everywhere (the wall, the shelf, Home, lists). Reset takes it off again.
 */

/** One of a title's posters on TMDB. */
export interface PosterOption {
  path: string
  /** Its language ("en"), or null for posters with no text. */
  language: string | null
  /** TMDB's own vote, used to put the best ones first. */
  votes: number
  width: number
  height: number
}

const KEY = /^(movie|tv):\d+$/
/** A TMDB image file path, e.g. "/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg". */
const PATH = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/

export const isPosterPath = (v: unknown): v is string => typeof v === 'string' && PATH.test(v)

/** The poster you chose for a title, if any. */
export const chosenPoster = (library: Library, key: string): string | undefined => library.posters?.[key]

/** The poster to show for a title: yours if you chose one, otherwise the one given (TMDB's default). */
export function posterFor<T extends string | null | undefined>(library: Library, key: string, fallback: T): string | T {
  return library.posters?.[key] ?? fallback
}

/** Which picture you're choosing: the poster, or the background on the title's page. */
export type Artwork = 'posters' | 'backdrops'

/** Uses `path` for this title everywhere, or goes back to TMDB's default with null (Reset). */
export function setPoster(library: Library, key: string, path: string | null): Library {
  return setArtwork(library, 'posters', key, path)
}

/** The background picture on a title's page (picked with "Change background"), or back to TMDB's with null. */
export function setBackdrop(library: Library, key: string, path: string | null): Library {
  return setArtwork(library, 'backdrops', key, path)
}

function setArtwork(library: Library, kind: Artwork, key: string, path: string | null): Library {
  if (!KEY.test(key)) return library
  if (path !== null && !isPosterPath(path)) return library
  const chosen = { ...(library[kind] ?? {}) }
  if (path === null) {
    if (!(key in chosen)) return library
    delete chosen[key]
  } else {
    if (chosen[key] === path) return library
    chosen[key] = path
  }
  const next: Library = { ...library, [kind]: chosen }
  if (!Object.keys(chosen).length) delete next[kind]
  return next
}

/** Reads the chosen posters from the file, dropping anything that doesn't look right. */
export function normalizePosters(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, path] of Object.entries(raw as Record<string, unknown>)) if (KEY.test(key) && isPosterPath(path)) out[key] = path
  return Object.keys(out).length ? out : undefined
}

/** A title's posters and backgrounds on TMDB. */
export interface TitleImages {
  posters: PosterOption[]
  backdrops: PosterOption[]
}

/**
 * Sorts a title's posters for the picker: the default first, then ones with no text or in your
 * language, then the rest, best voted first within each. Duplicates are dropped.
 */
export function orderPosters(options: PosterOption[], defaultPath: string | null, language = 'en'): PosterOption[] {
  const seen = new Set<string>()
  const rank = (o: PosterOption): number => (o.path === defaultPath ? 0 : o.language === language ? 1 : o.language === null ? 2 : 3)
  return options
    .filter((o) => isPosterPath(o.path) && !seen.has(o.path) && !!seen.add(o.path))
    .sort((a, b) => rank(a) - rank(b) || b.votes - a.votes)
}
