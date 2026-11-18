import { useEffect, useState } from 'react'
import { CloudOff, Library, LoaderCircle, MoreHorizontal, RefreshCw, Search, Sparkles } from 'lucide-react'
import { parseTitleKey, type MediaType } from '@core/types'
import { usePhone } from './store'
import { signIn, signOut, takeTokenFromAddress } from './google'
import Setup from './Setup'
import LibraryTab from './LibraryTab'
import SearchTab from './SearchTab'
import ForYouTab from './ForYouTab'
import TitlePage from './TitlePage'
import { Logo } from './Logo'

type Tab = 'library' | 'search' | 'foryou'

// Coming back from Google: take the token out of the address before anything else.
const signInResult = takeTokenFromAddress()
if (signInResult === 'quietFailed') sessionStorage.setItem('eclipse.phone.quietFailed', '1')
if (signInResult === 'signedIn') sessionStorage.removeItem('eclipse.phone.quietFailed')

function titleFromAddress(): { type: MediaType; id: number } | null {
  const m = /^#(movie|tv)\/(\d+)$/.exec(location.hash)
  return m ? parseTitleKey(`${m[1]}:${m[2]}`) : null
}

export default function App(): React.JSX.Element {
  const drive = usePhone((s) => s.drive)
  const tmdbKey = usePhone((s) => s.tmdbKey)
  const missing = usePhone((s) => s.libraryMissing)
  const refresh = usePhone((s) => s.refresh)
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('eclipse.phone.tab') as Tab) || 'library')
  const [title, setTitle] = useState(titleFromAddress)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const onPop = (): void => {
      setTitle(titleFromAddress())
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Read the library on opening, on coming back to the page, and every minute while it's open.
  useEffect(() => {
    if (!drive) return
    void refresh()
    const onShow = (): void => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('online', onShow)
    const timer = setInterval(onShow, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('online', onShow)
      clearInterval(timer)
    }
  }, [drive, refresh])

  if (!drive || !tmdbKey || missing) return <Setup />

  const choose = (t: Tab): void => {
    setTab(t)
    sessionStorage.setItem('eclipse.phone.tab', t)
    if (title) history.back()
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      {title ? (
        <TitlePage key={`${title.type}:${title.id}`} type={title.type} id={title.id} onBack={() => history.back()} />
      ) : (
        <>
          <header className="top">
            <Logo size={28} />
            <span className="top-title">{tab === 'library' ? 'Library' : tab === 'search' ? 'Search' : 'For you'}</span>
            <SyncBadge />
            <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="More" aria-expanded={menu}>
              <MoreHorizontal size={22} />
            </button>
          </header>
          {menu && <Menu close={() => setMenu(false)} />}
          {tab === 'library' && <LibraryTab />}
          {tab === 'search' && <SearchTab />}
          {tab === 'foryou' && <ForYouTab />}
        </>
      )}
      <nav className="tabs" aria-label="Eclipse">
        <button className={tab === 'library' && !title ? 'on' : ''} onClick={() => choose('library')}>
          <Library size={22} />
          <span>Library</span>
        </button>
        <button className={tab === 'search' && !title ? 'on' : ''} onClick={() => choose('search')}>
          <Search size={22} />
          <span>Search</span>
        </button>
        <button className={tab === 'foryou' && !title ? 'on' : ''} onClick={() => choose('foryou')}>
          <Sparkles size={22} />
          <span>For you</span>
        </button>
      </nav>
    </div>
  )
}

/** A small sign of how syncing with Drive is going, and of changes still on their way to the computer. */
function SyncBadge(): React.JSX.Element | null {
  const sync = usePhone((s) => s.sync)
  const queue = usePhone((s) => s.queue.length)
  const error = usePhone((s) => s.syncError)
  const refresh = usePhone((s) => s.refresh)
  if (sync === 'syncing') return <LoaderCircle size={18} className="sync spin" aria-label="Syncing" />
  if (sync === 'offline')
    return (
      <span className="sync-note">
        <CloudOff size={16} /> Offline
      </span>
    )
  if (sync === 'signIn')
    return (
      <button className="sync-note warn" onClick={() => signIn(false)}>
        Sign in again
      </button>
    )
  if (sync === 'error')
    return (
      <button className="sync-note warn" onClick={() => void refresh()} title={error ?? ''}>
        Couldn't sync · retry
      </button>
    )
  if (queue) return <span className="sync-note" title="Your computer adds these to your library next time Eclipse opens there">{queue} waiting for your computer</span>
  return null
}

function Menu({ close }: { close: () => void }): React.JSX.Element {
  const s = usePhone()
  const ago = s.syncedAt ? Math.round((Date.now() - s.syncedAt) / 60_000) : null
  return (
    <div className="menu" role="menu">
      <p className="sub">
        {s.drive ? `Library from "${s.drive.folderName}" in Google Drive` : ''}
        {ago !== null ? ` · read ${ago < 1 ? 'just now' : `${ago} min ago`}` : ''}
      </p>
      {s.queue.length > 0 && <p className="sub">{s.queue.length} change{s.queue.length === 1 ? '' : 's'} from this phone will be added when Eclipse next opens on your computer.</p>}
      <button
        role="menuitem"
        onClick={() => {
          void s.refresh()
          close()
        }}
      >
        <RefreshCw size={16} /> Sync now
      </button>
      <button
        role="menuitem"
        onClick={() => {
          s.setDrive(null)
          close()
        }}
      >
        Pick my Eclipse folder again
      </button>
      <button
        role="menuitem"
        onClick={() => {
          s.setTmdbKey(null)
          close()
        }}
      >
        Change TMDB key
      </button>
      <button
        role="menuitem"
        className="danger"
        onClick={() => {
          signOut()
          s.setDrive(null)
          close()
        }}
      >
        Sign out of Google
      </button>
    </div>
  )
}
