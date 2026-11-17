import { useEffect, useState } from 'react'
import type { LoginStatus } from '@shared/api'
import { startLabel } from '../lib/startAsk'

/** Settings, Phase 38: start Eclipse with the computer, quietly in the tray. Off unless you turn it on. */
export default function StartupCard(): React.JSX.Element | null {
  const [s, setS] = useState<LoginStatus | null>(null)
  useEffect(() => {
    window.api.loginStatus().then(setS)
  }, [])
  if (!s?.supported) return null
  const mac = window.api.platform === 'mac'
  return (
    <section className="card">
      <h2>{startLabel()}</h2>
      <p className="muted">
        Noticing what you watch, What’s playing, the phone remote and the {mac ? 'menu bar' : 'tray'} only work while Eclipse is running. With this on, Eclipse opens quietly in the {mac ? 'menu bar' : 'system tray'} when you
        {mac ? ' log in' : ' start Windows'}, with no window. If your data folder is in Google Drive, it waits for Drive to bring it. Only for this computer.
      </p>
      <div className="segmented">
        <button className={!s.on ? 'on' : ''} onClick={async () => setS(await window.api.setStartAtLogin(false))}>
          Off
        </button>
        <button className={s.on ? 'on' : ''} onClick={async () => setS(await window.api.setStartAtLogin(true))}>
          On
        </button>
      </div>
    </section>
  )
}
