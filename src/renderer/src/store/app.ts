import { create } from 'zustand'
import type { Library, MediaType } from '@core/types'
import { emptyLibrary } from '@core/library'
import type { AppStatus } from '@shared/api'

export type View = { name: 'home' } | { name: 'library' } | { name: 'search' } | { name: 'settings' } | { name: 'title'; type: MediaType; id: number }

interface AppState {
  status: AppStatus | null
  library: Library
  /** Pages you've been to, newest last (Back pops it). */
  history: View[]
  query: string
  setStatus(status: AppStatus): void
  setLibrary(library: Library): void
  go(view: View): void
  back(): void
  setQuery(query: string): void
}

export const useApp = create<AppState>((set) => ({
  status: null,
  library: emptyLibrary(),
  history: [{ name: 'home' }],
  query: '',
  setStatus: (status) => set({ status }),
  setLibrary: (library) => set({ library }),
  go: (view) =>
    set((s) => {
      const top = s.history[s.history.length - 1]
      if (JSON.stringify(top) === JSON.stringify(view)) return s
      // Typing into search replaces the search page rather than stacking another.
      const base = top.name === 'search' && view.name === 'search' ? s.history.slice(0, -1) : s.history
      return { history: [...base, view].slice(-50) }
    }),
  back: () => set((s) => (s.history.length > 1 ? { history: s.history.slice(0, -1) } : s)),
  setQuery: (query) => set({ query })
}))

export const currentView = (s: AppState): View => s.history[s.history.length - 1]
