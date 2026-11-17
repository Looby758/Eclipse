import { RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { RemoteStatus } from '@shared/api'

/** Settings: your phone as a remote (Phase 23). A switch, and a QR code to scan. */
export default function RemoteCard(): React.JSX.Element {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [qr, setQr] = useState('')

  useEffect(() => {
    window.api.remoteStatus().then(setStatus)
    return window.api.onRemoteStatus(setStatus)
  }, [])

  useEffect(() => {
    if (!status?.url) return setQr('')
    QRCode.toDataURL(status.url, { margin: 1, width: 360, color: { dark: '#040309', light: '#ffffff' } }).then(setQr, () => setQr(''))
  }, [status?.url])

  return (
    <section className="card">
      <h2>Your phone as a remote</h2>
      <p className="muted">
        Tick the next episode, see how many fit before bed and check Watch soon from your phone. It works on your home Wi-Fi while Eclipse is open here. Nothing goes online.
      </p>
      <div className="segmented">
        <button className={!status?.on ? 'on' : ''} onClick={async () => setStatus(await window.api.setRemote(false))}>
          Off
        </button>
        <button className={status?.on ? 'on' : ''} onClick={async () => setStatus(await window.api.setRemote(true))}>
          On
        </button>
      </div>
      {status?.error && <p className="error">{status.error}</p>}
      {status?.on && !status.error && !status.url && <p className="muted">Starting… If this stays here, check this computer is connected to your Wi-Fi.</p>}
      {status?.url && (
        <div className="remote-pair">
          {qr && <img className="remote-qr" src={qr} alt="QR code for the phone remote" />}
          <div>
            <p>
              <Smartphone size={15} /> Point your phone’s camera at the code and tap the link. On an iPhone, <em>Share → Add to Home Screen</em> keeps it one tap away.
            </p>
            <p className="muted small">
              Windows may ask whether Eclipse can use the network: allow it on <strong>private networks</strong>. Your phone must be on the same Wi-Fi.
            </p>
            <p className="path">{status.url.replace(/\?t=.*/, '')}</p>
            <button className="link-btn inline small" onClick={async () => setStatus(await window.api.newRemoteCode())}>
              <RefreshCw size={13} /> New code (phones that scanned the old one stop working)
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
