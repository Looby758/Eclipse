import { Check, Hourglass, Library, ListChecks, Moon, Search, Settings, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { entriesWith, nextEpisodeFor, preferencesOf } from '@core/library'
import { formatRuntime, plural } from '@core/format'
import { episodeMinutes, fitTonight, startBy, tonight } from '@core/time'
import { episodeKey, type LibraryEntry, type TitleDetails } from '@core/types'
import { useApp, type View } from '../store/app'
import { itemOf } from '../lib/item'
import Poster from './Poster'
import TonightDial from './TonightDial'
import JustTonight from './JustTonight'
import HomeNotes from './HomeNotes'
import OnThisDay from './OnThisDay'
import { candidates } from './HomeHero'
import { focusSearch } from './Dock'

const NAV: { view: View['name']; label: string; icon: typeof Moon }[] = [
  { view: 'home', label: 'Tonight', icon: Moon },
  { view: 'library', label: 'Library', icon: Library },
  { view: 'soon', label: 'Soon', icon: Hourglass },
  { view: 'lists', label: 'Lists', icon: ListChecks }
]

/** Spotlight's navigation: small glass pills in the top right. */
function Pills(): React.JSX.Element {
  const go = useApp((s) => s.go)
  return (
    <nav className="spot-pills" aria-label="Main">
      {NAV.map(({ view, label, icon: Icon }) => (
        <button key={view} className={`spot-pill ${view === 'home' ? 'on' : ''}`} onClick={() => go({ name: view } as View)}>
          <Icon size={17} /> {label}
        </button>
      ))}
      <button className="spot-pill icon" aria-label="Search" title={window.api.platform === 'mac' ? 'Search (⌘K)' : 'Search (Ctrl K)'} onClick={focusSearch}>
        <Search size={17} />
      </button>
      <button className="spot-pill icon" aria-label="Settings" title={window.api.platform === 'mac' ? 'Settings (⌘,)' : 'Settings (Ctrl ,)'} onClick={() => go({ name: 'settings' })}>
        <Settings size={17} />
      </button>
    </nav>
  )
}

/** "For you tonight": the Home cards, tucked into a panel so the dial stays calm. */
function ForYou(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={`spot-pill spot-foryou ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Sparkles size={16} /> For you tonight
      </button>
      {open && (
        <aside className="spot-panel" aria-label="For you tonight">
          <div className="spot-panel-head">
            <h2>For you tonight</h2>
            <button className="link-btn inline" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <HomeNotes />
          <OnThisDay />
        </aside>
      )}
    </>
  )
}

/** The new Home (Phase 34): tonight's pick inside the Tonight dial, over drifting rows of posters. */
export default function SpotlightHome(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const [skip, setSkip] = useState(0)
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const prefs = preferencesOf(library)

  const all = entriesWith(library)
  const picks = candidates(all, (library.watchSoon ?? []).map((r) => r.key))
  const pick: LibraryEntry | null = picks.length ? picks[skip % picks.length] : null

  // The dot moves with the clock.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setDetails(null)
    if (!pick) return
    let live = true
    window.api.details(pick.type, pick.id).then((r) => live && r.ok && setDetails(r.value.data))
    return () => {
      live = false
    }
  }, [pick?.key])

  const isShow = pick?.type === 'tv'
  const next = details && isShow ? nextEpisodeFor(pick!, details.seasons.map((s) => ({ number: s.number, episodeCount: s.episodeCount }))) : null
  const each = details ? (isShow ? episodeMinutes(details) : details.runtime || 120) : 45
  const fits = details ? (isShow ? fitTonight(now, prefs, each) : fitTonight(now, prefs, each) > 0 ? 1 : 0) : 0

  const offNight = !tonight(now, prefs).slots.length
  let line = ''
  if (pick && details && offNight) line = isShow && next ? `S${next.season} E${next.episode} · not a watching night` : `${formatRuntime(each)} · not a watching night`
  else if (pick && details) {
    if (isShow && next) line = `S${next.season} E${next.episode} · start by ${startBy(each, prefs, now)} · ${fits ? `${plural(fits, 'episode')} ${fits === 1 ? 'fits' : 'fit'} before bed` : 'no time for one tonight'}`
    else if (isShow) line = 'All caught up'
    else line = `${formatRuntime(each)} · start by ${startBy(each, prefs, now)} · ${fits ? 'fits before bed' : 'too long for what’s left of tonight'}`
  } else if (pick) line = pick.type === 'movie' ? 'Film' : 'Show'

  const verb = pick?.status === 'watching' ? 'Pick up' : 'Start'
  const open = (): void => {
    if (pick) go({ name: 'title', type: pick.type, id: pick.id })
  }

  return (
    <div className="spotlight">
      <div className="spot-pool" aria-hidden />
      <Pills />

      <div className="spot-center">
        <TonightDial evenings={prefs} minutesEach={each} count={pick ? fits : 0} now={now}>
          {pick ? (
            <button className="spot-poster" onClick={open} aria-label={`Open ${pick.title.name}`}>
              <Poster path={pick.title.posterPath} type={pick.type} name={pick.title.name} size="w342" />
            </button>
          ) : (
            <Sparkles size={40} className="spot-empty-icon" />
          )}
        </TonightDial>

        <div className="spot-under">
          {pick ? (
            <>
              <h1>
                {verb} {pick.title.name}?
              </h1>
              <p>{line}</p>
              <div className="spot-btns">
                {isShow && next ? (
                  <button
                    className="spot-btn pri"
                    disabled={busy || !details}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        setLibrary(await window.api.setEpisodes(itemOf(details!), [episodeKey(next.season, next.episode)], true))
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    <Check size={17} /> Tick it
                  </button>
                ) : (
                  <button className="spot-btn pri" onClick={open}>
                    Open it
                  </button>
                )}
                {picks.length > 1 && (
                  <button className="spot-btn" onClick={() => setSkip((n) => n + 1)}>
                    Something else
                  </button>
                )}
              </div>
              <JustTonight now={now} />
            </>
          ) : (
            <>
              <h1>Find something to watch</h1>
              <p>{all.length ? 'Nothing on your watchlist or in progress right now.' : 'Search for a film or show, open it and give it a status.'}</p>
              <div className="spot-btns">
                <button className="spot-btn pri" onClick={focusSearch}>
                  <Search size={17} /> Search
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ForYou />
    </div>
  )
}
