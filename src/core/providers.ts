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

/** Free services that aren't yours (free ones you've ticked count as yours). */
export function freeElsewhere(p: WatchProviders | null | undefined, mine: number[]): Provider[] {
  return (p?.free ?? []).filter((s) => !mine.includes(s.id))
}

/** The best way you can watch it: on your services, free, streaming elsewhere, only to rent or buy, or nowhere. */
export function availability(p: WatchProviders | null | undefined, mine: number[]): Availability {
  if (!p) return 'none'
  if (onMyServices(p, mine).length) return 'mine'
  if (p.free.length) return 'free'
  if (p.stream.length) return 'stream'
  if (p.rent.length || p.buy.length) return 'rentbuy'
  return 'none'
}

export type AvailabilityFilter = 'any' | 'mine' | 'mineOrFree' | 'rentbuy' | 'none'

export const FILTER_LABELS: Record<AvailabilityFilter, string> = {
  any: 'Anywhere',
  mine: 'On my services',
  mineOrFree: 'On my services or free',
  rentbuy: 'Rent or buy only',
  none: 'Not streaming anywhere'
}

/** Whether a title passes a filter. Unknown availability (not checked yet) only passes "Anywhere". */
export function passesFilter(filter: AvailabilityFilter, a: Availability | undefined): boolean {
  if (filter === 'any') return true
  if (a === undefined) return false
  if (filter === 'mineOrFree') return a === 'mine' || a === 'free'
  return a === filter
}

/** The services Eclipse picks for you the first time, matched by name (Disney+ and NOW TV, as in the plan). */
export function guessServices(all: Provider[], names = ['disney plus', 'now tv', 'now']): number[] {
  const clean = (n: string): string => n.toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
  const found = all.filter((p) => names.includes(clean(p.name)))
  return [...new Set(found.map((p) => p.id))]
}

/** Whether one service streams it (or shows it free). Unknown availability (not checked yet) doesn't pass. */
export function onService(p: WatchProviders | null | undefined, serviceId: number): boolean {
  if (!p) return false
  return [...p.stream, ...p.free].some((s) => s.id === serviceId)
}

/**
 * The services to offer in Library's "Service" picker: yours first (in your order), then any
 * other service that streams or shows something in the list, most titles first.
 */
export function servicesIn(providers: (WatchProviders | null | undefined)[], mine: Provider[]): Provider[] {
  const counts = new Map<number, { p: Provider; n: number }>()
  for (const p of providers) {
    if (!p) continue
    const seen = new Set<number>()
    for (const s of [...p.stream, ...p.free]) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      const c = counts.get(s.id)
      if (c) c.n++
      else counts.set(s.id, { p: s, n: 1 })
    }
  }
  const mineIds = new Set(mine.map((m) => m.id))
  const others = [...counts.values()].filter((c) => !mineIds.has(c.p.id)).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name))
  return [...mine, ...others.map((c) => c.p)]
}
