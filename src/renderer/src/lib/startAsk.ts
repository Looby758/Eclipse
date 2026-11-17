import { create } from 'zustand'

/**
 * Phase 38: the first time you switch on something that only works while Eclipse is running, ask
 * once whether it should start with the computer. Never asked again after Yes or Not now.
 */

interface StartAsk {
  /** What was just switched on ("notice what you watch"), while the question shows. */
  reason: string | null
  close(): void
}

export const useStartAsk = create<StartAsk>((set) => ({
  reason: null,
  close: () => set({ reason: null })
}))

/** Call after switching a background feature on. */
export async function askToStartWithComputer(reason: string): Promise<void> {
  const s = await window.api.loginStatus()
  if (!s.supported || s.on || s.asked) return
  useStartAsk.setState({ reason })
}

export const startLabel = (): string => (window.api.platform === 'mac' ? 'Start when I log in' : 'Start with Windows')
