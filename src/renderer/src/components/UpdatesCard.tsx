import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/api'

function describe(s: UpdateStatus): string {
  switch (s.state) {
    case 'off':
      return s.reason ?? 'Updates are off.'
    case 'checking':
      return 'Checking for updates…'
    case 'none':
      return 'You have the latest version.'
    case 'available':
      return `Eclipse ${s.version} is out.`
    case 'downloading':
      return `Downloading Eclipse ${s.version ?? ''}… ${s.percent ?? 0}%`
    case 'ready':
      return `Eclipse ${s.version} is ready. It installs when you restart.`
    case 'error':
      return s.error ?? 'Couldn’t check for updates.'
  }
}

/** Settings: the version you're on, and updates from GitHub Releases. */
export default function UpdatesCard(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.api.updateStatus().then(setStatus)
    return window.api.onUpdateStatus(setStatus)
  }, [])

  if (!status) return <section className="card" />
  return (
    <section className="card">
      <h2>Version and updates</h2>
      <p className="muted">
        Eclipse {status.current}. {describe(status)}
      </p>
      <div className="row">
        {status.state !== 'off' && (
          <button className="btn glass" disabled={status.state === 'checking' || status.state === 'downloading'} onClick={async () => setStatus(await window.api.checkForUpdates())}>
            <RefreshCw size={16} /> Check now
          </button>
        )}
        {status.state === 'ready' && (
          <button className="btn primary" onClick={() => window.api.installUpdate()}>
            Restart to update
          </button>
        )}
        {status.state === 'available' && (
          <button className="btn primary" onClick={() => window.api.installUpdate()}>
            Download it
          </button>
        )}
      </div>
      {status.manual && status.state === 'available' && (
        <p className="muted small">On a Mac, download the new .dmg and drag Eclipse into Applications again. Your library isn’t touched.</p>
      )}
    </section>
  )
}
