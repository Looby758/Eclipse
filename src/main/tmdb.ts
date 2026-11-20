import type { TitleImages } from '@core/posters'
import { boxSetCard, comingSoon, comingSoonCandidates, type BoxSetCard, type ComingSoon } from '@core/shelf'
import { errorText, report } from './health'
import { net, safeStorage } from 'electron'
import { cached, CACHE_TTL } from '@core/cache'
import { createTmdb, TmdbError, type Tmdb } from '@core/tmdb'
import type { CollectionDetails, Credits, MediaType, PartEpisodes, PersonDetails, PersonResult, Provider, SearchResult, SeasonDetails, TitleDetails, TitleRef, TmdbListDetails, WatchProviders } from '@core/types'
import { expandGuide, guideById, guideRefs, type Guide, type GuideTitleInfo } from '@core/guides'
import { releaseOrder, sourceOf, findList, refOf } from '@core/lists'
import type { Library, TitleKey, Trait } from '@core/types'
import { parseTitleKey } from '@core/types'
import { followed, seasonsToCheck, upcomingReleases, type ReleaseEvent } from '@core/calendar'
import { activeEntry, localDate, preferencesOf } from '@core/library'
import { franchisesOf, sameUniverse, universeName, universeStrip, type UniverseItem, type UniverseTitle } from '@core/universe'
import { knownFrom, type KnownFrom } from '@core/knownfrom'
import { catchUps, type CatchUp } from '@core/catchup'
import { weekStart } from '@core/time'
import { applyTaste, recommend, seedsOf, SIMILAR_WEIGHT, type Recommendation, type Seed } from '@core/recommend'
import { weekSoFar, type WeekSoFar } from '@core/week'
import type { Fetched, ListView } from '@shared/api'
import { loadSettings, saveSettings } from './settings'
import { fileCache } from './cacheStore'

/**
 * Your TMDB key and every call to TMDB. The key is stored encrypted with the system's own
 * protection (Windows' data protection or the Mac Keychain, via Electron's safeStorage), the same
 * way Orbit stores its keys. It never goes to the window and is never written in plain text.
 */

const encrypt = (text: string): string => safeStorage.encryptString(text).toString('base64')
const decrypt = (text: string): string => safeStorage.decryptString(Buffer.from(text, 'base64'))

let lastTmdbOk = 0
/** Every TMDB request goes through here, so "Is everything working?" knows how the last one went. */
const fetchWithElectron = async (url: string, init?: { headers?: Record<string, string> }) => {
  try {
    const res = await net.fetch(url, init)
    if (res.ok) {
      // Once a minute is plenty for a job that runs constantly.
      if (Date.now() - lastTmdbOk > 60_000) report('tmdb', true, 'Reached TMDB')
      lastTmdbOk = Date.now()
    } else if (res.status !== 404) {
      lastTmdbOk = 0
      report('tmdb', false, `TMDB answered ${res.status}${res.status === 401 ? ' (the key was refused)' : res.status === 429 ? ' (too many requests, it slows down and tries again)' : ''}`)
    }
    return res
  } catch (err) {
    lastTmdbOk = 0
    report('tmdb', false, `Couldn't reach TMDB: ${errorText(err)}. Saved copies are shown meanwhile.`)
    throw err
  }
}

export const canEncrypt = (): boolean => safeStorage.isEncryptionAvailable()
export const hasKey = (): boolean => !!loadSettings().tmdbKey

let client: Tmdb | null = null

function tmdb(): Tmdb {
  if (client) return client
  const stored = loadSettings().tmdbKey
  if (!stored) throw new TmdbError('auth', 'Add your TMDB API key in Settings first.')
  let key: string
  try {
    key = decrypt(stored)
  } catch {
    throw new TmdbError('auth', 'Your saved TMDB key couldn’t be read on this computer. Paste it again in Settings.')
  }
  client = createTmdb({ key, fetch: fetchWithElectron })
  return client
}

/** Checks the key with TMDB, then saves it encrypted. */
export async function setKey(raw: string): Promise<void> {
  const key = raw.trim()
  if (!key) throw new Error('Paste your TMDB API key first.')
  if (!canEncrypt()) throw new Error('This computer can’t store the key securely, so it wasn’t saved.')
  const test = createTmdb({ key, fetch: fetchWithElectron })
  try {
    await test.check()
  } catch (err) {
    if (err instanceof TmdbError && err.kind === 'auth') throw new Error('TMDB didn’t accept that key. Check you copied all of it.')
    throw err
  }
  saveSettings({ tmdbKey: encrypt(key) })
  client = test
}

export function clearKey(): void {
  saveSettings({ tmdbKey: undefined })
  client = null
}

// A wrong key shouldn't hide behind old saved answers: only fall back when TMDB can't be reached.
const serveStaleUnlessKeyProblem = (err: unknown): boolean => !(err instanceof TmdbError && err.kind === 'auth')

export async function search(query: string): Promise<Fetched<SearchResult[]>> {
  const q = query.trim().toLowerCase()
  const r = await cached(fileCache, `search:${q}`, CACHE_TTL.search, () => tmdb().search(q), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function searchPeople(query: string): Promise<Fetched<PersonResult[]>> {
  const q = query.trim().toLowerCase()
  const r = await cached(fileCache, `search:people:${q}`, CACHE_TTL.search, () => tmdb().searchPeople(q), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function details(type: MediaType, id: number, refresh = false): Promise<Fetched<TitleDetails>> {
  const r = await cached(fileCache, `details4:${type}:${id}`, CACHE_TTL.details, () => tmdb().details(type, id), {
    force: refresh,
    shouldServeStale: serveStaleUnlessKeyProblem
  })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function trending(): Promise<Fetched<SearchResult[]>> {
  const r = await cached(fileCache, 'trending:week', CACHE_TTL.trending, () => tmdb().trending(), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function season(tvId: number, n: number, refresh = false): Promise<Fetched<SeasonDetails>> {
  const r = await cached(fileCache, `season2:${tvId}:${n}`, CACHE_TTL.season, () => tmdb().season(tvId, n), { force: refresh, shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

export async function providers(type: MediaType, id: number, region: string, refresh = false): Promise<Fetched<WatchProviders>> {
  const r = await cached(fileCache, `providers:${region}:${type}:${id}`, CACHE_TTL.providers, () => tmdb().providers(type, id, region), {
    force: refresh,
    shouldServeStale: serveStaleUnlessKeyProblem
  })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

/** Where to watch for many titles (the library filters): a few at a time, from the cache where fresh. */
export async function providersMany(keys: string[], region: string): Promise<Record<string, WatchProviders>> {
  const out: Record<string, WatchProviders> = {}
  const todo = [...new Set(keys)].filter((k) => parseTitleKey(k))
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (key) => {
        const { type, id } = parseTitleKey(key)!
        try {
          out[key] = (await providers(type, id, region)).data
        } catch {
          // Unknown for now; it simply won't match the filters until it can be checked.
        }
      })
    )
  }
  return out
}

/** Details for many titles at once, by title key (titles that couldn't be fetched are left out). */
export async function detailsMany(keys: string[]): Promise<Record<string, TitleDetails>> {
  const out: Record<string, TitleDetails> = {}
  const todo = [...new Set(keys)].filter((k) => parseTitleKey(k))
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (key) => {
        const { type, id } = parseTitleKey(key)!
        try {
          out[key] = (await details(type, id)).data
        } catch {
          // Left out; its time shows as unknown.
        }
      })
    )
  }
  return out
}

/**
 * Recommendations for Search and the poster wall: TMDB's "recommended" and "similar" lists for your
 * strongest titles, added up (each list saved for a week), then raised or lowered by what your
 * Interested and Not for me answers have taught it.
 */
export async function recommendationsFor(library: Library, now = new Date()): Promise<Recommendation[]> {
  const seeds = seedsOf(library, now)
  const lists: { seed: Seed; results: SearchResult[] }[] = []
  for (let i = 0; i < seeds.length; i += 5) {
    await Promise.all(
      seeds.slice(i, i + 5).flatMap((seed) => {
        const t = parseTitleKey(seed.key)
        if (!t) return []
        const fetchList = async (source: 'recs' | 'similar'): Promise<void> => {
          try {
            const job = (): Promise<SearchResult[]> => (source === 'recs' ? tmdb().recommendations(t.type, t.id) : tmdb().similar(t.type, t.id))
            const r = await cached(fileCache, `${source}:${seed.key}`, CACHE_TTL.credits, job, { shouldServeStale: serveStaleUnlessKeyProblem })
            lists.push({ seed: source === 'recs' ? seed : { ...seed, weight: seed.weight * SIMILAR_WEIGHT }, results: r.data })
          } catch {
            // Skipped until it can be fetched.
          }
        }
        return [fetchList('recs'), fetchList('similar')]
      })
    )
  }
  const taste = library.recsTaste
  const ranked = recommend(library, lists, 90)
  if (!taste || !Object.keys(taste.weights).length) return ranked.slice(0, 40)
  // Once it has learnt something, the strongest candidates' traits are fetched (saved for a week) so
  // your answers can move them up or down.
  const traits: Record<string, Trait[]> = {}
  const top = ranked.slice(0, 60)
  for (let i = 0; i < top.length; i += 8) {
    await Promise.all(
      top.slice(i, i + 8).map(async (r) => {
        try {
          traits[r.key] = await traitsOf(r.key)
        } catch {
          // Ranked without learning until it can be fetched.
        }
      })
    )
  }
  return applyTaste(ranked, traits, taste, 40)
}

/** A title's creators, network, main cast and keywords, for learning from answers (saved for a week). */
export async function traitsOf(key: string): Promise<Trait[]> {
  const t = parseTitleKey(key)
  if (!t) return []
  const r = await cached(fileCache, `traits:${key}`, CACHE_TTL.credits, () => tmdb().traits(t.type, t.id), { shouldServeStale: serveStaleUnlessKeyProblem })
  return r.data
}

export async function services(region: string): Promise<Fetched<Provider[]>> {
  const r = await cached(fileCache, `services:${region}`, CACHE_TTL.services, () => tmdb().services(region), { shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

async function keep<T>(key: string, ttl: number, job: () => Promise<T>, refresh = false): Promise<Fetched<T>> {
  const r = await cached(fileCache, key, ttl, job, { force: refresh, shouldServeStale: serveStaleUnlessKeyProblem })
  return { data: r.data, stale: r.source === 'stale', savedAt: r.savedAt }
}

/** Phase 55: a title's other posters and backgrounds, for "Change poster" and "Change background" (saved for a week, like details). */
export const images = (type: MediaType, id: number): Promise<Fetched<TitleImages>> => keep(`images:${type}:${id}`, CACHE_TTL.details, () => tmdb().images(type, id))

/** Phase 46: a show's TheTVDB number, to find its theme tune. It never changes, so it's kept for a long time. */
export const findImdb = (imdbId: string): Promise<Fetched<{ type: MediaType; id: number } | null>> => keep(`imdb:${imdbId}`, CACHE_TTL.credits, () => tmdb().findImdb(imdbId))
export const tvdbId = (id: number): Promise<Fetched<number | null>> => keep(`tvdb:${id}`, CACHE_TTL.credits, () => tmdb().tvdbId(id))

// "v3": saved copies from before parts played, the full cast and part ids were kept are fetched again.
export const credits = (type: MediaType, id: number): Promise<Fetched<Credits>> => keep(`credits3:${type}:${id}`, CACHE_TTL.credits, () => tmdb().credits(type, id))
export const person = (id: number, refresh = false): Promise<Fetched<PersonDetails>> => keep(`person3:${id}`, CACHE_TTL.person, () => tmdb().person(id), refresh)
export const collection = (id: number, refresh = false): Promise<Fetched<CollectionDetails>> => keep(`collection:${id}`, CACHE_TTL.collection, () => tmdb().collection(id), refresh)
export const tmdbList = (id: number, refresh = false): Promise<Fetched<TmdbListDetails>> => keep(`list:${id}`, CACHE_TTL.list, () => tmdb().list(id), refresh)

/**
 * Which episodes of a show someone was in. TMDB lists them on the part itself for most guest and
 * recurring parts; when it doesn't, the seasons are searched for them as a guest star; failing
 * that, only the seasons are known (usual for the main cast).
 */
export async function partEpisodes(tvId: number, personId: number, creditIds: string[]): Promise<PartEpisodes> {
  const found: PartEpisodes = { episodes: [], seasons: [] }
  for (const id of [...new Set(creditIds)].slice(0, 6)) {
    try {
      const part = (await keep(`credit:${id}`, CACHE_TTL.credits, () => tmdb().credit(id))).data
      found.episodes.push(...part.episodes)
      found.seasons.push(...part.seasons)
    } catch {
      // Look in the seasons instead.
    }
  }
  if (!found.episodes.length) {
    const numbers = found.seasons.length ? found.seasons : (await details('tv', tvId)).data.seasons.map((s) => s.number).filter((n) => n > 0)
    for (let i = 0; i < numbers.length; i += 4) {
      await Promise.all(
        numbers.slice(i, i + 4).map(async (n) => {
          try {
            for (const e of (await season(tvId, n)).data.episodes) {
              if (e.guestStars?.includes(personId)) found.episodes.push({ season: e.season, number: e.number, name: e.name, airDate: e.airDate })
            }
          } catch {
            // Skip a season TMDB won't give us.
          }
        })
      )
    }
  }
  const seen = new Set<string>()
  const episodes = found.episodes
    .filter((e) => !seen.has(`${e.season}:${e.number}`) && !!seen.add(`${e.season}:${e.number}`))
    .sort((a, b) => a.season - b.season || a.number - b.number)
  return { episodes, seasons: [...new Set(found.seasons)].sort((a, b) => a - b) }
}

/** A hand-made guide laid out season by season, with posters and air dates from TMDB. */
async function guideItems(g: Guide): Promise<TitleRef[]> {
  const found = await detailsMany(guideRefs(g).map((r) => r.key))
  const info: Record<string, GuideTitleInfo> = {}
  for (const [key, d] of Object.entries(found)) info[key] = { name: d.name, year: d.year, date: d.date, posterPath: d.posterPath, seasons: d.type === 'tv' ? d.seasons : [] }
  return expandGuide(g, info)
}

/** Everything in a list, wherever it comes from. */
export async function openList(id: string, library: Library, refresh = false): Promise<ListView> {
  const source = sourceOf(id)
  if (!source) throw new Error('That list doesn’t exist.')
  switch (source.kind) {
    case 'person': {
      const p = (await person(source.personId, refresh)).data
      const directing = source.role === 'director'
      return {
        id,
        name: p.name,
        description: directing ? `Films directed by ${p.name}.` : `Films and shows with ${p.name} in a regular part.`,
        imagePath: p.profilePath,
        items: releaseOrder(directing ? p.directed : p.acted)
      }
    }
    case 'collection': {
      const c = (await collection(source.collectionId, refresh)).data
      return { id, name: c.name, description: c.overview, imagePath: c.posterPath, items: releaseOrder(c.parts) }
    }
    case 'tmdbList': {
      const l = (await tmdbList(source.listId, refresh)).data
      return { id, name: l.name, description: l.description, imagePath: l.posterPath, items: l.items }
    }
    case 'guide': {
      const g = guideById(source.guideId)
      if (!g) throw new Error('That guide doesn’t exist.')
      const items = await guideItems(g)
      return { id, name: g.name, description: g.description, imagePath: null, items, releaseItems: releaseOrder(items), sections: g.sections }
    }
    case 'from': {
      const k = source.name.toLowerCase()
      const picks = Object.values(library.entries)
        .filter((e) => e.from?.toLowerCase() === k)
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      const name = picks[0]?.from ?? source.name
      return { id, name: `${name}’s picks`, description: `Everything you noted as recommended by ${name}, in the order you added them.`, imagePath: null, items: picks.map(refOf) }
    }
    case 'custom': {
      const l = findList(library, id)
      if (!l) throw new Error('That list has been deleted.')
      return { id, name: l.name, description: '', imagePath: null, items: l.items ?? [] }
    }
  }
}

/** What's coming up from your library, for the release calendar. */
export async function calendarEvents(library: Library, today = localDate(new Date())): Promise<ReleaseEvent[]> {
  const details = await detailsMany(followed(library))
  const seasons: Record<string, SeasonDetails> = {}
  const wanted = Object.values(details).flatMap((d) => seasonsToCheck(d, today).map((n) => ({ id: d.id, n })))
  for (let i = 0; i < wanted.length; i += 6) {
    await Promise.all(
      wanted.slice(i, i + 6).map(async ({ id, n }) => {
        try {
          seasons[`${id}:${n}`] = (await season(id, n)).data
        } catch {
          // The season's start date from the show's details is used instead.
        }
      })
    )
  }
  return upcomingReleases({ library, details, seasons, today, everyEpisode: preferencesOf(library).calendarEpisodes })
}

/** The cast of a title you know from other things you've watched (looks up the top 15's filmographies, saved like Lists does). */
export async function knownFromFor(type: MediaType, id: number, library: Library): Promise<KnownFrom[]> {
  const cast = (await credits(type, id)).data.cast.slice(0, 15)
  const people: Record<number, PersonDetails> = {}
  for (let i = 0; i < cast.length; i += 5) {
    await Promise.all(
      cast.slice(i, i + 5).map(async (c) => {
        try {
          people[c.id] = (await person(c.id)).data
        } catch {
          // Skip anyone TMDB won't give us.
        }
      })
    )
  }
  return knownFrom(cast, people, library, `${type}:${id}`)
}

/** Everything "Your year in Eclipse" needs: details and credits of what you watched that year, and your lists' titles. */
export async function yearData(library: Library, keys: string[]): Promise<{ details: Record<string, TitleDetails>; credits: Record<string, Credits>; lists: Record<string, { name: string; items: TitleRef[] }> }> {
  const details = await detailsMany(keys)
  const creditsByKey: Record<string, Credits> = {}
  for (let i = 0; i < keys.length; i += 6) {
    await Promise.all(
      keys.slice(i, i + 6).map(async (key) => {
        const p = parseTitleKey(key)
        if (!p) return
        try {
          creditsByKey[key] = (await credits(p.type, p.id)).data
        } catch {
          // Left out: they just won't count towards the director and actor.
        }
      })
    )
  }
  const lists: Record<string, { name: string; items: TitleRef[] }> = {}
  for (const l of library.lists ?? []) {
    try {
      const v = await openList(l.id, library)
      lists[l.id] = { name: l.name, items: v.items }
    } catch {
      // A list that can't be opened right now doesn't count.
    }
  }
  return { details, credits: creditsByKey, lists }
}

/** Catch up before the sequel: your films and shows, the series your films are in, and what's coming out in them. */
/** The weekly budget: how much of this week is watched and left (null with no budget). */
export async function weekBudget(library: Library, now = new Date()): Promise<WeekSoFar | null> {
  const prefs = preferencesOf(library)
  if (!prefs.weeklyBudgetMinutes) return null
  const from = weekStart(localDate(new Date(now.getTime() - 7 * 86_400_000)))
  const recent = (day: string | null | undefined): boolean => !!day && day >= from
  const keys = Object.values(library.entries)
    .filter((e) => [e.watchedOn, ...Object.values(e.episodes ?? {}), ...(e.rewatches ?? []).flatMap((r) => [r.finishedOn, ...Object.values(r.episodes ?? {})])].some(recent))
    .map((e) => e.key)
  return weekSoFar(library, await detailsMany(keys), now, prefs)
}

export async function catchUpList(library: Library, now = new Date()): Promise<CatchUp[]> {
  const today = localDate(now)
  const prefs = preferencesOf(library)
  const entries = Object.values(library.entries)
  const films = entries.filter((e) => e.type === 'movie' && (e.status === 'watched' || e.watchedOn || e.rewatches?.length)).map((e) => e.key)
  const shows = entries.filter((e) => e.type === 'tv' && e.status !== 'stopped' && e.status !== 'want').map((e) => e.key)
  const details = await detailsMany([...films, ...shows])
  const ids = [...new Set(Object.values(details).flatMap((d) => (d.collection ? [d.collection.id] : [])))]
  const collections: Record<number, CollectionDetails> = {}
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(
      ids.slice(i, i + 6).map(async (id) => {
        try {
          collections[id] = (await collection(id)).data
        } catch {
          // Skipped until it can be fetched.
        }
      })
    )
  }
  // Films coming out around now (by any date), for their release date here.
  const lo = localDate(new Date(now.getTime() - 60 * 86_400_000))
  const upcoming = Object.values(collections).flatMap((c) => c.parts.filter((p) => !p.date || p.date >= lo).map((p) => p.key))
  Object.assign(details, await detailsMany(upcoming.filter((k) => !details[k])))
  return catchUps({ library, details, collections, now, evenings: prefs, region: prefs.region, skipDays: prefs.catchUpSkipDays, aheadDays: 42 }).filter((c) => c.upcoming.date > today)
}

/** Phase 59: the seasons and films you're waiting for, for "Coming soon" on the shelf. */
export async function comingSoonList(library: Library, today = localDate(new Date())): Promise<ComingSoon[]> {
  const details = await detailsMany(comingSoonCandidates(library))
  return comingSoon(library, details, today, preferencesOf(library).region)
}

/**
 * Phase 52: the back of a box set pulled off the shelf. Each part from TMDB is optional, so the card
 * still shows your dates and who with when offline or when TMDB has nothing.
 */
export async function boxSet(library: Library, key: string): Promise<BoxSetCard> {
  const entry = library.entries[key as TitleKey]
  if (!entry) throw new Error('That isn’t in your library any more.')
  const quiet = <T>(p: Promise<Fetched<T>>): Promise<T | undefined> => p.then((r) => r.data).catch(() => undefined)
  const [d, c] = await Promise.all([quiet(details(entry.type, entry.id)), quiet(credits(entry.type, entry.id))])
  const seasonNumbers = new Set<number>()
  if (entry.type === 'tv') {
    const ticks = [entry.episodes ?? {}, ...(entry.rewatches ?? []).map((r) => r.episodes ?? {})]
    for (const t of ticks) for (const k of Object.keys(t)) seasonNumbers.add(Number(/^S(\d+)E/.exec(k)?.[1] ?? 0))
    seasonNumbers.delete(0)
  }
  const seasons = (await Promise.all([...seasonNumbers].map((n) => quiet(season(entry.id, n))))).filter((s): s is SeasonDetails => !!s)
  return boxSetCard(entry, d, c, seasons)
}

/**
 * The same universe (the Spotlight title page's strip): other titles in your library that belong
 * with this one, by watch-order guide, name, film series or franchise keyword. Only your library is
 * looked at, so a spin-off you haven't added is never given away.
 */
export async function universeFor(type: MediaType, id: number, library: Library): Promise<{ name: string; items: UniverseItem[] }> {
  const current = (await details(type, id)).data
  const name = universeName(current)
  const self: UniverseTitle = { key: current.key, name: current.name, collectionId: current.collection?.id ?? null, keywords: current.keywords }
  const others = Object.values(library.entries).filter((e) => e.key !== current.key)
  // Guides and names need nothing from TMDB.
  const related = new Set(others.filter((e) => sameUniverse(self, { key: e.key, name: e.title.name })).map((e) => e.key))
  // Film series and franchise keywords do: look at the rest of the library only when this title has one.
  const rest = others.filter((e) => !related.has(e.key) && (franchisesOf(current.keywords).length > 0 || (current.collection && e.type === 'movie')))
  if (rest.length) {
    const found = await detailsMany(rest.map((e) => e.key))
    for (const e of rest) {
      const d = found[e.key]
      if (d && sameUniverse(self, { key: d.key, name: d.name, collectionId: d.collection?.id ?? null, keywords: d.keywords })) related.add(e.key)
    }
  }
  if (!related.size) return { name, items: [] }
  const all = await detailsMany([...related])
  const entries = Object.fromEntries(Object.values(library.entries).map((e) => [e.key, activeEntry(e)!]))
  return { name, items: universeStrip(current, Object.values(all), entries, localDate(new Date())) }
}
