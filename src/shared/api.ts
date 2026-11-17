import type { ImportSummary } from '@core/sequel'
import type { ReleaseEvent } from '@core/calendar'
import type { KnownFrom } from '@core/knownfrom'
import type { ServiceHistory } from '@core/services'
import type { Batch, RepairChoice } from '@core/repair'
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

/** The two-computer guard (see src/core/guard.ts). */
export interface GuardStatus {
  /** Another computer has Eclipse open: changes here aren't saved. */
  readOnly: boolean
  other?: { computer: string; platform: 'mac' | 'win' | 'linux'; since: string; seen: string; session: string }
  /** This copy had it, and the other computer took over. */
  takenOver?: boolean
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
  /** Parts of a watch order you can pick to see on their own. */
  sections?: string[]
}

/** The bridge between the window and the main process (window.api), like Orbit's NotesApi. */
/** Updates come from GitHub Releases (installed app only). */
export interface UpdateStatus {
  state: 'off' | 'none' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  current: string
  version?: string
  percent?: number
  /** Mac: download it from the release page yourself (apps there can't replace themselves without a paid certificate). */
  manual?: boolean
  error?: string
  /** Why updates are off (e.g. running from source). */
  reason?: string
}

/** Your phone as a remote (Phase 23). */
export interface RemoteStatus {
  on: boolean
  running: boolean
  /** What the QR code holds: this computer's address on your Wi-Fi with the pairing code. */
  url: string | null
  error: string | null
}

export const GITHUB_REPO = 'Looby758/Eclipse'

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
  /** Cast you know from other things you've watched. */
  knownFrom(type: MediaType, id: number): Promise<Result<KnownFrom[]>>
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
  /** Adds a title to Watch soon (at the end) or takes it off. */
  setWatchSoon(ref: TitleRef, on: boolean): Promise<Library>
  moveWatchSoon(from: number, to: number): Promise<Library>

  /** What's coming up from your library: watchlist films, new seasons (or every episode) of shows you follow. */
  calendarPreview(): Promise<Result<ReleaseEvent[]>>
  /** Saves the release calendar as an .ics file where you choose. */
  calendarExport(): Promise<Result<{ saved: boolean; path?: string; count: number }>>

  getLibrary(): Promise<Library>
  setStatus(item: Item, status: WatchStatus | null): Promise<Library>
  /** Ticks or unticks episodes ("S1E3"); ticking adds the show as Watching if needed. */
  /** Ticks episodes (on your rewatch, if you're on one). `undated`: seen before Eclipse, no date. */
  setEpisodes(item: Item, keys: string[], watched: boolean, undated?: boolean): Promise<Library>
  /** Watched before Eclipse, with no date. */
  markSeenBefore(item: Item): Promise<Library>
  /** Watching a show with someone: its own progress, apart from yours. */
  startWatchWith(item: Item, name: string): Promise<Library>
  tickWith(key: TitleKey, index: number, keys: string[], watched: boolean): Promise<Library>
  endWatchWith(key: TitleKey, index: number, keep: boolean): Promise<Library>
  /** A list or watch-order row: seen with no date (a season row ticks its episodes), or undo that. */
  markRowSeen(ref: TitleRef, on: boolean): Promise<Library>
  /** Starts watching it again (a film counts as watched again today). */
  startRewatch(item: Item): Promise<Library>
  /** Finishes the rewatch you're on, or gives it up. */
  endRewatch(key: string, keep: boolean): Promise<Library>
  removeRewatch(key: string, index: number): Promise<Library>
  setNote(key: TitleKey, note: string): Promise<Library>
  /** Clear out: take it off your library (it goes to recently dropped), or put it back. */
  dropTitle(key: TitleKey): Promise<Library>
  restoreDropped(key: TitleKey): Promise<Library>
  /** Who recommended it (empty clears it). */
  setFrom(key: TitleKey, from: string): Promise<Library>
  setWatchedOn(key: TitleKey, day: string | null): Promise<Library>
  /** Sets or clears the day you want to have finished a show by. */
  setFinishBy(key: TitleKey, day: string | null): Promise<Library>
  /** Don't nudge about it until a day ("remind me later"), or null to clear. */
  snooze(key: TitleKey, until: string | null): Promise<Library>
  /** What arrived on and left your services lately (checked once a day). */
  servicesHistory(): Promise<ServiceHistory>
  onServicesChanged(callback: (history: ServiceHistory) => void): () => void

  /** Repair old dates: spread a batch out, mark it undated, or leave it (library.json is copied aside first). */
  repairBatch(batch: Batch, choice: RepairChoice): Promise<Library>

  remoteStatus(): Promise<RemoteStatus>
  setRemote(on: boolean): Promise<RemoteStatus>
  newRemoteCode(): Promise<RemoteStatus>
  onRemoteStatus(callback: (status: RemoteStatus) => void): () => void
  setPreferences(patch: Partial<Preferences>): Promise<Library>
  /** Called when library.json changes on disk (e.g. Google Drive synced it from your other computer). */
  onLibraryChanged(callback: (library: Library) => void): () => void

  /** Asks for Sequel's export (.zip or Library.csv, or its folder with `folder`) and says what's in it. null if you cancelled. */
  pickSequel(folder?: boolean): Promise<Result<ImportSummary | null>>
  /** Merges the picked export into your library (after backing library.json up). */
  applySequel(): Promise<Result<Library>>
  cancelSequel(): Promise<void>

  guardStatus(): Promise<GuardStatus>
  /** Use this copy and make the other computer's read-only (it was left open by mistake). */
  takeOver(): Promise<GuardStatus>
  onGuardChanged(callback: (status: GuardStatus) => void): () => void

  /** Asks for a folder and saves everything there (library.json plus CSV spreadsheets). */
  exportData(): Promise<Result<{ saved: boolean; path?: string }>>

  updateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  /** Windows: restart into the downloaded update. Mac: open the release page. */
  installUpdate(): Promise<void>
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void

  openExternal(url: string): Promise<void>
  platform: 'mac' | 'win' | 'linux'
}
