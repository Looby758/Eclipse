import { Power } from 'lucide-react'
import { useStartAsk } from '../lib/startAsk'

/** Phase 38: the one-time "Start Eclipse when your computer starts?" question. */
export default function StartAsk(): React.JSX.Element | null {
  const { reason, close } = useStartAsk()
  if (!reason) return null
  const yes = async (): Promise<void> => {
    await window.api.setStartAtLogin(true)
    close()
  }
  const notNow = async (): Promise<void> => {
    await window.api.markStartAsked()
    close()
  }
  return (
    <div className="start-ask" role="dialog" aria-label="Start Eclipse with your computer?">
      <Power size={20} className="start-ask-icon" />
      <div className="start-ask-text">
        <b>Start Eclipse when your computer starts, so it can {reason}?</b>
        <span>It opens quietly in the {window.api.platform === 'mac' ? 'menu bar' : 'system tray'}, with no window. You can change this any time in Settings. This is the only time Eclipse asks.</span>
      </div>
      <div className="start-ask-actions">
        <button className="btn" onClick={notNow}>
          Not now
        </button>
        <button className="btn primary" onClick={yes}>
          Yes, start with my computer
        </button>
      </div>
    </div>
  )
}
