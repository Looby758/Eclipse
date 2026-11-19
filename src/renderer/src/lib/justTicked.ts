import { useEffect, useRef, useState } from 'react'

/** How long a fresh tick keeps its animation class. */
const HOLD_MS = 1100

/**
 * Phase 60, "Ticking feels good": which of `keys` were added since the last render (not on the
 * first one, so opening a page doesn't animate everything already ticked). `scope` resets it, e.g.
 * when another show or season opens. The set empties itself after about a second.
 */
export function useJustTicked(keys: Iterable<string>, scope: string): Set<string> {
  const list = [...keys]
  const sig = list.sort().join(',')
  const before = useRef<{ scope: string; keys: Set<string> } | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(list)
    const prev = before.current
    before.current = { scope, keys: now }
    if (!prev || prev.scope !== scope) return setFresh(new Set())
    const added = list.filter((k) => !prev.keys.has(k))
    if (!added.length) return
    setFresh(new Set(added))
    const t = window.setTimeout(() => setFresh(new Set()), HOLD_MS)
    return () => window.clearTimeout(t)
  }, [sig, scope])
  return fresh
}
