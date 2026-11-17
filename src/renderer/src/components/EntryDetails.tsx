import { useEffect, useState } from 'react'
import { localDate } from '@core/library'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'

/** Your own bits about something in your library: the day you watched it, a note, your rating. */
export default function EntryDetails({ titleKey }: { titleKey: TitleKey }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[titleKey])
  const setLibrary = useApp((s) => s.setLibrary)
  const [note, setNote] = useState(entry?.note ?? '')

  // Follow changes from elsewhere (e.g. the other computer), unless you're typing.
  useEffect(() => {
    if (document.activeElement?.id !== 'entry-note') setNote(entry?.note ?? '')
  }, [entry?.note])

  if (!entry) return null
  const saveNote = async (): Promise<void> => {
    if (note.trim() !== (entry.note ?? '')) setLibrary(await window.api.setNote(titleKey, note))
  }

  return (
    <div className="entry-details">
      {(entry.status === 'watched' || entry.watchedOn) && (
        <label className="entry-field">
          <span>Watched on</span>
          <input
            type="date"
            value={entry.watchedOn ?? ''}
            max={localDate(new Date())}
            onChange={async (e) => setLibrary(await window.api.setWatchedOn(titleKey, e.target.value || null))}
          />
        </label>
      )}
      <label className="entry-field grow">
        <span>Note</span>
        <input
          id="entry-note"
          type="text"
          maxLength={300}
          placeholder="e.g. watched with Dad at Christmas"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setNote(entry.note ?? '')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </label>
      {entry.rating !== undefined && (
        <div className="entry-field">
          <span>Your rating</span>
          <div className="entry-rating">★ {Number.isInteger(entry.rating) ? entry.rating : entry.rating.toFixed(1)}/10</div>
        </div>
      )}
    </div>
  )
}
