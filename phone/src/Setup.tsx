import { useState } from 'react'
import { normalizeLibrary } from '@core/library'
import { createTmdb, TmdbError } from '@core/tmdb'
import { isConfigured } from './config'
import { accessToken, pick, readJson, signIn, SignInNeeded } from './google'
import { usePhone } from './store'
import { Logo } from './Logo'

/**
 * The first time on the phone: sign in with Google, point the page at your Eclipse folder and its
 * library.json (Google's own picker, so the page can see only those), then your TMDB key.
 */
export default function Setup(): React.JSX.Element {
  const drive = usePhone((s) => s.drive)
  const missing = usePhone((s) => s.libraryMissing)
  const signedIn = !!accessToken()
  const step = !isConfigured() ? 'config' : !drive || missing ? (signedIn ? 'folder' : 'signIn') : 'tmdb'
  return (
    <main className="setup">
      <Logo size={64} />
      <h1>Eclipse</h1>
      {step === 'config' && <NotConfigured />}
      {step === 'signIn' && <SignIn />}
      {step === 'folder' && <PickFolder again={missing} />}
      {step === 'tmdb' && <TmdbKey />}
      <ol className="setup-steps" aria-label="Steps">
        {['Sign in', 'Your folder', 'TMDB key'].map((s, i) => (
          <li key={s} className={i < ['signIn', 'folder', 'tmdb'].indexOf(step) ? 'done' : i === ['signIn', 'folder', 'tmdb'].indexOf(step) ? 'now' : ''}>
            {s}
          </li>
        ))}
      </ol>
    </main>
  )
}

function NotConfigured(): React.JSX.Element {
  return (
    <section className="setup-card">
      <h2>Nearly there</h2>
      <p>This page isn't connected to Google yet. Once the sign-in details from Google Cloud are added, it'll ask you to sign in here.</p>
    </section>
  )
}

function SignIn(): React.JSX.Element {
  return (
    <section className="setup-card">
      <h2>Your library, on your phone</h2>
      <p>Eclipse reads your library straight from your Google Drive. Sign in with the Google account that has your Eclipse folder.</p>
      <p className="fine">It can only see the folder you pick next, nothing else in your Drive.</p>
      <button className="btn primary wide" onClick={() => signIn(false)}>
        Sign in with Google
      </button>
    </section>
  )
}

function PickFolder({ again }: { again: boolean }): React.JSX.Element {
  const setDrive = usePhone((s) => s.setDrive)
  const refresh = usePhone((s) => s.refresh)
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (job: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (err) {
      if (err instanceof SignInNeeded) return signIn(true)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const pickFolder = (): Promise<void> =>
    run(async () => {
      const f = await pick('folder')
      if (f) setFolder(f)
    })

  const pickLibrary = (): Promise<void> =>
    run(async () => {
      const f = await pick('file', folder!.id)
      if (!f) return
      if (!/\.json$/i.test(f.name)) throw new Error(`That's "${f.name}". Pick the file called library.json.`)
      const raw = await readJson(f.id)
      if (!raw || typeof raw !== 'object' || !('entries' in raw)) throw new Error(`"${f.name}" isn't an Eclipse library. Pick library.json.`)
      normalizeLibrary(raw)
      setDrive({ folderId: folder!.id, folderName: folder!.name, libraryId: f.id })
      await refresh()
    })

  return (
    <section className="setup-card">
      {!folder ? (
        <>
          <h2>{again ? 'Find your library again' : 'Where is your Eclipse folder?'}</h2>
          <p>{again ? "Your library.json couldn't be found in Drive. Pick your Eclipse folder again, then the file." : 'Pick the Google Drive folder Eclipse keeps your library in (the one you chose on your computer, e.g. "Eclipse").'}</p>
          <button className="btn primary wide" disabled={busy} onClick={pickFolder}>
            Pick my Eclipse folder
          </button>
        </>
      ) : (
        <>
          <h2>Now tap library.json</h2>
          <p>
            In <b>{folder.name}</b>, tap the file called <b>library.json</b>. This lets the page read your library, and keep its own changes in a file next to it.
          </p>
          <button className="btn primary wide" disabled={busy} onClick={pickLibrary}>
            Pick library.json
          </button>
          <button className="btn ghost wide" disabled={busy} onClick={() => setFolder(null)}>
            That's the wrong folder
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function TmdbKey(): React.JSX.Element {
  const setTmdbKey = usePhone((s) => s.setTmdbKey)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    const k = key.trim()
    if (!k) return
    setBusy(true)
    setError(null)
    try {
      await createTmdb({ key: k, fetch: (u, i) => fetch(u, i) }).check()
      setTmdbKey(k)
    } catch (err) {
      setError(err instanceof TmdbError ? err.message.replace(' Check it in Settings.', '') : 'Couldn’t check the key. Are you online?')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="setup-card">
      <h2>Your TMDB key</h2>
      <p>
        Posters, episodes and where to watch come from TMDB. Paste the same key you use on your computer: on{' '}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
          themoviedb.org → Settings → API
        </a>
        , copy the <b>API Key</b> (or the Read Access Token).
      </p>
      <p className="fine">It's kept on this phone only.</p>
      <input className="field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button className="btn primary wide" disabled={busy || !key.trim()} onClick={save}>
        {busy ? 'Checking…' : 'Save key'}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
