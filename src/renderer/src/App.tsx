import { useEffect } from 'react'
import { currentView, useApp } from './store/app'
import TopBar from './components/TopBar'
import Setup from './components/Setup'
import Home from './components/Home'
import SearchView from './components/SearchView'
import TitlePage from './components/TitlePage'
import SettingsView from './components/SettingsView'

export default function App(): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp(currentView)
  const { setStatus, setLibrary, back } = useApp.getState()

  useEffect(() => {
    window.api.status().then(setStatus)
    window.api.getLibrary().then(setLibrary)
    const stop = window.api.onLibraryChanged(setLibrary)
    // Mouse back button and Alt+Left go back, like a browser.
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) back()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && e.key === 'ArrowLeft') back()
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

  return (
    <div className="app">
      <TopBar minimal={needsSetup} />
      <main className="content">
        {needsSetup ? (
          <Setup />
        ) : view.name === 'search' ? (
          <SearchView />
        ) : view.name === 'title' ? (
          <TitlePage key={`${view.type}:${view.id}`} type={view.type} id={view.id} />
        ) : view.name === 'settings' ? (
          <SettingsView />
        ) : (
          <Home />
        )}
      </main>
    </div>
  )
}
