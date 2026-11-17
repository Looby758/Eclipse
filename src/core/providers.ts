import type { Availability, Provider, WatchProviders } from './types'

/**
 * Where-to-watch helpers. TMDB's lists come from JustWatch, which needs crediting wherever
 * they're shown.
 */

export const JUSTWATCH_URL = 'https://www.justwatch.com'

/** Your services that stream (or show free) this title. */
export function onMyServices(p: WatchProviders | null | undefined, mine: number[]): Provider[] {
  if (!p) return []
  return [...p.stream, ...p.free].filter((s) => mine.includes(s.id))
}

/** The best way you can watch it: on your services, streaming elsewhere, only to rent or buy, or nowhere. */
export function availability(p: WatchProviders | null | undefined, mine: number[]): Availability {
  if (!p) return 'none'
  if (onMyServices(p, mine).length) return 'mine'
  if (p.stream.length || p.free.length) return 'stream'
  if (p.rent.length || p.buy.length) return 'rentbuy'
  return 'none'
}

export type AvailabilityFilter = 'any' | 'mine' | 'rentbuy' | 'none'

export const FILTER_LABELS: Record<AvailabilityFilter, string> = {
  any: 'Anywhere',
  mine: 'On my services',
  rentbuy: 'Rent or buy only',
  none: 'Not streaming anywhere'
}

/** Whether a title passes a filter. Unknown availability (not checked yet) only passes "Anywhere". */
export function passesFilter(filter: AvailabilityFilter, a: Availability | undefined): boolean {
  if (filter === 'any') return true
  if (a === undefined) return false
  return a === filter
}

/** The services Eclipse picks for you the first time, matched by name (Disney+ and NOW TV, as in the plan). */
export function guessServices(all: Provider[], names = ['disney plus', 'now tv', 'now']): number[] {
  const clean = (n: string): string => n.toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
  const found = all.filter((p) => names.includes(clean(p.name)))
  return [...new Set(found.map((p) => p.id))]
}
