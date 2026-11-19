import { useEffect, useState } from 'react'
import { localDate, recommenders } from '@core/library'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'
import StarRating from './StarRating'

/** Your own bits about something in your library: the day you watched it, a note, your rating. */
export default function EntryDetails({ titleKey }: { titleKey: TitleKey }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[titleKey])
  const setLibrary = useApp((s) => s.setLibrary)
  const [note, setNote] = useState(entry?.note ?? '')
  const [from, setFrom] = useState(entry?.from ?? '')
  const library = useApp((s) => s.library)

  // Follow changes from elsewhere (e.g. the other computer), unless you're typing.
  useEffect(() => {
    if (document.activeElement?.id !== 'entry-note') setNote(entry?.note ?? '')
  }, [entry?.note])
  useEffect(() => {
    if (document.activeElement?.id !== 'entry-from') setFrom(entry?.from ?? '')
  }, [entry?.from])

  if (!entry) return null
  const saveFrom = async (): Promise<void> => {
    if (from.trim() !== (entry.from ?? '')) setLibrary(await window.api.setFrom(titleKey, from))
  }
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
      <label className="entry-field">
        <span>From</span>
        <input
          id="entry-from"
          type="text"
          list="entry-from-list"
          maxLength={80}
          placeholder="Who recommended it?"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={saveFrom}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setFrom(entry.from ?? '')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <datalist id="entry-from-list">
          {recommenders(library).map((r) => (
            <option key={r.name} value={r.name} />
          ))}
        </datalist>
      </label>
      <div className="entry-field">
        <span>Your rating</span>
        <StarRating titleKey={entry.key} name={entry.title.name} />
      </div>
    </div>
  )
}
