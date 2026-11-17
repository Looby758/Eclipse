import { FileArchive, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { ImportSummary } from '@core/sequel'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { plural } from '@core/format'
import { useApp } from '../store/app'

/** Settings → Import from Sequel: pick the export, see what's in it, then bring it in. */
export default function SequelImportCard(): React.JSX.Element {
  const setLibrary = useApp((s) => s.setLibrary)
  const hasFolder = useApp((s) => !!s.status?.dataFolder)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (folder: boolean): Promise<void> => {
    setError('')
    setDone('')
    const r = await window.api.pickSequel(folder)
    if (!r.ok) return setError(r.error)
    if (r.value) setSummary(r.value)
  }
  const apply = async (): Promise<void> => {
    setBusy(true)
    const r = await window.api.applySequel()
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setLibrary(r.value)
    setDone(`Imported. ${summary ? `${plural(summary.added, 'title')} added${summary.merged ? `, ${summary.merged} merged with what you had` : ''}.` : ''} Your old library.json was copied aside first, in case.`)
    setSummary(null)
  }

  return (
    <section className="card">
      <h2>Import from Sequel</h2>
      {!summary && (
        <>
          <p className="muted">Bring over your films, shows, watched episodes and ratings. In Sequel, export your library, then pick the .zip it makes (or the folder it unzips to). Nothing is saved until you’ve seen what’s in it.</p>
          <div className="row">
            <button className="btn glass" disabled={!hasFolder} onClick={() => pick(false)}>
              <FileArchive size={16} /> Choose export file
            </button>
            <button className="btn glass" disabled={!hasFolder} onClick={() => pick(true)}>
              <FolderOpen size={16} /> Choose unzipped folder
            </button>
          </div>
        </>
      )}
      {summary && (
        <div className="import-preview">
          <p>
            <b>{plural(summary.films, 'film')}</b> and <b>{plural(summary.shows, 'show')}</b>, with <b>{plural(summary.episodes, 'watched episode')}</b>
            {summary.ratings ? (
              <>
                {' '}
                and <b>{plural(summary.ratings, 'rating')}</b> (doubled to be out of 10)
              </>
            ) : null}
            {summary.notes ? <>, plus {plural(summary.notes, 'note')}</> : null}.
          </p>
          <ul className="import-stats">
            {WATCH_STATUSES.filter((s) => summary.byStatus[s]).map((s) => (
              <li key={s}>
                <span className={`status-dot status-${s}`} /> {STATUS_LABELS[s]}: {summary.byStatus[s]}
              </li>
            ))}
          </ul>
          <p className="muted small">
            {summary.added} new to Eclipse{summary.merged ? `, ${summary.merged} already here (what you have in Eclipse wins; episodes are combined)` : ''}.
            {Object.keys(summary.lists).length ? ` Lists kept: ${Object.entries(summary.lists).map(([n, c]) => `${n} (${c})`).join(', ')}.` : ''}
            {summary.skippedOther ? ` ${plural(summary.skippedOther, 'book or game', 'books and games')} skipped.` : ''}
            {summary.skippedNoId.length ? ` Skipped, as TMDB doesn’t know them: ${summary.skippedNoId.join(', ')}.` : ''}
          </p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={apply}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button
              className="btn glass"
              disabled={busy}
              onClick={() => {
                window.api.cancelSequel()
                setSummary(null)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {!hasFolder && <p className="muted small">Choose a data folder first.</p>}
      {done && <p className="ok">{done}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
