import { Check, Hourglass, Library, LibraryBig, ListChecks, Moon, Search, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { entriesWith, isTogether, nextEpisodeFor, nextSession, preferencesOf, withTogether } from '@core/library'
import { sessionLabel } from '../lib/together'
import { formatRuntime, plural } from '@core/format'
import { clock, episodeMinutes, fitTonight, startBy, tonight } from '@core/time'
import { episodeKey, type LibraryEntry, type TitleDetails } from '@core/types'
import { currentView, useApp, type View } from '../store/app'
import { itemOf } from '../lib/item'
import Poster from './Poster'
import TonightDial from './TonightDial'
import JustTonight from './JustTonight'
import HomeNotes from './HomeNotes'
import OnThisDay from './OnThisDay'
import { candidates } from './HomeHero'
import { focusSearch } from './Dock'
import PremiereNight from './PremiereNight'
import { seasonId, usePremieres } from '../lib/premiere'

const NAV: { view: View['name']; label: string; icon: typeof Moon }[] = [
  { view: 'home', label: 'Tonight', icon: Moon },
  { view: 'library', label: 'Library', icon: Library },
  { view: 'soon', label: 'Soon', icon: Hourglass },
  { view: 'lists', label: 'Lists', icon: ListChecks },
  { view: 'shelf', label: 'Shelf', icon: LibraryBig }
]

/** Spotlight's navigation: small glass pills in the top right (Home and the Spotlight title page). */
export function Pills(): React.JSX.Element {
  const go = useApp((s) => s.go)
  const here = useApp((s) => currentView(s).name)
  return (
    <nav className="spot-pills" aria-label="Main">
      {NAV.map(({ view, label, icon: Icon }) => (
        <button key={view} className={`spot-pill ${view === here || (view === 'lists' && here === 'list') ? 'on' : ''}`} onClick={() => go({ name: view } as View)}>
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

/**
 * The Home column: the Home cards in a column on the right, always open and untitled, so whatever needs you
 * (did you watch this, add this show, watching together) is there when you come back. The column
 * hides itself when every card is empty, and the dial moves back to the middle (see app.css).
 */
function HomeColumn(): React.JSX.Element {
  return (
    <aside className="spot-waiting" aria-label="Home items">
      <HomeNotes />
      <OnThisDay />
    </aside>
  )
}

/** The new Home (Phase 34): tonight's pick inside the Tonight dial, over drifting rows of posters. */
export default function SpotlightHome(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const [skip, setSkip] = useState(0)
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [busy, setBusy] = useState(false)
  // Phase 60: the tick mark pops each time Tick it works.
  const [ticked, setTicked] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const prefs = preferencesOf(library)
  // Phase 50: on the day a season you've been waiting for is out, Home turns into that show.
  const premieres = usePremieres(now)
  const [premiereKey, setPremiereKey] = useState<string | null>(null)
  const shown = premieres.list.filter((p) => !premieres.hidden(p))
  const premiere = shown.find((p) => seasonId(p) === premiereKey) ?? shown[0] ?? null

  const all = entriesWith(library)
  // Watches with someone ("with Jack") are picks too, with that watch's own progress.
  const picks = withTogether(candidates(all, (library.watchSoon ?? []).map((r) => r.key)), library)
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
  // Watching with someone at a time you've arranged: count from when it starts.
  const session = isTogether(pick) ? nextSession(pick.rewatches![pick.together.index], now) : null
  const from = session && session > now ? session : now
  const t = tonight(now, prefs)
  // An arranged time on a night you don't usually watch makes it a watching night.
  const ev = session && !t.slots.length ? { ...prefs, justTonight: { day: t.day, start: clock(from.getHours() * 60 + from.getMinutes()) } } : prefs
  const offNight = !tonight(now, ev).slots.length
  const fits = details ? (isShow ? fitTonight(from, ev, each) : fitTonight(from, ev, each) > 0 ? 1 : 0) : 0

  let line = ''
  if (pick && details && offNight) line = isShow && next ? `S${next.season} E${next.episode} · not a watching night` : `${formatRuntime(each)} · not a watching night`
  else if (pick && details) {
    if (isShow && next && session && session > now) line = `S${next.season} E${next.episode} · ${sessionLabel(session, now)} · ${fits ? `${plural(fits, 'episode')} ${fits === 1 ? 'fits' : 'fit'} before bed` : 'no time for one before bed'}`
    else if (isShow && next) line = `S${next.season} E${next.episode} · start by ${startBy(each, ev, now)} · ${fits ? `${plural(fits, 'episode')} ${fits === 1 ? 'fits' : 'fit'} before bed` : 'no time for one tonight'}`
    else if (isShow) line = 'All caught up'
    else line = `${formatRuntime(each)} · start by ${startBy(each, ev, now)} · ${fits ? 'fits before bed' : 'too long for what’s left of tonight'}`
  } else if (pick) line = pick.type === 'movie' ? 'Film' : 'Show'

  const verb = pick?.status === 'watching' ? 'Pick up' : 'Start'
  const withWho = isTogether(pick) ? ` with ${pick.together.who}` : ''
  const open = (): void => {
    if (pick) go({ name: 'title', type: pick.type, id: pick.id })
  }

  return (
    <div className="spotlight">
      <div className="spot-pool" aria-hidden />
      <Pills />

      {premiere ? (
        <PremiereNight
          key={seasonId(premiere)}
          premiere={premiere}
          info={premieres.info[premiere.item.key]}
          others={shown.filter((p) => p !== premiere)}
          onSwitch={(p) => setPremiereKey(seasonId(p))}
          onHide={() => premieres.hide(premiere)}
          onSetTime={(t) => premieres.setTime(premiere, t)}
        />
      ) : (
        <div className="spot-center">
          <TonightDial evenings={ev} minutesEach={each} count={pick ? fits : 0} now={now}>
            {pick ? (
              <button className="spot-poster" onClick={open} aria-label={`Open ${pick.title.name}`}>
                <Poster path={pick.title.posterPath} type={pick.type} id={pick.id} name={pick.title.name} size="w342" />
              </button>
            ) : (
              <Sparkles size={40} className="spot-empty-icon" />
            )}
          </TonightDial>

          <div className="spot-under">
            {pick ? (
              <>
                <h1>
                  {verb} {pick.title.name}
                  {withWho}?
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
                          const ep = [episodeKey(next.season, next.episode)]
                          setLibrary(isTogether(pick) ? await window.api.tickWith(pick.key, pick.together.index, ep, true) : await window.api.setEpisodes(itemOf(details!), ep, true))
                          setTicked((n) => n + 1)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      <Check key={ticked} size={17} className={ticked ? 'tick-pop' : ''} /> Tick it
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
      )}

      <HomeColumn />
    </div>
  )
}
