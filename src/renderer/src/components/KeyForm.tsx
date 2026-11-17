import { useState } from 'react'
import { useApp } from '../store/app'

const TMDB_KEY_PAGE = 'https://www.themoviedb.org/settings/api'

/** Paste a TMDB key: it's checked with TMDB, then saved encrypted. */
export default function KeyForm({ replacing }: { replacing?: boolean }): React.JSX.Element {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setStatus = useApp((s) => s.setStatus)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError('')
    const r = await window.api.setTmdbKey(key)
    setBusy(false)
    if (r.ok) {
      setKey('')
      setStatus(r.value)
    } else setError(r.error)
  }

  return (
    <form
      className="key-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="row">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={replacing ? 'Paste a new key to replace it' : 'Paste your TMDB API key'} autoComplete="off" spellCheck={false} />
        <button className="btn primary" disabled={busy || !key.trim()}>
          {busy ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Free from{' '}
        <a
          href={TMDB_KEY_PAGE}
          onClick={(e) => {
            e.preventDefault()
            window.api.openExternal(TMDB_KEY_PAGE)
          }}
        >
          themoviedb.org → Settings → API
        </a>
        . Either the “API Key” or the longer “API Read Access Token” works. It’s stored encrypted on this computer and never in your data folder.
      </p>
    </form>
  )
}
