import { useEffect, useState } from 'react'
import { validAppId } from '@core/discord'
import { discordLine, useDiscord } from '../lib/discord'

const DEV_PAGE = 'https://discord.com/developers/applications'

/** Settings: "Watching The Walking Dead · S9 E4" as your Discord status while it plays (Phase 44). */
export default function DiscordCard(): React.JSX.Element {
  const [status, set] = useDiscord()
  const [id, setId] = useState('')
  useEffect(() => {
    if (status) setId(status.appId)
  }, [status?.appId])
  const on = !!status?.on
  const idOk = validAppId(id)
  return (
    <section className="card">
      <h2>Discord status while you watch</h2>
      <p className="muted">
        While something of yours is playing, your Discord profile says “Watching The Walking Dead · S9 E4”, like it does for games, and it clears when you stop (or after 10 minutes paused). Eclipse
        talks to the Discord app on this computer, so it’s free and nothing goes online from Eclipse. It uses what Eclipse sees playing (Settings → Noticing what you watch), and the episode is only
        named when the player said which one. Off by default, and only on this computer. You can also switch it from the {window.api.platform === 'mac' ? 'menu bar' : 'tray'} menu and from Home.
      </p>
      <div className="segmented">
        <button className={!on ? 'on' : ''} onClick={() => void set({ on: false })}>
          Off
        </button>
        <button className={on ? 'on' : ''} onClick={() => void set({ on: true })}>
          On
        </button>
      </div>
      {status && <p className={status.on && status.state === 'error' ? 'error small' : 'muted small'} style={{ marginTop: 10 }}>{discordLine(status)}</p>}

      <h3 className="card-sub">Setting it up (once)</h3>
      <p className="muted small">Discord shows a status under an “application”, which is just a name and a number. Making one is free and takes a minute:</p>
      <ol className="muted small" style={{ paddingLeft: 18, margin: '6px 0' }}>
        <li>
          Open the{' '}
          <a
            href={DEV_PAGE}
            onClick={(e) => {
              e.preventDefault()
              void window.api.openExternal(DEV_PAGE)
            }}
          >
            Discord Developer Portal
          </a>{' '}
          and log in with your Discord account.
        </li>
        <li>Press New Application and call it <strong>Eclipse</strong> (the name is what friends see if they open your profile). Agree to the terms and press Create.</li>
        <li>On the General Information page, copy the Application ID (a long number) and paste it here.</li>
        <li>
          In the Discord app, check User Settings → Activity Privacy → “Share your detected activities with others” is on, or no one will see it.
        </li>
      </ol>
      <form
        className="key-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (idOk) void set({ appId: id.trim() })
        }}
      >
        <div className="row">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Discord application ID, e.g. 1234567890123456789" autoComplete="off" spellCheck={false} inputMode="numeric" />
          <button className="btn primary" disabled={!idOk || id.trim() === status?.appId}>
            Save ID
          </button>
        </div>
        {id.trim() && !idOk && <p className="error small">That doesn’t look like an application ID: it’s a number 17 to 20 digits long.</p>}
      </form>
      <p className="hint">You don’t need a bot, a secret or anything else from that page. The ID isn’t secret, and it’s kept on this computer only.</p>
    </section>
  )
}
