import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { applyThemeMode, savedThemeMode, type ThemeMode } from '../lib/themeMode'
import { applyStill, savedStill } from '../lib/motion'
import { useApp } from '../store/app'
import { useHomeStyle } from '../lib/homeStyle'
import KeyForm from './KeyForm'
import Sheet from './Sheet'
import Credits from './Credits'
import ServicesCard from './ServicesCard'
import EveningsCard from './EveningsCard'
import CalendarCard from './CalendarCard'
import SequelImportCard from './SequelImportCard'
import ExportCard from './ExportCard'
import UpdatesCard from './UpdatesCard'
import RemoteCard from './RemoteCard'
import HistoryCard from './HistoryCard'
import TrayCard from './TrayCard'
import NoticingCard from './NoticingCard'
import StartupCard from './StartupCard'
import BackupsCard from './BackupsCard'
import HealthCard from './HealthCard'

export default function SettingsView(): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { setStatus, setLibrary } = useApp.getState()
  const [mode, setMode] = useState<ThemeMode>(savedThemeMode())
  const [cleared, setCleared] = useState(false)
  const home = useHomeStyle()
  const [still, setStill] = useState(savedStill)

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
        <h3 className="card-sub">Home</h3>
        <p className="muted small">Spotlight puts tonight’s pick inside the Tonight dial. Classic is the Home from before, with the suggestion on the left and the cards on the right.</p>
        <div className="segmented">
          <button className={home.style === 'spotlight' ? 'on' : ''} onClick={() => home.set('spotlight')}>
            Spotlight
          </button>
          <button className={home.style === 'classic' ? 'on' : ''} onClick={() => home.set('classic')}>
            Classic (legacy)
          </button>
        </div>
        <h3 className="card-sub">Keep the poster wall still</h3>
        <p className="muted small">Stops the drifting posters, the glowing dots and the pages sliding in. Your computer’s own “reduce animations” setting does this too.</p>
        <div className="segmented" role="radiogroup" aria-label="Keep the poster wall still">
          <button role="radio" aria-checked={!still} className={!still ? 'on' : ''} onClick={() => (setStill(false), applyStill(false))}>
            Moving
          </button>
          <button role="radio" aria-checked={still} className={still ? 'on' : ''} onClick={() => (setStill(true), applyStill(true))}>
            Still
          </button>
        </div>
      </section>

      <ServicesCard />

      <EveningsCard />

      <NoticingCard />

      <RemoteCard />

      <TrayCard />

      <StartupCard />

      <CalendarCard />

      <SequelImportCard />

      <HistoryCard />

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

      <BackupsCard />

      <ExportCard />

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

      <HealthCard />

      <UpdatesCard />

      <Credits justWatch />
    </Sheet>
  )
}
