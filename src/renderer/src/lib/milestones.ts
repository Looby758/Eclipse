import { create } from 'zustand'
import { milestoneKeys, milestonesBetween, type Milestone } from '@core/milestones'
import type { StatDetails } from '@core/stats'
import type { Library } from '@core/types'
import { useApp } from '../store/app'

/** At most this many notes from one change; the rest are noted quietly. */
const MOST_AT_ONCE = 3

/** Phase 53: the milestone notes waiting to show, the one showing first. */
export const useMilestone = create<{ queue: Milestone[]; next(): void }>((set) => ({
  queue: [],
  next: () => set((s) => ({ queue: s.queue.slice(1) }))
}))

/** TMDB's runtimes, seasons and genres for the titles you've watched, fetched once and kept. */
const details: Record<string, StatDetails> = {}
async function fetchDetails(library: Library): Promise<void> {
  const missing = milestoneKeys(library).filter((k) => !details[k])
  if (!missing.length) return
  const got = await window.api.detailsMany(missing).catch(() => ({}))
  for (const [k, d] of Object.entries(got)) details[k] = { runtime: d.runtime, seasons: d.seasons, genres: d.genres }
}

/**
 * Watches the library for something you watch that takes you past a milestone, shows the note
 * once and notes it in the library. The first library seen is where it starts from, so opening
 * Eclipse never shows anything. Returns a function that stops watching.
 */
export function watchMilestones(): () => void {
  let before: Library | null = null
  let busy = Promise.resolve()
  return useApp.subscribe((s, old) => {
    if (s.library === old.library) return
    const after = s.library
    const from = before
    before = after
    if (!from) {
      busy = busy.then(() => fetchDetails(after)).catch(() => undefined)
      return
    }
    busy = busy.then(() => check(from, after)).catch(() => undefined)
  })
}

async function check(before: Library, after: Library): Promise<void> {
  await fetchDetails(after)
  const { milestones, quiet } = milestonesBetween(before, after, details)
  if (!milestones.length) return
  if (!quiet) {
    const show = milestones.filter((m) => !m.hidden).slice(0, MOST_AT_ONCE)
    useMilestone.setState((s) => ({ queue: [...s.queue, ...show] }))
  }
  const lib = await window.api.milestonesSeen(milestones.map((m) => m.id))
  // Only take the saved copy if nothing else changed meanwhile.
  if (useApp.getState().library === after) useApp.getState().setLibrary(lib)
}
