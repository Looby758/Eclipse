import type { MediaType } from './types'

/** A pasted link (or id) that points at one title. */
export type TitleLink = { kind: 'tmdb'; type: MediaType; id: number } | { kind: 'imdb'; imdbId: string }

/**
 * Reads a TMDB or IMDb link pasted into search: "https://www.themoviedb.org/tv/1396-breaking-bad",
 * "imdb.com/title/tt0903747/", or a bare IMDb id ("tt0903747"). Anything else is an ordinary search (null).
 */
export function parseTitleLink(text: string): TitleLink | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  const tmdb = /(?:^|\/\/|\.)themoviedb\.org\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(movie|tv)\/(\d+)/i.exec(t)
  if (tmdb) return { kind: 'tmdb', type: tmdb[1].toLowerCase() as MediaType, id: Number(tmdb[2]) }
  const imdb = /(?:^|imdb\.com\/(?:[a-z]{2}\/)?title\/)(tt\d{5,10})(?:[/?#]|$)/i.exec(t)
  if (imdb) return { kind: 'imdb', imdbId: imdb[1].toLowerCase() }
  return null
}
