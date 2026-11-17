import type { Library, MediaType, SearchResult, TitleDetails, TitleKey, TitleSnapshot, WatchStatus } from '@core/types'

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

  getLibrary(): Promise<Library>
  setStatus(item: { key: TitleKey; type: MediaType; id: number; title: TitleSnapshot }, status: WatchStatus | null): Promise<Library>
  /** Called when library.json changes on disk (e.g. Google Drive synced it from your other computer). */
  onLibraryChanged(callback: (library: Library) => void): () => void

  openExternal(url: string): Promise<void>
  platform: 'mac' | 'win' | 'linux'
}
