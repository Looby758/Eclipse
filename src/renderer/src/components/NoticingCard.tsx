import { askToStartWithComputer } from '../lib/startAsk'
import { Eye, FolderOpen, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NoticingSettings } from '@shared/api'
import { useNoticing } from '../lib/noticing'
import { ago } from './HealthCard'

function Switch({ on, set }: { on: boolean; set: (on: boolean) => void }): React.JSX.Element {
  return (
    <div className="segmented">
      <button className={!on ? 'on' : ''} onClick={() => set(false)}>
        Off
      </button>
      <button className={on ? 'on' : ''} onClick={() => set(true)}>
        On
      </button>
    </div>
  )
}

const clock = (s: number | null | undefined): string => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

/** Settings: Eclipse notices what you watch (Phases 27 to 30). Everything stays on this computer. */
export default function NoticingCard(): React.JSX.Element {
  const [status, setStatus] = useNoticing()
  const [scanning, setScanning] = useState(false)
  const [, tick] = useState(0)
  const mac = window.api.platform === 'mac'
  const s = status?.settings
  const set = async (patch: Partial<NoticingSettings>): Promise<void> => {
    setStatus(await window.api.setNoticing(patch))
    if (patch.history || patch.playing) void askToStartWithComputer('notice what you watch')
  }

  // Refresh the "right now" list every few seconds while it's on screen.
  useEffect(() => {
    if (!s?.playing) return
    const t = setInterval(() => {
      void window.api.noticingStatus().then(setStatus)
      tick((n) => n + 1)
    }, 5000)
    return () => clearInterval(t)
  }, [s?.playing])

  return (
    <section className="card">
      <h2>Noticing what you watch</h2>
      <p className="muted">
        Eclipse can notice what you watch on Disney+, NOW and the rest, and ask “Tick Andor S2 E4?” on Home. It never ticks anything without you saying yes, and nothing leaves this computer.
      </p>

      <h3 className="card-sub">From your browser history</h3>
      <p className="muted small">
        Reads the Chrome, Edge and Opera GX history on this computer every half hour, looking only at streaming sites. The first time it looks back two weeks.{' '}
        {status && (status.browsers.length ? `Found: ${status.browsers.join(' and ')}.` : 'No Chrome, Edge or Opera history found on this computer.')}
      </p>
      <Switch on={!!s?.history} set={(on) => void set({ history: on })} />
      {s?.history && (
        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          <button
            className="btn glass"
            disabled={scanning}
            onClick={async () => {
              setScanning(true)
              try {
                setStatus(await window.api.scanHistory())
              } finally {
                setScanning(false)
              }
            }}
          >
            <RefreshCw size={15} className={scanning ? 'spin' : ''} /> {scanning ? 'Checking…' : 'Check now'}
          </button>
          {status?.lastScan && (
            <span className="muted small">
              Checked {ago(status.lastScan.at)}: {status.lastScan.visits} visits to streaming sites
              {status.lastScan.browsers.length ? ` in ${status.lastScan.browsers.join(' and ')}` : ''}.
            </span>
          )}
        </div>
      )}
      {status?.lastScan?.errors.map((e) => (
        <p key={e} className="error small">
          {e}
        </p>
      ))}

      <h3 className="card-sub">What’s playing</h3>
      <p className="muted small">
        {mac
          ? 'Looks at the front tab in Chrome, Edge and Safari every 10 seconds. The Mac asks once whether Eclipse may do that: say OK.'
          : 'Asks Windows what’s playing every 5 seconds (the same thing the volume pop-up shows), and looks at Chrome, Edge and Opera window titles.'}{' '}
        When an episode ends, Eclipse asks whether to tick it. Press <kbd>{status?.momentKey ?? (mac ? '⌘⌥B' : 'Ctrl+Alt+B')}</kbd> anywhere to bookmark the moment you’re at.
      </p>
      <Switch on={!!s?.playing} set={(on) => void set({ playing: on })} />

      {s?.playing && (
        <>
          <h3 className="card-sub">The exact episode, from your browser</h3>
          <p className="muted small">
            Disney+ and NOW don’t put the episode in the page title, so on their own Eclipse can only see that something’s playing. The Eclipse extension for Chrome reads the episode from the player itself (“S5:E3”) and passes it to Eclipse, on this computer only.
          </p>
          <ol className="muted small" style={{ paddingLeft: 18, margin: '6px 0' }}>
            <li>
              In Chrome, Edge or Opera GX, go to <code>chrome://extensions</code> (<code>edge://extensions</code>, <code>opera://extensions</code>) and switch on Developer mode.
            </li>
            <li>Press Load unpacked and choose the folder that opens with the button below.</li>
            <li>Play an episode: it shows up under “What Eclipse sees right now” within 10 seconds.</li>
          </ol>
          <div className="row" style={{ alignItems: 'center' }}>
            <button className="btn glass" onClick={() => void window.api.showExtensionFolder()}>
              <FolderOpen size={15} /> Show the extension folder
            </button>
            <span className="muted small">
              {status?.extension.error ? '' : status?.extension.lastAt ? `Last heard from ${ago(status.extension.lastAt)}.` : 'Not heard from yet.'}
            </span>
          </div>
          {status?.extension.error && <p className="error small">{status.extension.error}</p>}

          <h3 className="card-sub">Bedtime guard</h3>
          <p className="muted small">When you start an episode that would end past your bedtime (set in Evenings), a notification says by how much.</p>
          <Switch on={!!s?.bedtime} set={(on) => void set({ bedtime: on })} />

          <div className="sees">
            <div className="note-kicker">
              <Eye size={14} /> What Eclipse sees right now
            </div>
            {status?.playing.error && <p className="error small">{status.playing.error}</p>}
            {status?.playing.line ? <p className="note-line">Recognised: <strong>{status.playing.line}</strong></p> : <p className="muted small">Nothing of yours recognised.</p>}
            {status?.playing.raw.length ? (
              <ul className="sees-list">
                {status.playing.raw.map((n, i) => (
                  <li key={i}>
                    <span className="muted">{n.app}</span> {n.title}
                    {n.artist ? ` · ${n.artist}` : ''}
                    {n.position != null ? ` · ${clock(n.position)}${n.duration ? ` of ${clock(n.duration)}` : ''}` : ''}
                    {n.status ? ` · ${n.status}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              !status?.playing.error && <p className="muted small">The computer isn’t reporting anything playing.</p>
            )}
            <p className="muted small">Play something on Disney+ or NOW and it should show up here within a few seconds. If it shows up but isn’t recognised, the show needs to be in your library. Eclipse only asks to tick an episode when it was told which one: if “Recognised” has no S and E, the player didn’t say.</p>
          </div>
        </>
      )}
    </section>
  )
}
