import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { watchClaudeLooks, watchClaudeShow } from './lib/claudeShow'
import { currentView, useApp, type View } from './store/app'
import PosterWall from './components/PosterWall'
import Dock from './components/Dock'
import Setup from './components/Setup'
import HomeHero from './components/HomeHero'
import OnThisDay from './components/OnThisDay'
import { HomeCredit } from './components/Credits'
import GuardBanner from './components/GuardBanner'
import HomeNotes from './components/HomeNotes'
import ClearOutSheet from './components/ClearOutSheet'
import PicksSheet from './components/PicksSheet'
import ServicesSheet from './components/ServicesSheet'
import RepairSheet from './components/RepairSheet'
import YearSheet from './components/YearSheet'
import StatsSheet from './components/StatsSheet'
import TimelineSheet from './components/TimelineSheet'
import LibrarySheet from './components/LibrarySheet'
import SearchSheet from './components/SearchSheet'
import TitleSheet from './components/TitleSheet'
import SpotlightTitle from './components/SpotlightTitle'
import SettingsView from './components/SettingsView'
import WatchSoonSheet from './components/WatchSoonSheet'
import ListsSheet from './components/ListsSheet'
import ShelfSheet from './components/ShelfSheet'
import ListSheet from './components/ListSheet'
import SpotlightHome from './components/SpotlightHome'
import Countdowns from './components/Countdowns'
import Logo from './components/Logo'
import UndoBar from './components/UndoBar'
import MilestoneNote from './components/MilestoneNote'
import ReactionAsk from './components/ReactionAsk'
import StartAsk from './components/StartAsk'
import PhoneAsk from './components/PhoneAsk'
import ZoomLayer from './components/ZoomLayer'
import Finale from './components/Finale'
import PosterFlip from './components/PosterFlip'
import { useFinaleWatcher } from './lib/finale'
import { usePosterLookWatcher } from './lib/posterLook'
import Opening from './components/Opening'
import { shouldPlayOpening } from './lib/opening'
import { useHomeStyle } from './lib/homeStyle'
import { handleArrows, isTyping } from './lib/keys'
import { useStartAsk } from './lib/startAsk'
import { startWelcome, useWelcome } from './lib/welcome'
import { watchMilestones } from './lib/milestones'
import { watchSounds } from './lib/sounds'

export default function App(): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp(currentView)
  const canGoBack = useApp((s) => s.history.length > 1)
  const homeStyle = useHomeStyle((s) => s.style)
  const welcoming = useWelcome((s) => s.step !== null)
  const { setStatus, setLibrary, back, go } = useApp.getState()
  useFinaleWatcher()
  usePosterLookWatcher()
  // Going from one page straight to another (not via Home): the glass stays and only its contents change (see .app.swap).
  const lastView = useRef(view)
  const swap = useRef(false)
  if (lastView.current !== view) {
    swap.current = onSheet(lastView.current, homeStyle) && onSheet(view, homeStyle)
    lastView.current = view
  }

  // Phase 51: the opening, while it plays ('play'), then while Home fades up ('reveal').
  const [opening, setOpening] = useState<'off' | 'play' | 'reveal'>('off')

  useEffect(() => {
    Promise.all([window.api.status(), window.api.takeOpening()]).then(([s, fresh]) => {
      startWelcome(s)
      const setup = useWelcome.getState().step !== null || !s.dataFolder || s.dataFolderMissing || !s.hasKey
      const still = document.documentElement.hasAttribute('data-still')
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (shouldPlayOpening({ fresh, still, reduceMotion, setup })) setOpening('play')
      setStatus(s)
    })
    window.api.getLibrary().then(setLibrary)
    const stop = window.api.onLibraryChanged(setLibrary)
    // Phase 53: a small note when a tick takes you past a milestone.
    const stopMilestones = watchMilestones()
    // Phase 54: a click for a tick and a chime for a finished season, when sounds are on.
    const stopSounds = watchSounds()
    // Claude Desktop asking to show a page or a title (open_in_eclipse).
    const stopClaude = watchClaudeShow()
    const stopLooks = watchClaudeLooks()
    // Mouse back button, Alt+Left and Escape go back, like a browser.
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) back()
    }
    const onKey = (e: KeyboardEvent): void => {
      const typing = isTyping(e.target)
      // Escape closes the start-with-computer question before it goes back a page.
      if (e.key === 'Escape' && useStartAsk.getState().reason) useStartAsk.getState().close()
      else if ((e.altKey && e.key === 'ArrowLeft') || (e.key === 'Escape' && !typing)) back()
      // Ctrl+, (Cmd+, on a Mac) opens Settings, as in most apps.
      else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        if (useApp.getState().status?.hasKey) useApp.getState().go({ name: 'settings' })
      } else handleArrows(e)
    }
    window.addEventListener('mouseup', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      stopMilestones()
      stopSounds()
      stopClaude()
      stopLooks()
      window.removeEventListener('mouseup', onMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!status) return <div className="app" />
  const needsSetup = welcoming || !status.dataFolder || status.dataFolderMissing || !status.hasKey
  const onHome = !needsSetup && view.name === 'home'
  const spot = onHome && homeStyle === 'spotlight'
  const playing = opening !== 'off' && !needsSetup
  const openingClass = !playing ? '' : opening === 'play' ? 'opening-hide opening-reveal' : 'opening-reveal'

  return (
    <div className={`app ${onHome ? 'on-home' : 'on-page'} ${spot ? 'spot' : ''} ${swap.current && !onHome ? 'swap' : ''} ${homeStyle === 'spotlight' ? 'frost' : ''} ${view.name === 'title' && homeStyle === 'spotlight' ? 'st-open' : ''} ${openingClass}`}>
      {/* Spotlight's flat drifting rows stay behind every page, so leaving Home doesn't swap the wall. */}
      <PosterWall rows={homeStyle === 'spotlight'} alive={spot} />
      <div className="veil" aria-hidden />
      <div className="drag-strip" aria-hidden />
      {playing && <Opening onReveal={() => setOpening('reveal')} onDone={() => setOpening('off')} />}

      <header className="corner">
        {onHome || needsSetup ? (
          <div className="brand">
            <Logo size={30} className="brand-logo" />
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
          <GuardBanner />
          {spot && (
            <>
              <SpotlightHome />
              <HomeCredit />
            </>
          )}
          {view.name === 'home' && !spot && (
            <>
              <HomeHero />
              <aside className="home-side">
                <Countdowns />
                <HomeNotes />
                <OnThisDay />
              </aside>
              <HomeCredit />
            </>
          )}
          {view.name === 'library' && <LibrarySheet />}
          {view.name === 'search' && <SearchSheet />}
          {view.name === 'settings' && <SettingsView />}
          {view.name === 'lists' && <ListsSheet />}
          {view.name === 'shelf' && <ShelfSheet key={view.room ?? 'shelf'} room={view.room} />}
          {view.name === 'soon' && <WatchSoonSheet />}
          {view.name === 'clearout' && <ClearOutSheet />}
          {view.name === 'picks' && <PicksSheet />}
          {view.name === 'services' && <ServicesSheet />}
          {view.name === 'repair' && <RepairSheet />}
          {view.name === 'stats' && <StatsSheet />}
          {view.name === 'timeline' && <TimelineSheet key={view.focus ?? 'all'} focus={view.focus} />}
          {view.name === 'year' && <YearSheet key={view.year ?? 'now'} year={view.year} />}
          {view.name === 'list' && <ListSheet key={`${view.id}${view.map ? ':map' : ''}`} id={view.id} map={view.map} />}
          {view.name === 'title' &&
            (homeStyle === 'spotlight' ? (
              <SpotlightTitle key={`${view.type}:${view.id}`} type={view.type} id={view.id} />
            ) : (
              <TitleSheet key={`${view.type}:${view.id}`} type={view.type} id={view.id} />
            ))}
          <Dock tucked={spot || (view.name === 'title' && homeStyle === 'spotlight')} />
          <UndoBar />
          <MilestoneNote />
          <ReactionAsk />
          <StartAsk />
          <PhoneAsk />
          <ZoomLayer />
          <Finale />
          <PosterFlip />
        </>
      )}
    </div>
  )
}

/** Pages drawn on a sheet of glass: everything but Home, and title pages when they're full-window (Spotlight). */
const onSheet = (v: View, homeStyle: string): boolean => v.name !== 'home' && !(v.name === 'title' && homeStyle === 'spotlight')
