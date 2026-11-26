import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Plug, Unplug } from 'lucide-react'
import { CLAUDE_AREAS, type ClaudeArea, type ClaudeDesktopStatus, type ConnectResult } from '@shared/claudeDesktop'

/**
 * Settings → Claude Desktop: lets the Claude Desktop app use Eclipse (main/claudeDesktop.ts), the
 * same way Orbit does. A switch, the button that sets Claude Desktop up, and which parts it can use.
 */
export default function ClaudeDesktopCard(): React.JSX.Element | null {
  const [status, setStatus] = useState<ClaudeDesktopStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ConnectResult | null>(null)
  const [copied, setCopied] = useState(false)
  const mac = window.api.platform === 'mac'

  useEffect(() => {
    void window.api.claudeDesktopStatus().then(setStatus)
  }, [])

  const run = async (job: () => Promise<ClaudeDesktopStatus | void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const next = await job()
      if (next) {
        setStatus(next)
        if (next.error) setError(next.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const connect = (): Promise<void> =>
    run(async () => {
      const r = await window.api.connectClaudeDesktop()
      setResult(r)
      setCopied(false)
      return window.api.claudeDesktopStatus()
    })

  if (!status) return null
  return (
    <section className="card" data-section="claude-desktop">
      <h2>Claude Desktop</h2>
      <p className="muted">
        Lets the Claude Desktop app use Eclipse, so you can ask it things like “tick the next episode of Severance”, “add Dune to my watchlist”, “what did I watch last week?” or “what fits
        before bed tonight?”. It uses your normal Claude plan, so there’s no API key and nothing extra to pay. Only this computer can reach it, and Eclipse needs to be open (the {mac ? 'menu bar' : 'tray'} is
        enough).
      </p>
      <div className="segmented">
        <button className={!status.on ? 'on' : ''} disabled={busy} onClick={() => void run(() => window.api.setClaudeDesktop(false))}>
          Off
        </button>
        <button className={status.on ? 'on' : ''} disabled={busy || (!status.on && !status.canEncrypt)} onClick={() => void run(() => window.api.setClaudeDesktop(true))}>
          On
        </button>
      </div>

      {status.on && (
        <>
          <h3 className="card-sub">{status.connected ? 'Connected to Claude Desktop' : 'Connect to Claude Desktop'}</h3>
          <p className="muted small">
            {status.connected
              ? 'Claude Desktop is set up. If Eclipse doesn’t show in its connectors, quit Claude Desktop completely and open it again.'
              : 'Sets Claude Desktop up for you (it needs to be installed). Then quit Claude Desktop completely and open it again.'}
          </p>
          <div className="row-buttons">
            <button className={`btn ${status.connected ? '' : 'primary'}`} disabled={busy} onClick={() => void connect()}>
              <Plug size={14} /> {status.connected ? 'Connect again' : 'Connect to Claude Desktop'}
            </button>
          </div>
          {result && <p className={result.written ? 'muted small' : 'error small'}>{result.message}</p>}
          {result?.text && (
            <div className="claude-paste">
              <p className="muted small">
                Open Claude Desktop, go to <strong>{mac ? 'Claude → Settings' : 'File → Settings'} → Developer → Edit Config</strong>, and put this in the file it shows (
                <code>{result.file}</code>). If the file already has an <code>mcpServers</code> part (Orbit’s, say), add the <code>eclipse</code> part inside it. Save, then quit Claude Desktop and open
                it again.
              </p>
              <textarea readOnly value={result.text} rows={10} spellCheck={false} />
              <button className="btn" onClick={() => void navigator.clipboard.writeText(result.text!).then(() => setCopied(true))}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <h3 className="card-sub">What Claude can use</h3>
          <div className="claude-areas">
            {CLAUDE_AREAS.map((a) => (
              <div key={a.id} className="claude-area">
                <div>
                  <strong>{a.label}</strong>
                  <p className="muted small">{a.what}</p>
                </div>
                <div className="segmented small">
                  <button className={!status.areas[a.id] ? 'on' : ''} disabled={busy} onClick={() => void run(() => window.api.setClaudeArea(a.id as ClaudeArea, false))}>
                    Off
                  </button>
                  <button className={status.areas[a.id] ? 'on' : ''} disabled={busy} onClick={() => void run(() => window.api.setClaudeArea(a.id as ClaudeArea, true))}>
                    On
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Your TMDB key and the secret code are never shared. Changes Claude makes show the Undo bar here, and Claude can undo its last change too. Claude asks before removing anything unless you
            asked it to.
          </p>
          <div className="row-buttons">
            <button className="link-btn inline small" disabled={busy} onClick={() => void run(() => window.api.newClaudeDesktopToken())} title="Makes a new secret code, so anything that had the old one stops working">
              <KeyRound size={13} /> New secret code
            </button>
            {status.connected && (
              <button className="link-btn inline small" disabled={busy} onClick={() => void run(() => window.api.disconnectClaudeDesktop())} title="Takes Eclipse out of Claude Desktop’s connectors">
                <Unplug size={13} /> Remove from Claude Desktop
              </button>
            )}
          </div>
        </>
      )}
      {!status.canEncrypt && <p className="error small">This computer can’t store the connection’s secret code securely, so it can’t be switched on.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  )
}
