import { useEffect } from 'react'
import { create } from 'zustand'
import { posterInfos, posterKeys, type PosterDetails, type PosterInfo } from '@core/posterLook'
import type { Library } from '@core/types'
import { useApp } from '../store/app'

/**
 * Phases 63 and 66 in the window: the Appearance switch (remembered on this computer) and, for shows you're part-way through, how much of each poster is in colour and which season's
 * poster to use.
 */

const FILL_KEY = 'eclipse.posterFill'

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function remember(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // Not remembered; still used for now.
  }
}

interface PosterLook {
  /** Phase 63: part-watched shows fill with colour as you go. On unless you turn it off. */
  fill: boolean
  /** By title key: shows whose poster fills in or follows the season you're on. */
  info: Record<string, PosterInfo>
  setFill(on: boolean): void
}

export const usePosterLook = create<PosterLook>((set) => ({
  fill: read(FILL_KEY, true),
  info: {},
  setFill: (on) => {
    remember(FILL_KEY, on)
    set({ fill: on })
  }
}))

/** A title's poster info (undefined when it looks as usual). */
export const usePosterInfo = (key: string | undefined): PosterInfo | undefined => usePosterLook((s) => (key ? s.info[key] : undefined))

// TMDB details for the shows that need them, kept while the window is open (the main process saves them for a week).
const details: Record<string, PosterDetails> = {}
let asking = new Set<string>()

function refresh(library: Library): void {
  const keys = posterKeys(library)
  const missing = keys.filter((k) => !details[k] && !asking.has(k))
  const update = (): void => {
    const next = posterInfos(useApp.getState().library, details)
    const now = usePosterLook.getState().info
    if (JSON.stringify(next) !== JSON.stringify(now)) usePosterLook.setState({ info: next })
  }
  update()
  if (!missing.length) return
  for (const k of missing) asking.add(k)
  window.api
    .detailsMany(missing)
    .then((got) => {
      for (const [k, d] of Object.entries(got)) details[k] = { seasons: d.seasons }
      update()
    })
    .catch(() => undefined)
    .finally(() => {
      asking = new Set([...asking].filter((k) => !missing.includes(k)))
    })
}

/** Keeps poster info up to date as the library changes (call once, in App). */
export function usePosterLookWatcher(): void {
  const library = useApp((s) => s.library)
  const hasKey = useApp((s) => !!s.status?.hasKey)
  useEffect(() => {
    if (hasKey) refresh(library)
  }, [library, hasKey])
}
