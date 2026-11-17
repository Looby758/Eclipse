import { useEffect, useState } from 'react'
import { availability } from '@core/providers'
import { preferencesOf } from '@core/library'
import type { Availability, TitleDetails, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

/**
 * Fetches something for many titles at once, only while `enabled`, keeping what it already has.
 * Each answer is saved by the app (a day for where-to-watch, a week for details), so it's quick
 * after the first time.
 */
function useMany<T>(keys: string[], enabled: boolean, fetchMany: (keys: string[]) => Promise<Record<string, T>>): { map: Record<string, T>; checking: boolean } {
  const [map, setMap] = useState<Record<string, T>>({})
  const [checking, setChecking] = useState(false)
  const wanted = enabled ? keys.join(',') : ''

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    const missing = wanted.split(',').filter((k) => !(k in map))
    if (!missing.length) return
    setChecking(true)
    fetchMany(missing).then((found) => {
      if (cancelled) return
      setMap((m) => ({ ...m, ...found }))
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [wanted])

  return { map, checking }
}

/** Where-to-watch for a list of titles, and how you could watch each (on yours, elsewhere, rent or buy, nowhere). */
export function useAvailability(keys: string[], enabled: boolean): { map: Record<string, Availability>; providers: Record<string, WatchProviders>; checking: boolean } {
  const services = useApp((s) => preferencesOf(s.library).services)
  const { map: providers, checking } = useMany(keys, enabled, (k) => window.api.providersMany(k))
  const map: Record<string, Availability> = {}
  for (const [k, p] of Object.entries(providers)) map[k] = availability(p, services)
  return { map, providers, checking }
}

/** TMDB details for a list of titles (for runtimes and episode counts). */
export function useDetailsMany(keys: string[], enabled: boolean): { map: Record<string, TitleDetails>; checking: boolean } {
  return useMany(keys, enabled, (k) => window.api.detailsMany(k))
}
