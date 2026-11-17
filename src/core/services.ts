import type { Library, LibraryEntry, Provider, TitleDetails, WatchProviders } from './types'
import { UNDATED, parseEpisodeKey } from './types'
import { activeEntry } from './library'
import { episodeMinutes, nextRenewal, timeLeft } from './time'

/**
 * Your services. Phase 19: what arrived on them and what left, found by comparing a small daily
 * snapshot of where your watchlist and shows are streaming. Phase 20: "Do I still need NOW TV this
 * month?", from how much you've queued on each and what you watched on it lately.
 */

// ---- Arriving and leaving ----

/** Where each title streams (or is free) on one day: provider ids by title key. */
export interface ServiceSnapshot {
  day: string
  titles: Record<string, number[]>
}

export interface ServiceEvent {
  day: string
  key: string
  name: string
  providerId: number
  provider: string
  kind: 'arrived' | 'left'
}

export interface ServiceHistory {
  snapshot: ServiceSnapshot | null
  /** Newest first. */
  events: ServiceEvent[]
}

export const emptyHistory = (): ServiceHistory => ({ snapshot: null, events: [] })

/** The provider ids a title streams on or is free on. */
export const streamingIds = (p: WatchProviders): number[] => [...new Set([...p.stream, ...p.free].map((s) => s.id))].sort((a, b) => a - b)

/**
 * Adds today's snapshot: titles in both snapshots that gained a service "arrived", ones that lost
 * one "left". Titles new to the snapshot (just added to your library) don't count as arrivals.
 * Only one snapshot a day; events older than `keepDays` are let go.
 */
export function updateHistory(
  h: ServiceHistory,
  next: ServiceSnapshot,
  names: Record<string, string>,
  providers: Record<number, string>,
  keepDays = 365
): ServiceHistory {
  if (h.snapshot?.day === next.day) return h
  const events: ServiceEvent[] = []
  const prev = h.snapshot
  if (prev) {
    for (const [key, now] of Object.entries(next.titles)) {
      const before = prev.titles[key]
      if (!before) continue
      const name = names[key] ?? key
      for (const id of now) if (!before.includes(id)) events.push({ day: next.day, key, name, providerId: id, provider: providers[id] ?? `Service ${id}`, kind: 'arrived' })
      for (const id of before) if (!now.includes(id)) events.push({ day: next.day, key, name, providerId: id, provider: providers[id] ?? `Service ${id}`, kind: 'left' })
    }
  }
  const cutoff = addDays(next.day, -keepDays)
  return { snapshot: next, events: [...events, ...h.events].filter((e) => e.day >= cutoff) }
}

export function normalizeHistory(raw: unknown): ServiceHistory {
  if (!raw || typeof raw !== 'object') return emptyHistory()
  const r = raw as Partial<ServiceHistory>
  const snap = r.snapshot && typeof r.snapshot === 'object' && typeof r.snapshot.day === 'string' && r.snapshot.titles && typeof r.snapshot.titles === 'object' ? r.snapshot : null
  const events = Array.isArray(r.events)
    ? r.events.filter((e): e is ServiceEvent => !!e && typeof e.day === 'string' && typeof e.key === 'string' && typeof e.providerId === 'number' && (e.kind === 'arrived' || e.kind === 'left'))
    : []
  return { snapshot: snap, events }
}

/** Recent news on your services, grouped: "Just arrived on Disney+: Andor, Loki". */
export function servicesNews(h: ServiceHistory, mine: number[], today: string, days = 14): { provider: string; providerId: number; kind: 'arrived' | 'left'; titles: { key: string; name: string }[] }[] {
  const since = addDays(today, -days)
  const groups = new Map<string, { provider: string; providerId: number; kind: 'arrived' | 'left'; titles: { key: string; name: string }[] }>()
  for (const e of h.events) {
    if (e.day < since || !mine.includes(e.providerId)) continue
    const id = `${e.kind}:${e.providerId}`
    const g = groups.get(id) ?? { provider: e.provider, providerId: e.providerId, kind: e.kind, titles: [] }
    if (!g.titles.some((t) => t.key === e.key)) g.titles.push({ key: e.key, name: e.name })
    groups.set(id, g)
  }
  return [...groups.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'arrived' ? -1 : 1) || b.titles.length - a.titles.length)
}

// ---- "Do I still need it?" ----

export interface ServiceReport {
  provider: Provider
  /** Your watchlist, Watch soon and what you're watching that's on it, with time left. */
  queued: { key: string; name: string; minutes: number }[]
  queuedMinutes: number
  /** Watched in the last 30 days, of things on it now. */
  recentMinutes: number
  recentTitles: string[]
  /** The next renewal day (YYYY-MM-DD), if you've said which day of the month it renews. */
  renews: string | null
  daysToRenewal: number | null
  /** Pause it: nothing you want is on it and it renews within a week (or you haven't said when). */
  pause: boolean
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Minutes you watched of a title since `since` (episodes ticked, a film watched, rewatches included). */
function watchedSince(e: LibraryEntry, d: TitleDetails | undefined, since: string): number {
  if (e.type === 'movie') {
    const days = [e.watchedOn, ...(e.rewatches ?? []).map((r) => r.finishedOn)].filter((x): x is string => !!x && x >= since)
    return days.length * (d?.runtime ?? 120)
  }
  const per = d ? episodeMinutes(d) : 45
  let n = 0
  for (const ticks of [e.episodes ?? {}, ...(e.rewatches ?? []).map((r) => r.episodes ?? {})]) {
    for (const [k, day] of Object.entries(ticks)) if (parseEpisodeKey(k) && day !== UNDATED && day >= since) n++
  }
  return n * per
}

export function serviceReports(
  library: Library,
  services: Provider[],
  providers: Record<string, WatchProviders>,
  details: Record<string, TitleDetails>,
  renewals: Record<string, number>,
  today: string
): ServiceReport[] {
  const soon = new Set<string>((library.watchSoon ?? []).map((r) => r.key))
  const since = addDays(today, -30)
  return services.map((provider) => {
    const on = (key: string): boolean => !!providers[key] && streamingIds(providers[key]).includes(provider.id)
    const queued: ServiceReport['queued'] = []
    let recentMinutes = 0
    const recentTitles: string[] = []
    for (const raw of Object.values(library.entries)) {
      const e = activeEntry(raw)!
      if (!on(e.key)) continue
      const d = details[e.key]
      if ((e.status === 'want' || e.status === 'watching' || soon.has(e.key)) && d) {
        const left = timeLeft(d, e, today)
        if (left.minutes > 0) queued.push({ key: e.key, name: e.title.name, minutes: left.minutes })
      }
      const m = watchedSince(raw, d, since)
      if (m > 0) {
        recentMinutes += m
        recentTitles.push(e.title.name)
      }
    }
    queued.sort((a, b) => Number(soon.has(b.key)) - Number(soon.has(a.key)) || b.minutes - a.minutes)
    const day = renewals[String(provider.id)]
    const renews = day ? nextRenewal(day, today) : null
    const daysToRenewal = renews ? daysBetween(today, renews) : null
    const queuedMinutes = queued.reduce((n, q) => n + q.minutes, 0)
    return { provider, queued, queuedMinutes, recentMinutes, recentTitles, renews, daysToRenewal, pause: queuedMinutes === 0 && (daysToRenewal === null || daysToRenewal <= 7) }
  })
}

// ---- Which services to get (best for your watchlist) ----

export interface WantedTitle {
  key: string
  name: string
  /** What's left of it to watch. */
  minutes: number
}

export interface ServiceCover {
  provider: Provider
  /** One of the services you already pay for. */
  mine: boolean
  titles: WantedTitle[]
  minutes: number
}

export interface BestServices {
  /** Every subscription service with something you want, most hours first. */
  ranking: ServiceCover[]
  /** The fewest services that cover the most: each one adds what the ones before it don't have. */
  combo: (ServiceCover & { adds: WantedTitle[]; addsMinutes: number })[]
  /** Free to watch (BBC iPlayer, ITVX, Channel 4, My5…), so no subscription needed. */
  free: WantedTitle[]
  /** Not on any subscription or free service (rent or buy, or nowhere). */
  nowhere: WantedTitle[]
  /** Titles not checked yet. */
  unchecked: number
}

const sumMinutes = (ts: WantedTitle[]): number => ts.reduce((n, t) => n + t.minutes, 0)

/**
 * Which streaming services would get you the most of your watchlist: a ranking of every service by
 * hours of what you want on it, and a short list (up to `size`) that covers the most between them.
 * Ad-supported tiers ("Netflix Standard with Ads") count as the service itself.
 */
export function bestServices(titles: WantedTitle[], providers: Record<string, WatchProviders | undefined>, myServices: number[], size = 3): BestServices {
  const byId = new Map<number, ServiceCover>()
  const free: WantedTitle[] = []
  const nowhere: WantedTitle[] = []
  let unchecked = 0
  for (const t of titles) {
    if (t.minutes <= 0) continue
    const p = providers[t.key]
    if (!p) {
      unchecked++
      continue
    }
    const stream = p.stream.filter((s) => !/with ads/i.test(s.name))
    if (!stream.length) {
      if (p.free.length) free.push(t)
      else nowhere.push(t)
      continue
    }
    for (const s of stream) {
      const c = byId.get(s.id) ?? { provider: s, mine: myServices.includes(s.id), titles: [], minutes: 0 }
      if (!c.titles.some((x) => x.key === t.key)) {
        c.titles.push(t)
        c.minutes += t.minutes
      }
      byId.set(s.id, c)
    }
  }
  const ranking = [...byId.values()].sort((a, b) => b.minutes - a.minutes || b.titles.length - a.titles.length || a.provider.name.localeCompare(b.provider.name))

  // Greedy: each step takes the service that adds the most hours not already covered.
  const combo: BestServices['combo'] = []
  const covered = new Set<string>()
  while (combo.length < size) {
    let best: BestServices['combo'][number] | null = null
    for (const c of ranking) {
      if (combo.some((x) => x.provider.id === c.provider.id)) continue
      const adds = c.titles.filter((t) => !covered.has(t.key))
      const addsMinutes = sumMinutes(adds)
      if (addsMinutes > 0 && (!best || addsMinutes > best.addsMinutes || (addsMinutes === best.addsMinutes && c.mine && !best.mine))) best = { ...c, adds, addsMinutes }
    }
    if (!best) break
    combo.push(best)
    for (const t of best.adds) covered.add(t.key)
  }
  return { ranking, combo, free, nowhere, unchecked }
}
