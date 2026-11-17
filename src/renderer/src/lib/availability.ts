import { useEffect, useState } from 'react'
import { availability, type AvailabilityFilter } from '@core/providers'
import { preferencesOf } from '@core/library'
import type { Availability, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

/**
 * Where-to-watch for a list of titles, fetched only once a filter needs it (each answer is
 * saved for a day, so it's quick after the first time).
 */
export function useAvailability(keys: string[], filter: AvailabilityFilter): { map: Record<string, Availability>; checking: boolean } {
  const services = useApp((s) => preferencesOf(s.library).services)
  const [providers, setProviders] = useState<Record<string, WatchProviders>>({})
  const [checking, setChecking] = useState(false)
  const wanted = filter === 'any' ? '' : keys.join(',')

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    const missing = wanted.split(',').filter((k) => !providers[k])
    if (!missing.length) return
    setChecking(true)
    window.api.providersMany(missing).then((found) => {
      if (cancelled) return
      setProviders((p) => ({ ...p, ...found }))
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [wanted])

  const map: Record<string, Availability> = {}
  for (const [k, p] of Object.entries(providers)) map[k] = availability(p, services)
  return { map, checking }
}
