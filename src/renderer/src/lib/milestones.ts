import { create } from 'zustand'
import { milestonesBetween, showsTickedSince, type Milestone } from '@core/milestones'
import type { Library } from '@core/types'
import { useApp } from '../store/app'

/** Phase 53: the milestone note showing now, if any. */
export const useMilestone = create<{ note: Milestone | null; clear(): void }>((set) => ({
  note: null,
  clear: () => set({ note: null })
}))

/**
 * Watches the library for a tick (or a watched film) that takes you past a milestone, shows the
 * note once and notes it in the library. The first library seen is where it starts from, so
 * opening Eclipse never shows anything. Returns a function that stops watching.
 */
export function watchMilestones(): () => void {
  let before: Library | null = null
  let busy = Promise.resolve()
  return useApp.subscribe((s, old) => {
    if (s.library === old.library) return
    const after = s.library
    const from = before
    before = after
    if (!from) return
    busy = busy.then(() => check(from, after)).catch(() => undefined)
  })
}

async function check(before: Library, after: Library): Promise<void> {
  const shows = showsTickedSince(before, after)
  // Hours with a show need its episode length: from TMDB's saved details, 45 minutes if unknown.
  const details = shows.length ? await window.api.detailsMany(shows).catch(() => ({})) : {}
  const runtimes = Object.fromEntries(shows.map((k) => [k, (details as Record<string, { runtime: number | null }>)[k]?.runtime ?? null]))
  const { milestones, quiet } = milestonesBetween(before, after, runtimes)
  if (!milestones.length) return
  if (!quiet) useMilestone.setState({ note: milestones[0] })
  const lib = await window.api.milestonesSeen(milestones.map((m) => m.id))
  // Only take the saved copy if nothing else changed meanwhile.
  if (useApp.getState().library === after) useApp.getState().setLibrary(lib)
}
