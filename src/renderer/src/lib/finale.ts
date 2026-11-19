import { useEffect } from 'react'
import { create } from 'zustand'
import { justFinished } from '@core/finale'
import { localDate } from '@core/library'
import type { Library } from '@core/types'
import { useApp } from '../store/app'

/**
 * Phase 46: finishing a show is an event. `useFinale` says which show's send-off is showing, and
 * `useFinaleWatcher` notices you finishing one, wherever the last tick came from (a show's page,
 * Home, the tray, the phone remote or the phone page syncing in).
 */

interface FinaleState {
  key: string | null
  open(key: string): void
  close(): void
}

export const useFinale = create<FinaleState>((set) => ({
  key: null,
  open: (key) => set((s) => (s.key ? s : { key })),
  close: () => set({ key: null })
}))

const MUTED = 'eclipse.finaleMuted'

/** The send-off's Mute, remembered on this computer. */
export function savedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED) === '1'
  } catch {
    return false
  }
}

export function saveMuted(on: boolean): void {
  try {
    localStorage.setItem(MUTED, on ? '1' : '0')
  } catch {
    // Just not remembered.
  }
}

/** Shows whose ticks went up in this change. */
function tickedMore(before: Library, after: Library): string[] {
  return Object.values(after.entries)
    .filter((e) => e.type === 'tv' && e.episodes !== before.entries[e.key]?.episodes && Object.keys(e.episodes ?? {}).length > Object.keys(before.entries[e.key]?.episodes ?? {}).length)
    .map((e) => e.key)
}

export function useFinaleWatcher(): void {
  useEffect(() => {
    let prev = useApp.getState().library
    // The first library to arrive is just Eclipse opening, not you ticking anything.
    let ready = Object.keys(prev.entries).length > 0
    return useApp.subscribe((s) => {
      const next = s.library
      if (next === prev) return
      const before = prev
      prev = next
      if (!ready) {
        ready = true
        return
      }
      for (const key of tickedMore(before, next)) {
        const e = next.entries[key]
        window.api.details('tv', e.id).then((r) => {
          if (!r.ok) return
          const d = r.value.data
          if (justFinished(before.entries[key], useApp.getState().library.entries[key], d.seasons, d.status, localDate(new Date()))) useFinale.getState().open(key)
        })
      }
    })
  }, [])
}
