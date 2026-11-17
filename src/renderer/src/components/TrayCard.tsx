import { useEffect, useState } from 'react'

/** Settings: Eclipse in the menu bar (Mac) or the system tray (Windows), Phase 26. */
export default function TrayCard(): React.JSX.Element {
  const mac = window.api.platform === 'mac'
  const [on, setOn] = useState(false)
  useEffect(() => {
    window.api.trayOn().then(setOn)
  }, [])
  const where = mac ? 'menu bar' : 'system tray (by the clock)'
  return (
    <section className="card">
      <h2>{mac ? 'Eclipse in the menu bar' : 'Eclipse in the system tray'}</h2>
      <p className="muted">
        A small Eclipse icon in the {where}: the next episode of each show you’re watching with a one-click tick, and tonight’s “start by” time. While it’s on, closing the window leaves Eclipse
        running there, so the phone remote keeps working too. Use <em>Quit Eclipse</em> in its menu to close it properly.
      </p>
      <div className="segmented">
        <button className={!on ? 'on' : ''} onClick={async () => setOn(await window.api.setTray(false))}>
          Off
        </button>
        <button className={on ? 'on' : ''} onClick={async () => setOn(await window.api.setTray(true))}>
          On
        </button>
      </div>
      {on && !mac && <p className="muted small" style={{ marginTop: 10 }}>Can’t see it? Windows may tuck new icons behind the ^ arrow by the clock. Drag it out next to the clock to keep it there.</p>}
    </section>
  )
}
