import { ArchiveRestore } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDate, formatShortDay, plural } from '@core/format'
import { localDate } from '@core/library'
import type { BackupInfo } from '@shared/api'
import { useApp } from '../store/app'

/** Settings, Phase 37: the daily backups, and putting one back. */
export default function BackupsCard(): React.JSX.Element {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const setLibrary = useApp((s) => s.setLibrary)

  useEffect(() => {
    window.api.listBackups().then(setBackups)
  }, [])

  const today = localDate(new Date())
  const restore = async (day: string): Promise<void> => {
    const r = await window.api.restoreBackup(day)
    setConfirm(null)
    if (r.ok) {
      setLibrary(r.value)
      setMessage(`Restored the backup from ${formatDate(day)}. Your library from before is kept beside it as library.before-restore-….json.`)
    } else setMessage(r.error)
    setBackups(await window.api.listBackups())
  }

  const latest = backups?.[0]
  return (
    <section className="card">
      <h2>Backups</h2>
      <p className="muted">
        Eclipse copies your library into a <em>backups</em> folder inside your data folder once a day. It keeps the last 14 days, plus one from each month before that.
      </p>
      <p className="small">{!backups ? '…' : latest ? `Latest: ${latest.day === today ? 'today' : formatDate(latest.day)} · ${plural(backups.length, 'backup')} kept` : 'No backups yet. The first is made when your library is saved.'}</p>
      {!!backups?.length && (
        <button className="btn glass" onClick={() => setOpen(!open)}>
          <ArchiveRestore size={16} /> {open ? 'Hide backups' : 'Restore a backup'}
        </button>
      )}
      {message && <p className="small" role="status" style={{ marginTop: 10 }}>{message}</p>}
      {open && backups && (
        <ul className="backup-list">
          {backups.map((b) => (
            <li key={b.day} className="backup-row">
              <div>
                <b>{b.day === today ? 'Today' : formatShortDay(b.day)}</b>
                <span className="muted small">
                  {b.day.slice(0, 4)} · {plural(b.titles, 'title')}, {plural(b.episodes, 'watched episode')}, {b.watched} watched
                </span>
              </div>
              {confirm === b.day ? (
                <span className="backup-confirm">
                  <span className="small">Replace your library with this copy?</span>
                  <button className="btn" onClick={() => setConfirm(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" onClick={() => restore(b.day)}>
                    Restore
                  </button>
                </span>
              ) : (
                <button className="btn glass" onClick={() => setConfirm(b.day)}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
