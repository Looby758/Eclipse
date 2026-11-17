import { Download } from 'lucide-react'
import { useState } from 'react'

/** Settings: save everything (library.json plus CSV spreadsheets) to a folder you pick. */
export default function ExportCard(): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await window.api.exportData()
      if (!r.ok) setMessage(`Couldn’t save it: ${r.error}`)
      else if (r.value.saved) setMessage(`Saved to ${r.value.path}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Export your data</h2>
      <p className="muted">
        Saves everything in a new folder: <strong>library.json</strong> (all of it, which Eclipse can open again) and spreadsheets for Excel or Google Sheets: your titles, every episode
        you’ve ticked, your rewatches and your lists.
      </p>
      <div className="row">
        <button className="btn glass" disabled={busy} onClick={run}>
          <Download size={16} /> {busy ? 'Saving…' : 'Export everything'}
        </button>
      </div>
      {message && <p className="muted small path">{message}</p>}
    </section>
  )
}
