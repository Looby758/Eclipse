import type { Library, LibraryEntry, ListSource, SavedList, TitleKey, TitleRef } from './types'
import { parseEpisodeKey, parseTitleKey } from './types'

/**
 * Lists: the people, collections, watch-order guides and TMDB lists you follow, and your own
 * lists. All of them work the same way for completion ("you've seen 7 of 12") and as watch
 * orders. Only your own lists store their titles; the others are looked up when shown.
 */

export function listIdFor(source: ListSource, ownId?: string): string {
  switch (source.kind) {
    case 'person':
      return `person:${source.personId}:${source.role}`
    case 'collection':
      return `collection:${source.collectionId}`
    case 'tmdbList':
      return `tmdblist:${source.listId}`
    case 'guide':
      return `guide:${source.guideId}`
    case 'custom':
      return `custom:${ownId ?? Math.random().toString(36).slice(2, 8)}`
  }
}

/** Reads a list id back into where its titles come from. */
export function sourceOf(id: string): ListSource | null {
  let m: RegExpExecArray | null
  if ((m = /^person:(\d+):(director|actor)$/.exec(id))) return { kind: 'person', personId: Number(m[1]), role: m[2] as 'director' | 'actor' }
  if ((m = /^collection:(\d+)$/.exec(id))) return { kind: 'collection', collectionId: Number(m[1]) }
  if ((m = /^tmdblist:(\d+)$/.exec(id))) return { kind: 'tmdbList', listId: Number(m[1]) }
  if ((m = /^guide:([a-z0-9-]+)$/.exec(id))) return { kind: 'guide', guideId: m[1] }
  if (/^custom:[a-z0-9-]+$/.test(id)) return { kind: 'custom' }
  return null
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'list'

/** A list row's own id: the title, or the title and season for a season row. */
export const itemKey = (r: Pick<TitleRef, 'key' | 'season'>): string => (r.season ? `${r.key}#s${r.season}` : r.key)

export const refOf = (e: Pick<LibraryEntry, 'key' | 'type' | 'id' | 'title'>): TitleRef => ({ key: e.key, type: e.type, id: e.id, name: e.title.name, year: e.title.year, posterPath: e.title.posterPath })

export const listsOf = (library: Library): SavedList[] => library.lists ?? []
export const findList = (library: Library, id: string): SavedList | undefined => listsOf(library).find((l) => l.id === id)

function withLists(library: Library, lists: SavedList[]): Library {
  return { ...library, lists }
}

function changeList(library: Library, id: string, change: (l: SavedList) => SavedList): Library {
  return withLists(
    library,
    listsOf(library).map((l) => (l.id === id ? change(l) : l))
  )
}

/** Makes one of your own lists; returns the library and the new list's id. */
export function createList(library: Library, name: string, now: Date = new Date(), items: TitleRef[] = []): { library: Library; id: string } {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'My list'
  const taken = new Set(listsOf(library).map((l) => l.id))
  let id = listIdFor({ kind: 'custom' }, slug(clean))
  for (let n = 2; taken.has(id); n++) id = listIdFor({ kind: 'custom' }, `${slug(clean)}-${n}`)
  const list: SavedList = { id, name: clean, source: { kind: 'custom' }, addedAt: now.toISOString(), items }
  return { library: withLists(library, [...listsOf(library), list]), id }
}

/** Follows a person, collection, guide or TMDB list (does nothing if you already do). */
export function followList(library: Library, list: { name: string; source: ListSource; imagePath?: string | null }, now: Date = new Date()): Library {
  const id = listIdFor(list.source)
  if (list.source.kind === 'custom' || findList(library, id)) return library
  return withLists(library, [...listsOf(library), { id, name: list.name, source: list.source, addedAt: now.toISOString(), imagePath: list.imagePath ?? null }])
}

/** Stops following a list, or deletes one of your own. */
export const removeList = (library: Library, id: string): Library => withLists(library, listsOf(library).filter((l) => l.id !== id))

export function renameList(library: Library, id: string, name: string): Library {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80)
  return clean ? changeList(library, id, (l) => ({ ...l, name: clean })) : library
}

/** Adds a title to (or takes it off) one of your own lists. */
export function setInList(library: Library, id: string, ref: TitleRef, inList: boolean): Library {
  return changeList(library, id, (l) => {
    if (l.source.kind !== 'custom') return l
    const items = l.items ?? []
    const k = itemKey(ref)
    if (inList) return items.some((i) => itemKey(i) === k) ? l : { ...l, items: [...items, ref] }
    return { ...l, items: items.filter((i) => itemKey(i) !== k) }
  })
}

/** Moves a title within one of your own lists (your watch order). */
export function moveInList(library: Library, id: string, from: number, to: number): Library {
  return changeList(library, id, (l) => {
    const items = [...(l.items ?? [])]
    if (from < 0 || from >= items.length || to < 0 || to >= items.length) return l
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    return { ...l, items }
  })
}

/** Your own lists a title is on. */
export const customListsWith = (library: Library, key: TitleKey): SavedList[] =>
  listsOf(library).filter((l) => l.source.kind === 'custom' && (l.items ?? []).some((i) => i.key === key))

/** Adds titles to your own list called `name`, making it if needed (used by the Sequel import). */
export function addToListNamed(library: Library, name: string, refs: TitleRef[], now: Date = new Date()): Library {
  let lib = library
  let list = listsOf(lib).find((l) => l.source.kind === 'custom' && l.name.toLowerCase() === name.trim().toLowerCase())
  if (!list) {
    const made = createList(lib, name, now)
    lib = made.library
    list = findList(lib, made.id)!
  }
  const have = new Set((list.items ?? []).map((i) => i.key))
  const add = refs.filter((r) => !have.has(r.key) && have.add(r.key))
  if (!add.length) return lib
  return changeList(lib, list.id, (l) => ({ ...l, items: [...(l.items ?? []), ...add] }))
}

// ---- Reading lists from the file ----

function cleanRef(raw: unknown): TitleRef | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<TitleRef>
  const parsed = typeof r.key === 'string' ? parseTitleKey(r.key) : null
  if (!parsed) return null
  return {
    key: r.key as TitleKey,
    type: parsed.type,
    id: parsed.id,
    name: typeof r.name === 'string' ? r.name : 'Untitled',
    year: typeof r.year === 'number' ? r.year : null,
    posterPath: typeof r.posterPath === 'string' ? r.posterPath : null,
    ...(typeof r.date === 'string' ? { date: r.date } : {}),
    ...(parsed.type === 'tv' && typeof r.season === 'number' && r.season > 0 ? { season: r.season } : {}),
    ...(typeof r.episodes === 'number' && r.episodes > 0 ? { episodes: r.episodes } : {})
  }
}

/** Reads the Watch soon list from the file (whole titles only, each once). */
export function normalizeWatchSoon(raw: unknown): TitleRef[] | undefined {
  const seen = new Set<string>()
  const out = (Array.isArray(raw) ? raw : [])
    .map(cleanRef)
    .filter((r): r is TitleRef => !!r && !seen.has(r.key) && !!seen.add(r.key))
    .map(({ season: _s, episodes: _e, ...r }) => r)
  return out.length ? out : undefined
}

/**
 * Reads the lists from the file. `legacy` carries list names that older versions kept on each
 * title (from the Sequel import): they become your own lists.
 */
export function normalizeLists(raw: unknown, legacy: { name: string; ref: TitleRef }[] = []): SavedList[] | undefined {
  const out: SavedList[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue
    const l = item as Partial<SavedList>
    if (typeof l.id !== 'string' || out.some((o) => o.id === l.id)) continue
    const source = sourceOf(l.id)
    if (!source) continue
    const list: SavedList = {
      id: l.id,
      name: typeof l.name === 'string' && l.name.trim() ? l.name.trim() : 'Untitled list',
      source,
      addedAt: typeof l.addedAt === 'string' ? l.addedAt : new Date(0).toISOString(),
      ...(typeof l.imagePath === 'string' ? { imagePath: l.imagePath } : {})
    }
    if (source.kind === 'custom') {
      const seen = new Set<string>()
      list.items = (Array.isArray(l.items) ? l.items : []).map(cleanRef).filter((r): r is TitleRef => !!r && !seen.has(itemKey(r)) && !!seen.add(itemKey(r)))
    }
    out.push(list)
  }
  let lib: Library = { version: 1, entries: {}, lists: out }
  const byName = new Map<string, TitleRef[]>()
  for (const { name, ref } of legacy) byName.set(name, [...(byName.get(name) ?? []), ref])
  for (const [name, refs] of byName) lib = addToListNamed(lib, name, refs, new Date(0))
  return lib.lists!.length ? lib.lists : undefined
}

// ---- Completion ----

export const isSeen = (library: Library, key: string): boolean => library.entries[key]?.status === 'watched'

/** A row is seen when its title is Watched, or (for a season row) every episode of that season is ticked. */
export function isItemSeen(library: Library, ref: Pick<TitleRef, 'key' | 'season' | 'episodes'>): boolean {
  if (isSeen(library, ref.key)) return true
  if (!ref.season || !ref.episodes) return false
  const ticked = Object.keys(library.entries[ref.key]?.episodes ?? {}).filter((k) => parseEpisodeKey(k)?.season === ref.season).length
  return ticked >= ref.episodes
}

export interface Progress {
  /** Out by today (or with no date), in the list's order. */
  released: TitleRef[]
  /** Not out yet. */
  upcoming: TitleRef[]
  seen: number
  total: number
  /** The first released title you haven't watched, in the list's order. */
  next: TitleRef | null
}

/** How far through a list you are: only titles already out count. */
export function progressOf(items: TitleRef[], library: Library, today: string): Progress {
  const released = items.filter((i) => !i.date || i.date <= today)
  const upcoming = items.filter((i) => i.date && i.date > today)
  const seen = released.filter((i) => isItemSeen(library, i)).length
  return { released, upcoming, seen, total: released.length, next: released.find((i) => !isItemSeen(library, i)) ?? null }
}

/** Release order: by date (undated last), then name. */
export function releaseOrder(items: TitleRef[]): TitleRef[] {
  return [...items].sort((a, b) => {
    const da = a.date ?? (a.year ? `${a.year}-12-31` : '9999')
    const db = b.date ?? (b.year ? `${b.year}-12-31` : '9999')
    return da.localeCompare(db) || a.name.localeCompare(b.name) || (a.season ?? 0) - (b.season ?? 0)
  })
}
