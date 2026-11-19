import { X } from 'lucide-react'
import { useEffect } from 'react'
import Logo from './Logo'
import { useMilestone } from '../lib/milestones'

const SHOW_FOR = 9000

/**
 * Phase 53: a milestone, shown once as a small note at the top of the window, with a soft flare in
 * the eclipse's halo. It fades by itself; click it to put it away sooner.
 */
export default function MilestoneNote(): React.JSX.Element | null {
  const note = useMilestone((s) => s.note)
  const clear = useMilestone((s) => s.clear)

  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(clear, SHOW_FOR)
    return () => window.clearTimeout(t)
  }, [note])

  if (!note) return null
  return (
    <div className="milestone" role="status" aria-live="polite" key={note.id} onClick={clear}>
      <span className="milestone-halo" aria-hidden>
        <Logo size={30} />
      </span>
      <span className="milestone-text">
        <span className="milestone-line">{note.text}</span>
        {note.detail && <span className="milestone-detail">{note.detail}</span>}
      </span>
      <button className="milestone-close" aria-label="Close" onClick={clear}>
        <X size={14} />
      </button>
    </div>
  )
}
