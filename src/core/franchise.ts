import type { TitleRef } from './types'

/**
 * Automatic watch orders for any franchise: every film and show with the franchise's name in its
 * title ("The Walking Dead", "Fear the Walking Dead", "Tales of the Walking Dead"…), plus the film
 * series those films belong to, in release order. TMDB has no notion of a franchise that mixes
 * films and shows, so this is worked out from names; the curated guides cover the big ones better.
 */

/** A search hit with what's needed to judge whether it really belongs. */
export interface FranchiseHit extends TitleRef {
  votes: number
  genres: number[]
  language: string
}

/** Talk shows, news, reality and documentaries ("The Making of…") aren't part of a watch order. */
const LEFT_OUT_GENRES = new Set([99, 10763, 10764, 10767])
/** Too few votes usually means a fan film or a mislabelled entry. */
export const MIN_FRANCHISE_VOTES = 15
/** More matches than this and the name is too common to mean a franchise ("Love", "Home"). */
export const MAX_FRANCHISE_SIZE = 40

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'at', 'from'])

/** Lower case, no accents or punctuation, "&" as "and", and no leading "The". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** Whether a title's name contains the franchise phrase as whole words. */
export const matchesPhrase = (name: string, phrase: string): boolean => !!phrase && ` ${normalizeName(name)} `.includes(` ${phrase} `)

/**
 * The franchise names a title might belong to, best first: the part before any colon, then
 * without a sequel number, then shorter endings of it ("Fear the Walking Dead" → "walking dead").
 */
export function franchisePhrases(name: string): string[] {
  const base = normalizeName(name.split(/:| [-–—] /)[0])
  const out: string[] = []
  const add = (p: string): void => {
    const words = p.split(' ').filter(Boolean)
    if (!words.length || words.every((w) => STOP.has(w))) return
    if (words.length === 1 && words[0].length < 4) return
    const clean = words.join(' ')
    if (!out.includes(clean)) out.push(clean)
  }
  add(base)
  const unnumbered = base.replace(/( (\d+|ii|iii|iv|v|vi|part \w+))+$/, '')
  add(unnumbered)
  const words = unnumbered.split(' ')
  for (let i = 1; i < words.length - 1; i++) {
    if (STOP.has(words[i])) continue
    add(words.slice(i).join(' '))
  }
  return out.slice(0, 3)
}

export const franchiseSlug = (phrase: string): string => normalizeName(phrase).replace(/ /g, '-')
export const phraseOfSlug = (slug: string): string => slug.replace(/-/g, ' ')

/**
 * Picks the hits that belong to the franchise: the phrase in their name, enough votes, not a talk
 * show or documentary, and in the same original language as the franchise's best-known title (so
 * a Korean film that happens to share a word doesn't sneak in). Returns null if it's too common.
 */
export function pickFranchise(hits: FranchiseHit[], phrase: string, keep: string[] = []): FranchiseHit[] | null {
  const seen = new Set<string>()
  const matches = hits.filter(
    (h) => !seen.has(h.key) && !!seen.add(h.key) && matchesPhrase(h.name, phrase) && (keep.includes(h.key) || (h.votes >= MIN_FRANCHISE_VOTES && !h.genres.some((g) => LEFT_OUT_GENRES.has(g))))
  )
  if (!matches.length) return []
  const anchor = [...matches].sort((a, b) => b.votes - a.votes)[0]
  const same = matches.filter((h) => h.language === anchor.language || keep.includes(h.key))
  return same.length > MAX_FRANCHISE_SIZE ? null : same
}

/** What to call the franchise: its best-known title whose name is just the phrase, or the phrase itself. */
export function franchiseName(hits: TitleRef[], phrase: string): string {
  const exact = hits.find((h) => normalizeName(h.name.split(/:| [-–—] /)[0]) === phrase)
  if (exact) return exact.name.split(/:| [-–—] /)[0].trim()
  return phrase.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}
