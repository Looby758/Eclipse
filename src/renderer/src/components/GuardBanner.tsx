import { Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GuardStatus } from '@shared/api'

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const kind = (p: string): string => (p === 'mac' ? ' (Mac)' : p === 'win' ? ' (Windows)' : '')

/**
 * Shown while another computer has Eclipse open on the same library: this copy is read-only, so
 * the two never overwrite each other. Take over if the other one was left open by mistake.
 */
export default function GuardBanner(): React.JSX.Element | null {
  const [s, setS] = useState<GuardStatus | null>(null)
  const [nudge, setNudge] = useState(0)

  useEffect(() => {
    void window.api.guardStatus().then(setS)
    const off = window.api.onGuardChanged(setS)
    // Trying to change something while read-only: the save is refused; make the banner say why.
    const refused = (e: PromiseRejectionEvent): void => {
      if (String(e.reason?.message ?? e.reason).includes('read-only')) {
        e.preventDefault()
        setNudge((n) => n + 1)
      }
    }
    window.addEventListener('unhandledrejection', refused)
    return () => {
      off()
      window.removeEventListener('unhandledrejection', refused)
    }
  }, [])

  if (!s?.readOnly || !s.other) return null
  const where = `${s.other.computer}${kind(s.other.platform)}`
  return (
    <div className={`guard ${nudge ? 'nudge' : ''}`} key={nudge} role="status">
      <Lock size={16} />
      <div className="guard-text">
        <strong>Read-only.</strong>{' '}
        {s.takenOver ? `Eclipse was taken over on ${where}.` : `Eclipse is open on ${where} (since ${time(s.other.since)}).`}{' '}
        <span className="muted">Ticking episodes and changing a title’s status still work: they’re handed to {s.other.computer} to save. Other changes wait until you close it there, so the two copies don’t overwrite each other.</span>
      </div>
      <button className="btn glass" title="If it was left open by mistake. The other copy turns read-only." onClick={async () => setS(await window.api.takeOver())}>
        Take over
      </button>
    </div>
  )
}
