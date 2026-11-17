import { create } from 'zustand'

/** Spotlight (the new Home, Phase 34) or Classic (the Drift home from before). Remembered on this computer. */
export type HomeStyle = 'spotlight' | 'classic'

const KEY = 'eclipse.homeStyle'

function saved(): HomeStyle {
  try {
    return localStorage.getItem(KEY) === 'classic' ? 'classic' : 'spotlight'
  } catch {
    return 'spotlight'
  }
}

export const useHomeStyle = create<{ style: HomeStyle; set(style: HomeStyle): void }>((set) => ({
  style: saved(),
  set: (style) => {
    try {
      localStorage.setItem(KEY, style)
    } catch {
      // Not remembered; still used for now.
    }
    set({ style })
  }
}))
