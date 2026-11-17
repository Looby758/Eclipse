import { ExternalLink } from 'lucide-react'
import { playTarget } from '@core/watching'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'

/** "Continue on Disney+": opens the show where you watch it, learnt from your history (Phase 31). */
export default function ContinueButton({ titleKey, className = 'btn glass' }: { titleKey: TitleKey; className?: string }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[titleKey])
  const target = playTarget(entry)
  if (!target) return null
  return (
    <button className={className} onClick={() => void window.api.openExternal(target.url)}>
      <ExternalLink size={15} /> {target.label}
    </button>
  )
}
