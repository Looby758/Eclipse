import { ArrowLeft, Search, Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { currentView, useApp } from '../store/app'

export default function TopBar({ minimal }: { minimal: boolean }): React.JSX.Element {
  const view = useApp(currentView)
  const canGoBack = useApp((s) => s.history.length > 1)
  const query = useApp((s) => s.query)
  const { go, back, setQuery } = useApp.getState()
  const input = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd+K or "/" jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-left">
        {!minimal && (
          <button className="icon-btn" onClick={back} disabled={!canGoBack} title="Back (Alt+←)">
            <ArrowLeft size={18} />
          </button>
        )}
        <button className="brand" onClick={() => !minimal && go({ name: 'home' })} title="Home">
          <span className="brand-mark" aria-hidden />
          Eclipse
        </button>
      </div>
      {!minimal && (
        <label className="search-box">
          <Search size={16} />
          <input
            ref={input}
            value={query}
            placeholder="Search films and shows…"
            onChange={(e) => {
              setQuery(e.target.value)
              if (view.name !== 'search') go({ name: 'search' })
            }}
            onFocus={() => query && view.name !== 'search' && go({ name: 'search' })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          <kbd>{window.api.platform === 'mac' ? '⌘K' : 'Ctrl K'}</kbd>
        </label>
      )}
      <div className="topbar-right">
        {!minimal && (
          <button className={`icon-btn ${view.name === 'settings' ? 'active' : ''}`} onClick={() => go({ name: 'settings' })} title="Settings">
            <Settings size={18} />
          </button>
        )}
      </div>
    </header>
  )
}
