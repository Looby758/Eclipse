import { useApp, type View } from '../store/app'

/**
 * Back keeps your place: each page's scroll position, by where it sits in your history, so going
 * back to Library or a list lands where you were rather than at the top. Positions for pages you've
 * left by going back (or replaced) are forgotten, so opening a page afresh always starts at the top.
 */
const saved = new Map<string, number>()

const keyFor = (depth: number, view: View): string => `${depth}|${JSON.stringify(view)}`

/** The key for the page showing now. */
export const currentScrollKey = (): string => {
  const { history } = useApp.getState()
  return keyFor(history.length, history[history.length - 1])
}

export const rememberScroll = (key: string, top: number): void => {
  saved.set(key, top)
}

export const savedScroll = (key: string): number | undefined => saved.get(key)

/** Keeps only positions for pages still in your history (exported for tests). */
export const pruneScroll = (history: View[]): void => {
  const live = new Set(history.map((v, i) => keyFor(i + 1, v)))
  for (const key of [...saved.keys()]) if (!live.has(key)) saved.delete(key)
}

useApp.subscribe((s, prev) => {
  if (s.history !== prev.history) pruneScroll(s.history)
})
