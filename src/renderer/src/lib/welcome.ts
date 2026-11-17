import { create } from 'zustand'
import type { AppStatus } from '@shared/api'

/** Phase 42: the welcome steps for someone new. */
export type WelcomeStep = 'hello' | 'data' | 'key' | 'services' | 'sequel'

export const WELCOME_STEPS: WelcomeStep[] = ['hello', 'data', 'key', 'services', 'sequel']

interface Welcome {
  /** null once you're through (or for anyone already set up). */
  step: WelcomeStep | null
  go(step: WelcomeStep | null): void
}

export const useWelcome = create<Welcome>((set) => ({
  step: null,
  go: (step) => set({ step })
}))

/** On opening: a brand-new copy starts at the beginning; one with a folder but no key starts at the key. */
export function startWelcome(status: AppStatus): void {
  if (!status.dataFolder) useWelcome.getState().go('hello')
  else if (!status.dataFolderMissing && !status.hasKey) useWelcome.getState().go('key')
}
