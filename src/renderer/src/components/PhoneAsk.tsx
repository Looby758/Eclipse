import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import type { PhoneAsk as Ask } from '@shared/api'

/**
 * Phase 45: when something you did on your phone clashes with this computer (an episode ticked on
 * both on different days, a title removed here but ticked there), asks which to keep, one at a time.
 * Everything else from the phone has already been added without asking.
 */
export default function PhoneAsk(): React.JSX.Element | null {
  const [asks, setAsks] = useState<Ask[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.api.phoneAsks().then(setAsks)
    return window.api.onPhoneAsks(setAsks)
  }, [])
  const ask = asks[0]
  if (!ask) return null
  const choose = async (choice: 'phone' | 'computer'): Promise<void> => {
    setBusy(true)
    try {
      setAsks(await window.api.resolvePhoneAsk(ask.id, choice))
    } finally {
      setBusy(false)
    }
  }
  const phoneLabel = ask.kind === 'removed' ? 'Add it back' : ask.kind === 'episodeDay' ? "Use the phone's days" : "Use the phone's"
  const mineLabel = ask.kind === 'removed' ? 'Leave it removed' : ask.kind === 'episodeDay' ? 'Keep these days' : 'Keep this one'
  return (
    <div className="start-ask phone-ask" role="dialog" aria-label="Your phone and this computer disagree">
      <Smartphone size={20} className="start-ask-icon" />
      <div className="start-ask-text">
        <b>
          Your phone and this computer disagree{asks.length > 1 ? ` (1 of ${asks.length})` : ''}
        </b>
        <span>{ask.text}</span>
      </div>
      <div className="start-ask-actions">
        <button className="btn" disabled={busy} onClick={() => choose('computer')}>
          {mineLabel}
        </button>
        <button className="btn primary" disabled={busy} onClick={() => choose('phone')}>
          {phoneLabel}
        </button>
      </div>
    </div>
  )
}
