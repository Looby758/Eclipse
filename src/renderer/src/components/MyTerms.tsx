import { Hourglass } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'

/**
 * Phase 61, "My hours in my own terms": your time on a title compared with your own history
 * ("Breaking Bad three times over", "About as long as everything you watched in 2023"). Shows
 * nothing until there's enough time to compare.
 */
export default function MyTerms({ titleKey, className = '' }: { titleKey: TitleKey; className?: string }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[titleKey])
  // Worked out again when your ticks on it change, not on every library change.
  const ticks = entry ? Object.keys(entry.episodes ?? {}).length + (entry.rewatches?.length ?? 0) * 1000 + (entry.status === 'watched' ? 1e6 : 0) : 0
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    if (!entry) return setLines([])
    let live = true
    window.api.myTerms(titleKey).then((r) => {
      if (live && r.ok) setLines(r.value)
    })
    return () => {
      live = false
    }
  }, [titleKey, ticks])
  if (!lines.length) return null
  return (
    <ul className={`my-terms ${className}`} aria-label="Your time on it, in your own terms">
      {lines.map((l) => (
        <li key={l}>
          <Hourglass size={13} aria-hidden /> {l}
        </li>
      ))}
    </ul>
  )
}
