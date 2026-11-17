import type { ImportSummary } from '@core/sequel'
import type { CollectionDetails, Credits, ListSource, PersonDetails, TitleRef, TmdbListDetails } from '@core/types'
import type { Library, MediaType, Preferences, Provider, SearchResult, SeasonDetails, TitleDetails, TitleKey, TitleSnapshot, WatchProviders, WatchStatus } from '@core/types'

type Item = { key: TitleKey; type: MediaType; id: number; title: TitleSnapshot }

/** What Settings shows. The key itself never leaves the main process. */
export interface AppStatus {
  /** Your data folder (library.json lives here), or null before you've picked one. */
  dataFolder: string | null
  /** The folder was picked but can't be found now (e.g. Google Drive isn't running). */
  dataFolderMissing: boolean
  hasKey: boolean
  /** False on the rare computer that can't encrypt (some Linux setups): the key then can't be saved. */
  canEncrypt: boolean
  region: string
  version: string
}

/** An answer from TMDB, and whether it's a saved copy shown because TMDB couldn't be reached. */
export interface Fetched<T> {
  data: T
  stale: boolean
  savedAt: number
}

/** Errors come back as values, so the renderer can show TMDB's plain message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; kind?: string }

/** A list ready to show, wherever its titles come from. */
export interface ListView {
  id: string
  name: string
  description: string
  imagePath: string | null
  /** In the list's own order: story order for guides, release order for people and collections, yours for your lists. */
  items: TitleRef[]
  /** Guides only: the same titles in release order. */
  releaseItems?: TitleRef[]
}

/** The bridge between the window and the main process (window.api), like Orbit's NotesApi. */
export interface EclipseApi {
  status(): Promise<AppStatus>
  pickDataFolder(): Promise<AppStatus>
  revealDataFolder(): Promise<void>

  setTmdbKey(key: string): Promise<Result<AppStatus>>
  clearTmdbKey(): Promise<AppStatus>
  clearCache(): Promise<void>

  search(query: string): Promise<Result<Fetched<SearchResult[]>>>
  details(type: MediaType, id: number, refresh?: boolean): Promise<Result<Fetched<TitleDetails>>>
  /** This week's trending titles (saved for a day), to fill the poster wall. */
  trending(): Promise<Result<Fetched<SearchResult[]>>>
  season(tvId: number, season: number, refresh?: boolean): Promise<Result<Fetched<SeasonDetails>>>
  /** Where to watch in your region. */
  providers(type: MediaType, id: number, refresh?: boolean): Promise<Result<Fetched<WatchProviders>>>
  /** Where to watch for many titles at once, by title key (titles that couldn't be checked are left out). */
  providersMany(keys: string[]): Promise<Record<string, WatchProviders>>
  /** Details for many titles at once (saved for a week), by title key; ones that couldn't be fetched are left out. */
  detailsMany(keys: string[]): Promise<Record<string, TitleDetails>>
  /** Every streaming service in your region, for picking yours. */
  services(): Promise<Result<Fetched<Provider[]>>>

  /** Who directed it and the main cast. */
  credits(type: MediaType, id: number): Promise<Result<Fetched<Credits>>>
  person(id: number): Promise<Result<Fetched<PersonDetails>>>
  collection(id: number): Promise<Result<Fetched<CollectionDetails>>>
  tmdbList(id: number): Promise<Result<Fetched<TmdbListDetails>>>
  /** Everything in a list (person, collection, guide, TMDB list or your own), in its order. */
  openList(id: string, refresh?: boolean): Promise<Result<ListView>>
  createList(name: string, items?: TitleRef[]): Promise<{ library: Library; id: string }>
  followList(list: { name: string; source: ListSource; imagePath?: string | null }): Promise<Library>
  removeList(id: string): Promise<Library>
  renameList(id: string, name: string): Promise<Library>
  setInList(id: string, ref: TitleRef, inList: boolean): Promise<Library>
  moveInList(id: string, from: number, to: number): Promise<Library>

  getLibrary(): Promise<Library>
  setStatus(item: Item, status: WatchStatus | null): Promise<Library>
  /** Ticks or unticks episodes ("S1E3"); ticking adds the show as Watching if needed. */
  setEpisodes(item: Item, keys: string[], watched: boolean): Promise<Library>
  setNote(key: TitleKey, note: string): Promise<Library>
  setWatchedOn(key: TitleKey, day: string | null): Promise<Library>
  /** Sets or clears the day you want to have finished a show by. */
  setFinishBy(key: TitleKey, day: string | null): Promise<Library>
  setPreferences(patch: Partial<Preferences>): Promise<Library>
  /** Called when library.json changes on disk (e.g. Google Drive synced it from your other computer). */
  onLibraryChanged(callback: (library: Library) => void): () => void

  /** Asks for Sequel's export (.zip or Library.csv, or its folder with `folder`) and says what's in it. null if you cancelled. */
  pickSequel(folder?: boolean): Promise<Result<ImportSummary | null>>
  /** Merges the picked export into your library (after backing library.json up). */
  applySequel(): Promise<Result<Library>>
  cancelSequel(): Promise<void>

  openExternal(url: string): Promise<void>
  platform: 'mac' | 'win' | 'linux'
}
