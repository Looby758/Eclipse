import { CalendarPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { preferencesOf } from '@core/library'
import { formatShortDay, plural } from '@core/format'
import type { ReleaseEvent } from '@core/calendar'
import { useApp } from '../store/app'

/** The release calendar: what's coming up, saved as a file for Google Calendar or Outlook. */
export default function CalendarCard(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const everyEpisode = preferencesOf(library).calendarEpisodes
  const [events, setEvents] = useState<ReleaseEvent[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api.calendarPreview().then((r) => {
      if (cancelled) return
      if (r.ok) {
        setEvents(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [library])

  const exportFile = async (): Promise<void> => {
    setSaving(true)
    setSaved('')
    const r = await window.api.calendarExport()
    setSaving(false)
    if (!r.ok) return setError(r.error)
    if (r.value.saved) setSaved(`Saved ${plural(r.value.count, 'date')} to ${r.value.path}.`)
  }

  return (
    <section className="card">
      <h2>Release calendar</h2>
      <p className="muted">Films on your watchlist and new seasons of shows you follow, as a file you add to Google Calendar or Outlook. Shows you’ve stopped are left out.</p>
      <div className="segmented" role="radiogroup" aria-label="What to include">
        {([false, true] as const).map((v) => (
          <button key={String(v)} role="radio" aria-checked={everyEpisode === v} className={everyEpisode === v ? 'on' : ''} onClick={async () => setLibrary(await window.api.setPreferences({ calendarEpisodes: v }))}>
            {v ? 'Every new episode' : 'New seasons, finales and films'}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!events && !error && <p className="muted small">Looking for what’s coming up…</p>}
      {events && events.length === 0 && <p className="muted">Nothing coming up yet. Add films to Want to watch, or follow a show, and its dates appear here.</p>}
      {events && events.length > 0 && (
        <ul className="calendar-preview">
          {events.slice(0, 8).map((e) => (
            <li key={e.uid}>
              <span className="calendar-day">
                {formatShortDay(e.date)} {e.date.slice(0, 4)}
              </span>
              <span className="calendar-title">{e.title}</span>
            </li>
          ))}
          {events.length > 8 && <li className="muted small">and {plural(events.length - 8, 'more date')}</li>}
        </ul>
      )}

      <div className="row">
        <button className="btn primary" onClick={exportFile} disabled={saving || !events?.length}>
          <CalendarPlus size={15} /> {saving ? 'Saving…' : 'Save calendar file'}
        </button>
      </div>
      {saved && <p className="notice">{saved}</p>}
      <p className="muted small calendar-help">
        To add it to Google Calendar: on calendar.google.com, open Settings, then Import &amp; export, and import the file. Making a calendar called “Eclipse” first and importing into that keeps these dates
        together, so you can delete it and import a fresh file whenever you like.
      </p>
    </section>
  )
}
