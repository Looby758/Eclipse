import { Library, Moon, Search, Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { currentView, useApp, type View } from '../store/app'

const ITEMS: { view: View['name']; label: string; icon: typeof Moon }[] = [
  { view: 'home', label: 'Tonight', icon: Moon },
  { view: 'library', label: 'Library', icon: Library },
  { view: 'settings', label: 'Settings', icon: Settings }
]

/** The floating dock at the bottom: where to go, and search. */
export default function Dock(): React.JSX.Element {
  const view = useApp(currentView)
  const query = useApp((s) => s.query)
  const { go, setQuery } = useApp.getState()
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
    const onFocusSearch = (): void => input.current?.focus()
    window.addEventListener('keydown', onKey)
    window.addEventListener('eclipse:focus-search', onFocusSearch)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('eclipse:focus-search', onFocusSearch)
    }
  }, [])

  return (
    <nav className="dock" aria-label="Main">
      {ITEMS.map(({ view: name, label, icon: Icon }) => (
        <button key={name} className={`dock-btn ${view.name === name ? 'on' : ''}`} onClick={() => go({ name } as View)}>
          <Icon size={21} strokeWidth={1.9} />
          <span>{label}</span>
        </button>
      ))}
      <span className="dock-divider" aria-hidden />
      <label className="dock-search">
        <Search size={16} />
        <input
          ref={input}
          aria-label="Search films and shows"
          value={query}
          placeholder="Search anything"
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
    </nav>
  )
}

/** Puts the cursor in the dock's search box (for "Find something" buttons). */
export const focusSearch = (): void => void window.dispatchEvent(new Event('eclipse:focus-search'))
