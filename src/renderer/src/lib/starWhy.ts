import { useSyncExternalStore } from 'react'

/** Phase 49: show why things connect on the star maps ("Morgan", "The multiverse"). Off unless you turn it on; remembered on this computer only. */

const KEY = 'eclipse.starWhy'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let current = read()

export const savedStarWhy = (): boolean => current

export function setStarWhy(on: boolean): void {
  current = on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Not remembered; still on for now.
  }
  for (const l of listeners) l()
}

export function useStarWhy(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
