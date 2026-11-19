import { create } from 'zustand'

/**
 * Phase 47: whether a show's ratings show TMDB's (everyone's) or Mine (your reactions). The same
 * choice for the heatmap and the Spotlight page's bars, remembered on this computer.
 */
export type HeatView = 'tmdb' | 'mine'

const KEY = 'eclipse.heatView'

function saved(): HeatView {
  try {
    return localStorage.getItem(KEY) === 'mine' ? 'mine' : 'tmdb'
  } catch {
    return 'tmdb'
  }
}

export const useHeatView = create<{ view: HeatView; set(view: HeatView): void }>((set) => ({
  view: saved(),
  set: (view) => {
    try {
      localStorage.setItem(KEY, view)
    } catch {
      // Not remembered; still used for now.
    }
    set({ view })
  }
}))
