import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { applyThemeMode, savedThemeMode, type ThemeMode } from '../lib/themeMode'
import { useApp } from '../store/app'
import KeyForm from './KeyForm'
import Sheet from './Sheet'
import Credits from './Credits'
import ServicesCard from './ServicesCard'
import SequelImportCard from './SequelImportCard'

export default function SettingsView(): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { setStatus, setLibrary } = useApp.getState()
  const [mode, setMode] = useState<ThemeMode>(savedThemeMode())
  const [cleared, setCleared] = useState(false)

  return (
    <Sheet className="settings">
      <div className="sheet-head">
        <h1>Settings</h1>
      </div>

      <section className="card">
        <h2>Appearance</h2>
        <div className="segmented">
          {(['system', 'dark', 'light'] as const).map((m) => (
            <button
              key={m}
              className={mode === m ? 'on' : ''}
              onClick={() => {
                setMode(m)
                applyThemeMode(m)
              }}
            >
              {m === 'system' ? 'Match system' : m === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </section>

      <ServicesCard />

      <SequelImportCard />

      <section className="card">
        <h2>Data folder</h2>
        <p className="muted">Your library is saved here as library.json. Put it in Google Drive to share it between your computers (just don’t have Eclipse open on both at once).</p>
        <p className="path">{status.dataFolder}</p>
        <div className="row">
          <button
            className="btn glass"
            onClick={async () => {
              setStatus(await window.api.pickDataFolder())
              setLibrary(await window.api.getLibrary())
            }}
          >
            <FolderOpen size={16} /> Change folder
          </button>
          <button className="btn glass" onClick={() => window.api.revealDataFolder()}>
            Show in {window.api.platform === 'mac' ? 'Finder' : 'File Explorer'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>TMDB API key</h2>
        <p className="muted">{status.hasKey ? 'A key is saved (encrypted on this computer).' : 'No key saved.'}</p>
        <KeyForm replacing={status.hasKey} />
        {status.hasKey && (
          <button className="btn glass danger" onClick={async () => setStatus(await window.api.clearTmdbKey())}>
            Remove key
          </button>
        )}
      </section>

      <section className="card">
        <h2>Saved TMDB data</h2>
        <p className="muted">Eclipse keeps copies of TMDB details so it’s quick and works offline. Details refresh weekly and searches daily. Clearing them is safe; your library isn’t touched.</p>
        <button
          className="btn glass"
          onClick={async () => {
            await window.api.clearCache()
            setCleared(true)
          }}
        >
          {cleared ? 'Cleared' : 'Clear saved TMDB data'}
        </button>
      </section>

      <p className="muted small">Eclipse {status.version}</p>
      <Credits justWatch />
    </Sheet>
  )
}
