import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { currentView, useApp } from './store/app'
import PosterWall from './components/PosterWall'
import Dock from './components/Dock'
import Setup from './components/Setup'
import HomeHero from './components/HomeHero'
import LibrarySheet from './components/LibrarySheet'
import SearchSheet from './components/SearchSheet'
import TitleSheet from './components/TitleSheet'
import SettingsView from './components/SettingsView'

export default function App(): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp(currentView)
  const canGoBack = useApp((s) => s.history.length > 1)
  const { setStatus, setLibrary, back, go } = useApp.getState()

  useEffect(() => {
    window.api.status().then(setStatus)
    window.api.getLibrary().then(setLibrary)
    const stop = window.api.onLibraryChanged(setLibrary)
    // Mouse back button, Alt+Left and Escape go back, like a browser.
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) back()
    }
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement
      if ((e.altKey && e.key === 'ArrowLeft') || (e.key === 'Escape' && !typing)) back()
    }
    window.addEventListener('mouseup', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      window.removeEventListener('mouseup', onMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!status) return <div className="app" />
  const needsSetup = !status.dataFolder || status.dataFolderMissing || !status.hasKey
  const onHome = !needsSetup && view.name === 'home'

  return (
    <div className={`app ${onHome ? 'on-home' : 'on-page'}`}>
      <PosterWall />
      <div className="veil" aria-hidden />
      <div className="drag-strip" aria-hidden />

      <header className="corner">
        {onHome || needsSetup ? (
          <div className="brand">
            <span className="brand-mark" aria-hidden />
            ECLIPSE
          </div>
        ) : (
          <button className="back-btn" onClick={() => (canGoBack ? back() : go({ name: 'home' }))}>
            <ArrowLeft size={18} /> Back
          </button>
        )}
      </header>

      {needsSetup ? (
        <Setup />
      ) : (
        <>
          {view.name === 'home' && <HomeHero />}
          {view.name === 'library' && <LibrarySheet />}
          {view.name === 'search' && <SearchSheet />}
          {view.name === 'settings' && <SettingsView />}
          {view.name === 'title' && <TitleSheet key={`${view.type}:${view.id}`} type={view.type} id={view.id} />}
          <Dock />
        </>
      )}
    </div>
  )
}
