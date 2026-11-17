import type { Library, LibraryEntry } from './types'
import { UNDATED, parseEpisodeKey } from './types'
import { eveningMinutes, nightsBetween, type Evenings } from './time'

/**
 * Phase 24: repair old dates. Ticking late leaves tell-tale batches, like 40 episodes all "watched"
 * on one day (common in the Sequel import). For each one you can spread the episodes back over your
 * usual evenings, mark them seen with no date, or leave them. Nothing changes until you choose.
 */

export interface Batch {
  /** "tv:1396@2023-03-04" */
  id: string
  key: string
  name: string
  day: string
  /** In watching order. */
  episodes: string[]
  /** The last day before this batch that you ticked an episode of it (or the day it was added). */
  since: string
}

const DAY = 86_400_000
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const order = (a: string, b: string): number => {
  const x = parseEpisodeKey(a)!
  const y = parseEpisodeKey(b)!
  return x.season - y.season || x.episode - y.episode
}

/** Days on which you ticked at least `min` episodes of one show (your first watch), biggest first. */
export function findBatches(library: Library, min = 8): Batch[] {
  const left = new Set(library.repairLeft ?? [])
  const out: Batch[] = []
  for (const e of Object.values(library.entries)) {
    if (e.type !== 'tv' || !e.episodes) continue
    const byDay = new Map<string, string[]>()
    for (const [k, day] of Object.entries(e.episodes)) {
      if (day === UNDATED || !parseEpisodeKey(k) || parseEpisodeKey(k)!.season === 0) continue
      byDay.set(day, [...(byDay.get(day) ?? []), k])
    }
    for (const [day, eps] of byDay) {
      const id = `${e.key}@${day}`
      if (eps.length < min || left.has(id)) continue
      const before = [...byDay.keys()].filter((d) => d < day).sort().pop()
      const added = e.addedAt.slice(0, 10)
      const since = before ?? (added < day ? added : addDays(day, -365))
      out.push({ id, key: e.key, name: e.title.name, day, episodes: eps.sort(order), since })
    }
  }
  return out.sort((a, b) => b.episodes.length - a.episodes.length || a.day.localeCompare(b.day))
}

export interface SpreadPlan {
  /** New day for each episode. */
  days: Record<string, string>
  perNight: number
  nights: number
  from: string
  to: string
}

/**
 * Spreads a batch back over your watching evenings, ending on the day you ticked them and never
 * before the last tick that came before: as many a night as fit in an evening (at least one).
 */
export function spreadBatch(batch: Batch, ev: Evenings, minutesEach = 45): SpreadPlan {
  const n = batch.episodes.length
  const fit = Math.max(1, Math.min(6, Math.floor(eveningMinutes(ev) / Math.max(1, minutesEach))))
  let available = nightsBetween(addDays(batch.since, 1), batch.day, ev)
  if (!available.length) available = [batch.day]
  const nightsNeeded = Math.ceil(n / fit)
  const nights = available.slice(-Math.min(nightsNeeded, available.length))
  const perNight = Math.ceil(n / nights.length)
  const days: Record<string, string> = {}
  batch.episodes.forEach((k, i) => (days[k] = nights[Math.min(nights.length - 1, Math.floor(i / perNight))]))
  return { days, perNight, nights: nights.length, from: nights[0], to: nights[nights.length - 1] }
}

export type RepairChoice = { kind: 'spread'; days: Record<string, string> } | { kind: 'undated' } | { kind: 'leave' }

/** Applies your choice for one batch (only to episodes still ticked on that day). */
export function repairBatch(library: Library, batch: Pick<Batch, 'id' | 'key' | 'day' | 'episodes'>, choice: RepairChoice, now: Date = new Date()): Library {
  if (choice.kind === 'leave') return { ...library, repairLeft: [...new Set([...(library.repairLeft ?? []), batch.id])] }
  const e = library.entries[batch.key]
  if (!e?.episodes) return library
  const episodes = { ...e.episodes }
  for (const k of batch.episodes) {
    if (episodes[k] !== batch.day) continue
    const day = choice.kind === 'undated' ? UNDATED : choice.days[k]
    if (day === UNDATED || /^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) episodes[k] = day!
  }
  const next: LibraryEntry = { ...e, episodes, updatedAt: now.toISOString() }
  // A show finished on the batch day: it was really finished on the last spread night.
  if (e.watchedOn === batch.day && choice.kind === 'spread') {
    const last = batch.episodes.map((k) => episodes[k]).filter((d) => d !== UNDATED).sort().pop()
    if (last) next.watchedOn = last
  }
  return { ...library, entries: { ...library.entries, [e.key]: next } }
}
