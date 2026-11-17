import { Bookmark, CircleCheck, CirclePause, CirclePlay, X } from 'lucide-react'
import type { TitleDetails, WatchStatus } from '@core/types'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { useApp } from '../store/app'
import { itemOf } from '../lib/item'

const ICONS: Record<WatchStatus, typeof Bookmark> = { want: Bookmark, watching: CirclePlay, watched: CircleCheck, stopped: CirclePause }

/** The four statuses as buttons; clicking the current one again does nothing, "Remove" takes it out. */
export default function StatusPicker({ details }: { details: TitleDetails }): React.JSX.Element {
  const entry = useApp((s) => s.library.entries[details.key])
  const setLibrary = useApp((s) => s.setLibrary)

  const choose = async (status: WatchStatus | null): Promise<void> => {
    setLibrary(await window.api.setStatus(itemOf(details), status))
  }

  return (
    <div className="status-picker">
      <div className="status-buttons" role="radiogroup" aria-label="Status">
        {WATCH_STATUSES.map((s) => {
          const Icon = ICONS[s]
          const on = entry?.status === s
          return (
            <button key={s} role="radio" aria-checked={on} className={`status-btn status-${s} ${on ? 'on' : ''}`} onClick={() => !on && choose(s)}>
              <Icon size={16} /> {STATUS_LABELS[s]}
            </button>
          )
        })}
        {entry && (
          <button className="status-btn remove" onClick={() => choose(null)} title="Remove from your library">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
