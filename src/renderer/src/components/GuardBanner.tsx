import { Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GuardStatus } from '@shared/api'

const kind = (p: string): string => (p === 'mac' ? ' (Mac)' : p === 'win' ? ' (Windows)' : '')
/** Catching up for longer than this (Drive stuck, or the other computer mid-sleep) is worth saying. */
const SLOW_MS = 2 * 60_000

/**
 * The two-computer guard (see src/core/guard.ts): the computer you're using saves, and switching
 * over takes a few seconds while Drive brings the latest library. That's normally invisible, since
 * ticks and status changes are handed over meanwhile. This only shows when something else was
 * refused, or when catching up is taking unusually long, with Take over for when it's stuck.
 */
export default function GuardBanner(): React.JSX.Element | null {
  const [s, setS] = useState<GuardStatus | null>(null)
  const [nudge, setNudge] = useState(0)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    void window.api.guardStatus().then(setS)
    const off = window.api.onGuardChanged(setS)
    // Trying to change something while read-only: the save is refused; show the banner saying why.
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

  // Back to saving here: start fresh. Still read-only after a while: say so.
  useEffect(() => {
    setSlow(false)
    if (!s?.readOnly) {
      setNudge(0)
      return
    }
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(t)
  }, [s?.readOnly, s?.waiting])

  if (!s?.readOnly || !s.other || (!nudge && !slow)) return null
  const where = `${s.other.computer}${kind(s.other.platform)}`
  return (
    <div className={`guard ${nudge ? 'nudge' : ''}`} key={nudge} role="status">
      <Lock size={16} />
      <div className="guard-text">
        <strong>Saving on {where}.</strong>{' '}
        {s.waiting === 'catching-up' ? `Eclipse is getting your latest changes from there before it saves here, so nothing's lost.` : `It was used in the last minute, so it's saving for now.`}{' '}
        <span className="muted">Ticks and status changes made here still count. Anything else can be done once this computer takes over, usually within a minute.</span>
      </div>
      <button className="btn glass" title="If it's stuck: save here now. The other copy stops saving." onClick={async () => setS(await window.api.takeOver())}>
        Take over
      </button>
    </div>
  )
}
