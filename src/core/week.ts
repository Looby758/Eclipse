import { localDate } from './library'
import { budgetPerNight, episodeMinutes, slotsOn, tonight, weekStart, type Evenings } from './time'
import type { Library, TitleDetails } from './types'

/**
 * The weekly budget (phase 35): how much you've watched this week (Monday to Sunday) and how much
 * of "about 10 hours a week" is left. Counted from the days on your ticks, including rewatches.
 */

export interface WeekSoFar {
  /** Monday of this week. */
  from: string
  watchedMinutes: number
  budgetMinutes: number
  /** What's left of the budget (never below 0). */
  leftMinutes: number
  /** Watching nights still to come this week, tonight included if there's time left. */
  nightsLeft: number
}

const inRange = (day: string | undefined | null, from: string, to: string): boolean => !!day && day >= from && day <= to

/** Minutes watched between two days (inclusive), from episode and film dates. */
export function watchedMinutes(library: Library, details: Record<string, Pick<TitleDetails, 'runtime'> | undefined>, from: string, to: string): number {
  let total = 0
  for (const e of Object.values(library.entries)) {
    const d = details[e.key]
    if (e.type === 'tv') {
      const each = episodeMinutes(d ?? { runtime: null })
      const days = [...Object.values(e.episodes ?? {}), ...(e.rewatches ?? []).flatMap((r) => Object.values(r.episodes ?? {}))]
      total += days.filter((x) => inRange(x, from, to)).length * each
    } else {
      const each = d?.runtime || 120
      const days = [e.watchedOn, ...(e.rewatches ?? []).map((r) => r.finishedOn)]
      total += days.filter((x) => inRange(x, from, to)).length * each
    }
  }
  return total
}

export function weekSoFar(library: Library, details: Record<string, Pick<TitleDetails, 'runtime'> | undefined>, now: Date, ev: Evenings): WeekSoFar | null {
  const budget = ev.weeklyBudgetMinutes ?? 0
  if (!budget || budgetPerNight(ev) === null) return null
  const t = tonight(now, ev)
  const from = weekStart(t.day)
  const watched = watchedMinutes(library, details, from, localDate(now))
  let nightsLeft = t.minutesLeft > 0 ? 1 : 0
  const [y, m, d] = t.day.split('-').map(Number)
  for (let i = 1; i < 7; i++) {
    const day = localDate(new Date(y, m - 1, d + i))
    if (weekStart(day) !== from) break
    if (slotsOn(day, ev).length) nightsLeft++
  }
  return { from, watchedMinutes: watched, budgetMinutes: budget, leftMinutes: Math.max(0, budget - watched), nightsLeft }
}
