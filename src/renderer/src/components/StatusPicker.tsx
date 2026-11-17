import { Bookmark, CircleCheck, CirclePause, CirclePlay, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TitleDetails, WatchStatus } from '@core/types'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { removeQuestion } from '@core/safety'
import { useApp } from '../store/app'
import { itemOf } from '../lib/item'

const ICONS: Record<WatchStatus, typeof Bookmark> = { want: Bookmark, watching: CirclePlay, watched: CircleCheck, stopped: CirclePause }

/** The four statuses as buttons; clicking the current one again does nothing, "Remove" takes it out (asking first if it has history). */
export default function StatusPicker({ details }: { details: TitleDetails }): React.JSX.Element {
  const entry = useApp((s) => s.library.entries[details.key])
  const setLibrary = useApp((s) => s.setLibrary)
  const [asking, setAsking] = useState(false)
  const keepRef = useRef<HTMLButtonElement>(null)

  const choose = async (status: WatchStatus | null): Promise<void> => {
    setAsking(false)
    setLibrary(await window.api.setStatus(itemOf(details), status))
  }
  const question = entry ? removeQuestion(entry) : null
  const remove = (): void => {
    if (question) setAsking(true)
    else void choose(null)
  }

  useEffect(() => {
    if (asking) keepRef.current?.focus()
  }, [asking])

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
          <button className="status-btn remove" onClick={remove} title="Remove from your library" aria-label="Remove from your library">
            <X size={16} />
          </button>
        )}
      </div>
      {asking && question && (
        <div
          className="confirm-remove"
          role="alertdialog"
          aria-label={question.title}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setAsking(false)
            }
          }}
        >
          <div>
            <b>{question.title}</b>
            <span>{question.detail}</span>
          </div>
          <div className="confirm-actions">
            <button ref={keepRef} className="btn" onClick={() => setAsking(false)}>
              Keep it
            </button>
            <button className="btn danger" onClick={() => choose(null)}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
