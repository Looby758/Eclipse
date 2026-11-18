import { guidesWith, normalizeName } from './guides'
import type { LibraryEntry, TitleDetails, TitleKey } from './types'
import { episodeKey, parseEpisodeKey, STATUS_LABELS } from './types'
import { nextEpisodeFor } from './library'
import { timeLeft } from './time'

/**
 * "The same universe": the other films and shows in your library that belong with this one (The
 * Walking Dead and its spin-offs, a film series, Star Wars, Marvel). Only titles already in your
 * library are ever offered, so a title page never gives away that a spin-off exists (a Daryl Dixon
 * show would tell you he survives the main one).
 */

/** What's needed to tell whether two titles belong together. */
export interface UniverseTitle {
  key: string
  name: string
  /** Films: the TMDB collection. */
  collectionId?: number | null
  keywords?: string[]
}

/** TMDB keywords that mark a shared universe, and what to call it. */
const FRANCHISES: { name: string; match: RegExp }[] = [
  { name: 'Marvel', match: /marvel cinematic universe/ },
  { name: 'Star Wars', match: /^star wars/ },
  { name: 'Star Trek', match: /^star trek/ },
  { name: 'DC', match: /dc extended universe|^dc universe|dceu/ },
  { name: 'Wizarding World', match: /wizarding world/ },
  { name: 'Middle-earth', match: /middle.earth/ },
  { name: 'The Walking Dead', match: /^the walking dead|walking dead universe/ },
  { name: 'Alien', match: /^alien franchise/ },
  { name: 'MonsterVerse', match: /monsterverse/ }
]

/** The franchises a title's keywords put it in. */
export function franchisesOf(keywords: string[] | undefined): string[] {
  const out = new Set<string>()
  for (const k of keywords ?? []) for (const f of FRANCHISES) if (f.match.test(k)) out.add(f.name)
  return [...out]
}

/** The part of a name before a colon ("The Walking Dead" from "The Walking Dead: Dead City"), normalised. */
const prefixOf = (name: string): string | null => {
  const i = name.indexOf(':')
  return i > 0 ? normalizeName(name.slice(0, i)) || null : null
}

const words = (s: string): number => (s ? s.split(' ').length : 0)
/** `inner` appears in `outer` as whole words. */
const hasWords = (outer: string, inner: string): boolean => ` ${outer} `.includes(` ${inner} `)

/**
 * Names that say two titles go together: "The Walking Dead" and "The Walking Dead: Dead City",
 * "Fear the Walking Dead" (the shorter name inside the longer, when it's at least two words), or two
 * names sharing what comes before the colon.
 */
export function namesRelated(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb || na === nb) return false
  const pa = prefixOf(a)
  const pb = prefixOf(b)
  if (pa && pb && pa === pb) return true
  if (pa === nb || pb === na) return true
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (words(short) >= 2 && hasWords(long, short)) return true
  if (pa && words(pa) >= 2 && hasWords(nb, pa)) return true
  if (pb && words(pb) >= 2 && hasWords(na, pb)) return true
  return false
}

/** Whether two titles belong to the same universe. */
export function sameUniverse(a: UniverseTitle, b: UniverseTitle): boolean {
  if (a.key === b.key) return false
  const guides = new Set(guidesWith(a.key).map((g) => g.id))
  if (guidesWith(b.key).some((g) => guides.has(g.id))) return true
  if (a.collectionId && a.collectionId === b.collectionId) return true
  if (namesRelated(a.name, b.name)) return true
  const fa = franchisesOf(a.keywords)
  return franchisesOf(b.keywords).some((f) => fa.includes(f))
}

/** What to call the universe in the strip's heading. */
export function universeName(d: Pick<TitleDetails, 'key' | 'name' | 'collection' | 'keywords'>): string {
  const guide = guidesWith(d.key)[0]
  if (guide) return guide.name
  if (d.collection) return d.collection.name.replace(/\s+collection$/i, '')
  const franchise = franchisesOf(d.keywords)[0]
  if (franchise) return franchise
  const i = d.name.indexOf(':')
  return i > 0 ? d.name.slice(0, i).trim() : d.name
}

/** One card in the universe strip. */
export interface UniverseItem {
  key: TitleKey
  type: TitleDetails['type']
  id: number
  name: string
  year: number | null
  date: string | null
  backdropPath: string | null
  posterPath: string | null
  /** The page you're on. */
  current: boolean
  /** How close it is to this title, shown first along the bottom: 2 a hand-picked family (Andor and Rogue One), 1 the same film series, names or small watch-order group, 0 just the same universe. */
  family?: number
  /** "Next: S3 E4", "Not started", "Watched", "Want to watch". */
  line: string
  /** Episodes seen and out so far (films: 1 of 1 once watched). */
  seen: number
  total: number
}

/** How far through a show you are: regular episodes ticked, out of those out so far. */
export function showCount(d: Pick<TitleDetails, 'type' | 'runtime' | 'seasons' | 'nextEpisode'>, entry: LibraryEntry | undefined, today: string): { seen: number; total: number; minutesLeft: number } {
  const seenKeys = Object.keys(entry?.episodes ?? {}).filter((k) => {
    const p = parseEpisodeKey(k)
    return !!p && p.season > 0 && d.seasons.some((s) => s.number === p.season && p.episode <= s.episodeCount)
  })
  const left = timeLeft(d, entry?.status === 'watched' ? { ...entry, status: 'watching' } : entry, today)
  const total = seenKeys.length + left.episodes
  // Marked Watched (perhaps before Eclipse, with nothing ticked): all of it so far counts as seen.
  if (entry?.status === 'watched') return { seen: total, total, minutesLeft: 0 }
  return { seen: seenKeys.length, total: seenKeys.length + left.episodes, minutesLeft: left.minutes }
}

export function universeItem(d: TitleDetails, entry: LibraryEntry | undefined, today: string, current = false): UniverseItem {
  const base = { key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, date: d.date, backdropPath: d.backdropPath, posterPath: d.posterPath, current }
  if (d.type === 'movie') {
    const done = entry?.status === 'watched' || !!entry?.seenBefore
    return { ...base, line: done ? 'Watched' : entry ? STATUS_LABELS[entry.status] : '', seen: done ? 1 : 0, total: 1 }
  }
  const { seen, total } = showCount(d, entry, today)
  const next = nextEpisodeFor(entry, d.seasons.map((s) => ({ number: s.number, episodeCount: s.episodeCount })))
  const line =
    entry?.status === 'watched' || (total > 0 && seen >= total)
      ? 'Watched'
      : seen === 0
        ? `Not started · 0 of ${total}`
        : next && !entry?.episodes?.[episodeKey(next.season, next.episode)]
          ? `Next: S${next.season} E${next.episode} · ${seen} of ${total}`
          : `${seen} of ${total}`
  return { ...base, line, seen, total }
}

/** Watch-order sections small enough to be a family (The Defenders), unlike a whole saga. */
const FAMILY_SECTION_MAX = 15

function smallSections(key: string): Set<string> {
  const out = new Set<string>()
  for (const g of guidesWith(key)) {
    for (const section of g.sections ?? []) {
      const members = new Set(g.entries.filter((e) => e.sections?.includes(section)).map((e) => `${e.type}:${e.id}`))
      if (members.has(key) && members.size <= FAMILY_SECTION_MAX) out.add(`${g.id}/${section}`)
    }
  }
  return out
}

/**
 * Hand-picked families inside the big universes, closer than anything the names or film series
 * show: the stories that carry straight on from each other. A title can be in more than one.
 * Matched by TMDB id, or by name for ones the watch-order guides don't list yet.
 */
export const FAMILIES: { name: string; titles: (string | { name: string })[] }[] = [
  { name: 'WandaVision', titles: ['tv:85271', 'tv:138501', 'tv:213375', { name: 'Agatha All Along' }, { name: 'VisionQuest' }] },
  { name: 'Andor', titles: ['tv:83867', 'movie:330459'] },
  { name: 'The Mandalorian', titles: ['tv:82856', 'tv:114461', 'tv:115036', 'movie:1228710', { name: 'The Mandalorian and Grogu' }] },
  { name: 'Daredevil', titles: ['tv:61889', 'tv:202555'] },
  { name: 'Hawkeye', titles: ['tv:88329', 'tv:122226'] },
  { name: 'Captain America', titles: ['movie:1771', 'movie:100402', 'movie:271110', 'movie:822119', 'tv:88396'] },
  { name: 'Thunderbolts', titles: ['movie:986056', 'movie:497698', 'tv:88396'] },
  { name: 'What If', titles: ['tv:91363', { name: 'Marvel Zombies' }] }
]

const inFamily = (f: (typeof FAMILIES)[number], t: Pick<TitleDetails, 'key' | 'name'>): boolean =>
  f.titles.some((x) => (typeof x === 'string' ? x === t.key : normalizeName(x.name) === normalizeName(t.name)))

/**
 * How close two titles in the same universe are. 2: a hand-picked family (WandaVision, Agatha All
 * Along and VisionQuest). 1: the same film series (the Avengers films), names that go together
 * (Captain America: …), or a small group in the watch-order guide (The Defenders). 0: neither.
 */
export function familyRank(a: Pick<TitleDetails, 'key' | 'name' | 'collection'>, b: Pick<TitleDetails, 'key' | 'name' | 'collection'>): number {
  if (a.key === b.key) return 0
  if (FAMILIES.some((f) => inFamily(f, a) && inFamily(f, b))) return 2
  if (a.collection && a.collection.id === b.collection?.id) return 1
  if (namesRelated(a.name, b.name)) return 1
  const sa = smallSections(a.key)
  return [...smallSections(b.key)].some((x) => sa.has(x)) ? 1 : 0
}

export const sameFamily = (a: Pick<TitleDetails, 'key' | 'name' | 'collection'>, b: Pick<TitleDetails, 'key' | 'name' | 'collection'>): boolean => familyRank(a, b) > 0

/** The strip: this title and the related ones, in the order they came out. Empty when nothing's related. */
export function universeStrip(current: TitleDetails, related: TitleDetails[], entries: Record<string, LibraryEntry>, today: string): UniverseItem[] {
  if (!related.length) return []
  const all = [current, ...related.filter((r) => r.key !== current.key && entries[r.key])]
  return all
    .map((d) => ({ ...universeItem(d, entries[d.key], today, d.key === current.key), family: familyRank(current, d) }))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.name.localeCompare(b.name))
}

/** How many cards fit along the bottom before the strip shows a window around this one. */
export const STRIP_MAX = 6

/**
 * The cards to show: all of them when they fit, else this one and the closest family (leaving room
 * for "See all"): hand-picked family first, then series and names, then whatever came out nearest,
 * shown in release order.
 */
export function stripWindow<T extends { current: boolean; family?: number }>(items: T[], max = STRIP_MAX): T[] {
  if (items.length <= max) return items
  const at = Math.max(0, items.findIndex((u) => u.current))
  const others = items
    .map((u, i) => ({ u, rank: u.family ?? 0, d: Math.abs(i - at) }))
    .filter(({ u }) => u !== items[at])
    .sort((a, b) => b.rank - a.rank || a.d - b.d)
    .slice(0, max - 2)
  const picked = new Set([items[at], ...others.map((x) => x.u)])
  return items.filter((u) => picked.has(u))
}
