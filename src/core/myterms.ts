import { preferencesOf } from './library'
import { watchEvents, type StatDetails } from './stats'
import type { Library, TitleKey } from './types'

/**
 * Phase 61, "My hours in my own terms": the time you've spent on something, compared with your
 * own history rather than generic things like flights. "About as long as everything you watched in
 * 2023", "Breaking Bad three times over", "About 44 of your evenings".
 */

const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times', 'eight times', 'nine times', 'ten times']

/** Minutes in your usual evening, from when you start to bedtime (bedtime after midnight is fine). */
export function usualEvening(start: string, bedtime: string): number {
  const m = (t: string): number | null => {
    const x = /^(\d{1,2}):(\d{2})$/.exec(t)
    return x ? Number(x[1]) * 60 + Number(x[2]) : null
  }
  const a = m(start)
  const b = m(bedtime)
  if (a === null || b === null) return 0
  const len = b > a ? b - a : b + 1440 - a
  return len > 0 && len < 16 * 60 ? len : 0
}

/** Up to three comparisons for one title, most personal first. Empty when it's too little time to compare. */
export function myTerms(library: Library, details: Record<string, StatDetails | undefined>, key: TitleKey): string[] {
  const events = watchEvents(library, details)
  const byTitle = new Map<string, number>()
  for (const w of events) byTitle.set(w.key, (byTitle.get(w.key) ?? 0) + w.minutes)
  const mine = byTitle.get(key) ?? 0
  if (mine < 90) return []
  const entry = library.entries[key]
  const out: string[] = []

  // Another show you've finished, a whole number of times over ("Breaking Bad three times over").
  let best: { name: string; times: number; off: number } | null = null
  for (const [other, minutes] of byTitle) {
    const e = library.entries[other as TitleKey]
    if (other === key || !e || e.type !== 'tv' || e.status !== 'watched' || minutes < 240) continue
    const ratio = mine / minutes
    const times = Math.round(ratio)
    if (times < 2 || times > 10) continue
    const off = Math.abs(ratio - times) / times
    if (off > 0.12) continue
    // Closest to a whole number wins; a bigger show breaks a tie (it's the one you'll remember).
    if (!best || off < best.off - 0.02 || (Math.abs(off - best.off) <= 0.02 && minutes > (byTitle.get(best.name) ?? 0))) best = { name: other, times, off }
  }
  if (best) {
    const name = library.entries[best.name as TitleKey]!.title.name
    out.push(`${best.off <= 0.04 ? 'That’s' : 'About'} ${name} ${TIMES[best.times]} over`)
  }

  // A whole year of your watching ("About as long as everything you watched in 2023").
  const byYear = new Map<string, number>()
  const ownByYear = new Map<string, number>()
  for (const w of events) {
    if (!w.day) continue
    const y = w.day.slice(0, 4)
    byYear.set(y, (byYear.get(y) ?? 0) + w.minutes)
    if (w.key === key) ownByYear.set(y, (ownByYear.get(y) ?? 0) + w.minutes)
  }
  let year: { year: string; ratio: number } | null = null
  for (const [y, minutes] of byYear) {
    // Not a year this title was most of (it would only be comparing with itself).
    if (minutes < 600 || (ownByYear.get(y) ?? 0) > minutes / 2) continue
    const ratio = mine / minutes
    if (ratio >= 0.8 && ratio <= 1.25 && (!year || Math.abs(ratio - 1) < Math.abs(year.ratio - 1))) year = { year: y, ratio }
  }
  if (year) out.push(year.ratio > 1.08 ? `More than everything you watched in ${year.year}` : year.ratio < 0.92 ? `Nearly as long as everything you watched in ${year.year}` : `About as long as everything you watched in ${year.year}`)

  // All your films put together (for a show).
  if (entry?.type === 'tv') {
    const films = new Set<string>()
    let filmMinutes = 0
    for (const w of events) {
      if (w.type !== 'movie') continue
      films.add(w.key)
      filmMinutes += w.minutes
    }
    if (films.size >= 3 && mine > filmMinutes && mine < filmMinutes * 4) out.push(`Longer than all ${films.size} of your films put together`)
  }

  // Your evenings ("About 44 of your evenings").
  const p = preferencesOf(library)
  const evening = usualEvening(p.startTime, p.bedtime)
  if (evening >= 60) {
    const n = mine / evening
    if (n >= 1.5) out.push(`About ${Math.round(n)} of your evenings`)
    else if (n >= 0.75) out.push('About one of your evenings')
  }

  return out.slice(0, 3)
}
