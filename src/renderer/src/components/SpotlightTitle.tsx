import { tickEpisode } from '../lib/tickEpisode'
import TrailerButton from './TrailerButton'
import { Bookmark, Check, ChevronDown, CircleCheck, CirclePause, CirclePlay, ExternalLink, Hourglass, Image, Plus, Popcorn, RectangleHorizontal, RectangleVertical, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDate, formatRuntime, plural, stingerLine } from '@core/format'
import { activeEntry, currentRewatch, localDate, nextEpisodeFor, preferencesOf, watchCount } from '@core/library'
import { removeQuestion } from '@core/safety'
import { formatHours, seasonLeft } from '@core/time'
import { imageUrl, tmdbPageUrl } from '@core/tmdb'
import { showCount, universeName, type UniverseItem } from '@core/universe'
import { isWatchSoon } from '@core/watchsoon'
import { serviceNameOf } from '@core/watching'
import { episodeKey, STATUS_LABELS, WATCH_STATUSES, type MediaType, type SeasonDetails, type TitleDetails, type WatchProviders, type WatchStatus } from '@core/types'
import { useApp } from '../store/app'
import { isTyping } from '../lib/keys'
import { itemOf } from '../lib/item'
import { Pills } from './SpotlightHome'
import RatingBars from './RatingBars'
import { CastStrip, shortName, UniverseAll, UniverseStrip } from './TitleStrips'
import WatchButton from './WatchButton'
import EntryDetails from './EntryDetails'
import RewatchPanel from './RewatchPanel'
import WatchWithPanel from './WatchWithPanel'
import TimeCard from './TimeCard'
import MomentsPanel from './MomentsPanel'
import Heatmap from './Heatmap'
import EpisodeTimeline, { type EpisodeFocus } from './EpisodeTimeline'
import WhereToWatch from './WhereToWatch'
import TitleLinks from './TitleLinks'
import Credits from './Credits'
import PosterPicker from './PosterPicker'
import TickRing from './TickRing'
import { FavouriteButton } from './ShelfSheet'
import { CountdownButton } from './Countdowns'
import JourneyRibbon from './JourneyRibbon'
import TitleSky from './TitleSky'
import { journeyOf } from '@core/journey'

const ICONS: Record<WatchStatus, typeof Bookmark> = { want: Bookmark, watching: CirclePlay, watched: CircleCheck, stopped: CirclePause }

type Panel = 'universe' | 'episodes' | 'note' | 'with' | 'time' | 'moments' | 'rewatch' | 'where' | 'more' | 'poster' | 'backdrop' | 'journey'

/**
 * The Spotlight look's title page ("All on one screen"): the show's own picture fills the window,
 * with its logo, the question of what's next and your status top left, how far through you are top
 * right, and along the bottom every episode's rating, the cast and the rest of its universe that's
 * in your library. Everything else (notes, watching with someone, where to watch…) opens in a
 * frosted panel from the pills under the buttons. The Classic look keeps the old page.
 */
export default function SpotlightTitle({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const [details, setDetails] = useState<TitleDetails | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [seasons, setSeasons] = useState<SeasonDetails[]>([])
  const [universe, setUniverse] = useState<{ name: string; items: UniverseItem[] }>({ name: '', items: [] })
  const [panel, setPanel] = useState<Panel | null>(null)
  const [focus, setFocus] = useState<EpisodeFocus | null>(null)
  const [busy, setBusy] = useState(false)
  // "Just the picture": everything fades away but the (still slowly drifting) picture. P switches it, and any click or key brings it all back.
  const [bare, setBare] = useState(false)
  useEffect(() => {
    if (bare) document.documentElement.dataset.bare = ''
    else delete document.documentElement.dataset.bare
    const key = (e: KeyboardEvent): void => {
      if (bare) {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        e.preventDefault()
        e.stopImmediatePropagation()
        setBare(false)
      } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target) && !document.querySelector('.st-drawer, .trailer-layer')) {
        e.preventDefault()
        setBare(true)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      delete document.documentElement.dataset.bare
    }
  }, [bare])
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const raw = library.entries[`${type}:${id}`]
  // The background you chose for this page, if any.
  const chosenBackdrop = library.backdrops?.[`${type}:${id}`]
  const entry = activeEntry(raw)

  const load = async (refresh = false): Promise<void> => {
    setRefreshing(refresh)
    const r = await window.api.details(type, id, refresh)
    setRefreshing(false)
    if (r.ok) {
      setDetails(r.value.data)
      setStale(r.value.stale)
      setError('')
    } else setError(r.error)
  }
  useEffect(() => {
    load()
  }, [type, id])

  // Every season's episodes, for the rating bars and the next episode's name.
  const numbers = details?.seasons.filter((s) => s.number > 0).map((s) => s.number) ?? []
  useEffect(() => {
    if (!details || details.type !== 'tv') return
    let cancelled = false
    Promise.all(numbers.map((n) => window.api.season(details.id, n))).then((rs) => !cancelled && setSeasons(rs.flatMap((r) => (r.ok ? [r.value.data] : []))))
    return () => {
      cancelled = true
    }
  }, [details?.id, numbers.join(',')])

  // The rest of its universe, from your library only (asked again when your library changes what's in it).
  const libraryKeys = Object.keys(library.entries).sort().join(',')
  useEffect(() => {
    let cancelled = false
    window.api.universe(type, id).then((r) => !cancelled && r.ok && setUniverse(r.value))
    return () => {
      cancelled = true
    }
  }, [type, id, libraryKeys, raw?.updatedAt])

  if (!details) {
    return (
      <div className="stitle">
        <div className="st-page st-loading">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</div>
      </div>
    )
  }

  const d = details
  const tv = d.type === 'tv'
  const today = localDate(new Date())
  const backdrop = imageUrl(chosenBackdrop ?? d.backdropPath, 'original')
  const logo = imageUrl(d.logoPath, 'w500')
  const count = tv ? showCount(d, entry, today) : null
  const thisSeason = tv ? seasonLeft(d, entry, today, seasons) : null
  const next = tv ? nextEpisodeFor(entry, d.seasons) : null
  const nextEp = next ? seasons.find((s) => s.number === next.season)?.episodes.find((e) => e.number === next.episode) : undefined
  const nextAired = next && (!nextEp ? !d.nextEpisode || d.nextEpisode.season > next.season || (d.nextEpisode.season === next.season && d.nextEpisode.episode > next.episode) || (!!d.nextEpisode.airDate && d.nextEpisode.airDate <= today) : !!nextEp.airDate && nextEp.airDate <= today)
  const started = !!count && count.seen > 0
  const filmDone = !tv && (entry?.status === 'watched' || !!entry?.seenBefore)
  const name = universe.name || universeName(d)

  const facts = [
    d.year ? String(d.year) : '',
    d.genres.slice(0, 2).join(' · '),
    !tv ? formatRuntime(d.runtime) : '',
    tv && d.numberOfSeasons ? plural(d.numberOfSeasons, 'season') : '',
    tv && d.runtime ? `~${formatRuntime(d.runtime)} episodes` : '',
    d.voteAverage ? `★ ${d.voteAverage.toFixed(1)}` : ''
  ].filter(Boolean)

  let question = ''
  let sub = ''
  if (tv) {
    if (next && nextAired) {
      question = started ? `Pick up ${shortName(d.name, name)}?` : `Start ${shortName(d.name, name)}?`
      sub = [`S${next.season} E${next.episode}`, nextEp?.name ? `“${nextEp.name}”` : '', formatRuntime(nextEp?.runtime ?? d.runtime)].filter(Boolean).join(' · ')
    } else if (next) {
      question = 'All caught up'
      const air = nextEp?.airDate ?? (d.nextEpisode?.season === next.season && d.nextEpisode.episode === next.episode ? d.nextEpisode.airDate : null)
      sub = `S${next.season} E${next.episode} is out ${air ? formatDate(air) : 'later'}`
    } else if (started) {
      question = 'You’ve seen all of it'
      sub = d.status === 'Ended' || d.status === 'Canceled' ? 'Every episode, start to finish' : 'Nothing new yet'
    }
  } else if (filmDone) {
    question = 'You’ve seen it'
    sub = raw?.watchedOn ? `Watched ${formatDate(raw.watchedOn)}` : 'Watched before Eclipse'
  } else {
    question = `Watch ${shortName(d.name, name)}?`
    sub = [formatRuntime(d.runtime), stingerLine(d.stingers)].filter(Boolean).join(' · ')
  }

  const tickIt = async (): Promise<void> => {
    setBusy(true)
    try {
      if (tv && next) setLibrary(await window.api.setEpisodes(itemOf(d), [episodeKey(next.season, next.episode)], true))
      else if (!tv) setLibrary(await window.api.setStatus(itemOf(d), 'watched'))
    } finally {
      setBusy(false)
    }
  }
  const canTick = (tv && !!next && !!nextAired) || (!tv && !filmDone)
  const openEpisode = (season: number, episode: number): void => {
    setFocus((f) => ({ season, episode, n: (f?.n ?? 0) + 1 }))
    setPanel('episodes')
  }

  const journey = tv ? journeyOf(raw, d.seasons) : null
  const watched = watchCount(raw)
  const rewatchLabel = currentRewatch(raw) ? 'Rewatching' : watched === 0 ? 'Seen it before?' : watched === 1 ? 'Watched once' : `Watched ${watched} times`
  const pills: { id: Panel; label: string; show: boolean; on?: boolean }[] = [
    { id: 'episodes', label: 'Episodes', show: tv },
    { id: 'note', label: entry?.note ? 'Note ✓' : 'Note', show: !!raw },
    { id: 'journey', label: 'Your journey', show: !!journey },
    { id: 'with', label: 'Watch with someone', show: tv },
    { id: 'time', label: tv ? 'Finish it by…' : 'Tonight', show: tv ? !!count && count.total > count.seen : !filmDone && !!d.runtime },
    { id: 'moments', label: `Moments (${raw?.moments?.length ?? 0})`, show: !!raw?.moments?.length },
    { id: 'rewatch', label: rewatchLabel, show: watched > 0 || !!currentRewatch(raw) || (tv ? !started : !filmDone) },
    { id: 'where', label: 'Where to watch', show: true },
    { id: 'more', label: 'More', show: true },
    { id: 'poster', label: 'Change poster', show: false },
    { id: 'backdrop', label: 'Change background', show: false }
  ]

  return (
    <div
      className={`stitle ${bare ? 'bare' : ''}`}
      onScroll={(e) => {
        // Phase 49: blur the picture into a night sky as you scroll down into the star map.
        const el = e.currentTarget
        const sky = el.querySelector<HTMLElement>('.st-sky')
        if (!sky) return
        const p = Math.min(1, Math.max(0, 1 - (sky.offsetTop - el.scrollTop) / el.clientHeight)).toFixed(3)
        // Set only on the two things that use it: set on the whole page, every scroll restyled everything on it.
        const bg = el.querySelector<HTMLElement>('.st-bg')
        const head = el.querySelector<HTMLElement>('.st-sky-head')
        if (bg?.style.getPropertyValue('--sky') === p) return
        bg?.style.setProperty('--sky', p)
        head?.style.setProperty('--sky', p)
        head?.classList.toggle('on', Number(p) > 0.8)
        bg?.classList.toggle('sky-on', Number(p) > 0)
      }}
      onClickCapture={(e) => {
        if (!bare) return
        e.stopPropagation()
        e.preventDefault()
        setBare(false)
      }}
    >
      {bare && <div className="st-bare-hint">Click anywhere or press any key to bring everything back</div>}
      <div className="st-bg" aria-hidden>
        {backdrop && <img src={backdrop} alt="" draggable={false} />}
      </div>
      <Pills />
      <div className="st-page">
        <div className="st-top">
          <div className="st-info">
            {logo ? <img className="st-logo" src={logo} alt={d.name} draggable={false} /> : <h1 className="st-name">{d.name}</h1>}
            <div className="st-facts">{facts.join(' · ')}</div>
            {question && (
              <div className="st-q">
                <h2>{question}</h2>
                {sub && <p>{sub}</p>}
              </div>
            )}
            <div className="st-actions">
              {canTick && (
                <button className="st-pill pri" onClick={tickIt} disabled={busy}>
                  <Check size={17} /> Tick it
                </button>
              )}
              <WatchButton details={d} />
              <StatusMenu details={d} />
            </div>
            <div className="st-extras">
              {pills
                .filter((p) => p.show)
                .map((p) => (
                  <button key={p.id} className={`st-chip ${panel === p.id ? 'on' : ''}`} onClick={() => setPanel(panel === p.id ? null : p.id)}>
                    {p.label}
                  </button>
                ))}
              <TrailerButton className="st-chip" details={d} />
              <SoonChip details={d} />
              <CountdownButton className="st-chip" details={d} />
              <FavouriteButton className="st-chip" title={{ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }} />
              <button className={`st-chip ${panel === 'poster' ? 'on' : ''}`} onClick={() => setPanel(panel === 'poster' ? null : 'poster')}>
                <RectangleVertical size={13} /> Change poster
              </button>
              <button className={`st-chip ${panel === 'backdrop' ? 'on' : ''}`} onClick={() => setPanel(panel === 'backdrop' ? null : 'backdrop')}>
                <RectangleHorizontal size={13} /> Change background
              </button>
              {backdrop && (
                <button className="st-chip" onClick={() => setBare(true)} title="Just the picture (P)">
                  <Image size={13} /> Just the picture
                </button>
              )}
            </div>
          </div>
          <div className="st-right">
            {count && count.total > 0 && (
              <div className="st-count">
                <TickRing seen={count.seen} total={count.total} />
                <b>
                  {count.seen}
                  <small> / {count.total}</small>
                </b>
                <span>episodes watched</span>
                {thisSeason && count.minutesLeft > thisSeason.minutes && (
                  <span>
                    {plural(thisSeason.episodes, 'episode')} and {thisSeason.estimated ? 'about ' : ''}
                    {formatHours(thisSeason.minutes)} left in season {thisSeason.season}
                  </span>
                )}
                {count.minutesLeft > 0 && <span>{thisSeason && count.minutesLeft > thisSeason.minutes ? `about ${formatHours(count.minutesLeft)} to finish the show` : `about ${formatHours(count.minutesLeft)} to go`}</span>}
              </div>
            )}
            <WhereChip type={d.type} id={d.id} onOpen={() => setPanel('where')} />
            {stale && <span className="st-stale">Offline: details saved earlier</span>}
          </div>
        </div>

        <div className="st-body">
          {tv && seasons.length > 0 && <RatingBars seasons={seasons} entry={entry} onPick={openEpisode} onTick={(season, episode, watched) => void tickEpisode(d, season, episode, watched)} />}
          <CastStrip details={d} universe={name} onMore={() => setPanel('more')} />
          <UniverseStrip name={name} items={universe.items} onAll={() => setPanel('universe')} />
        </div>
      </div>
      <TitleSky details={d} logo={logo} canTick={canTick} busy={busy} onTick={tickIt} />

      {panel && (
        <Drawer title={panel === 'universe' ? `${name} universe` : (pills.find((p) => p.id === panel)?.label ?? '')} onClose={() => setPanel(null)}>
          {panel === 'universe' && <UniverseAll name={name} items={universe.items} />}
          {panel === 'episodes' && (
            <>
              <Heatmap details={d} onPick={(season, episode) => setFocus((f) => ({ season, episode, n: (f?.n ?? 0) + 1 }))} />
              <EpisodeTimeline details={d} focus={focus} />
            </>
          )}
          {panel === 'note' && <EntryDetails titleKey={d.key} />}
          {panel === 'with' && <WatchWithPanel details={d} />}
          {panel === 'time' && <TimeCard details={d} />}
          {panel === 'moments' && <MomentsPanel titleKey={d.key} />}
          {panel === 'rewatch' && <RewatchPanel details={d} />}
          {panel === 'where' && <WhereToWatch type={d.type} id={d.id} />}
          {panel === 'poster' && <PosterPicker details={d} />}
          {panel === 'backdrop' && <PosterPicker details={d} kind="backdrops" />}
          {panel === 'journey' && journey && <JourneyRibbon journey={journey} onSeason={(n) => openEpisode(n, 1)} />}
          {panel === 'more' && (
            <div className="st-more">
              {d.tagline && <p className="tagline">{d.tagline}</p>}
              {d.overview && <p className="overview">{d.overview}</p>}
              {stingerLine(d.stingers) && (
                <p className="stinger">
                  <Popcorn size={15} /> {stingerLine(d.stingers)}
                </p>
              )}
              <dl className="meta-list">
                {d.date && (
                  <>
                    <dt>{tv ? 'First aired' : 'Released'}</dt>
                    <dd>{formatDate(d.date)}</dd>
                  </>
                )}
                {d.status && (
                  <>
                    <dt>Status</dt>
                    <dd>{d.status}</dd>
                  </>
                )}
                {d.collection && (
                  <>
                    <dt>Part of</dt>
                    <dd>
                      <button className="link-btn inline" onClick={() => useApp.getState().go({ name: 'list', id: `collection:${d.collection!.id}` })}>
                        {d.collection.name}
                      </button>
                    </dd>
                  </>
                )}
              </dl>
              <TitleLinks details={d} />
              <div className="title-actions">
                <button className="btn glass" onClick={() => setPanel('poster')}>
                  <Image size={15} /> Change poster
                </button>
                <button className="btn glass" onClick={() => load(true)} disabled={refreshing}>
                  <RefreshCw size={15} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh from TMDB'}
                </button>
                <button className="btn glass" onClick={() => window.api.openExternal(tmdbPageUrl(d.type, d.id))}>
                  <ExternalLink size={15} /> Open on TMDB
                </button>
              </div>
              <Credits justWatch />
            </div>
          )}
        </Drawer>
      )}
    </div>
  )
}

/** Full picture's status drop-down: the four statuses, then Remove (asking first if it has history). */
function StatusMenu({ details }: { details: TitleDetails }): React.JSX.Element {
  const entry = useApp((s) => s.library.entries[details.key])
  const setLibrary = useApp((s) => s.setLibrary)
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])

  const choose = async (status: WatchStatus | null): Promise<void> => {
    setOpen(false)
    setAsking(false)
    setLibrary(await window.api.setStatus(itemOf(details), status))
  }
  const question = entry ? removeQuestion(entry) : null
  const Icon = entry ? ICONS[entry.status] : Plus

  return (
    <div className={`st-dd ${open ? 'open' : ''}`} ref={ref}>
      <button className="st-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon size={16} /> {entry ? STATUS_LABELS[entry.status] : 'Add to library'} <ChevronDown size={15} className="st-caret" />
      </button>
      {open && (
        <div className="st-menu" role="menu">
          {WATCH_STATUSES.map((s) => {
            const I = ICONS[s]
            const on = entry?.status === s
            return (
              <button key={s} role="menuitemradio" aria-checked={on} className={on ? 'on' : ''} onClick={() => (on ? setOpen(false) : choose(s))}>
                <I size={15} /> {STATUS_LABELS[s]}
              </button>
            )
          })}
          {entry && (
            <>
              <hr />
              {asking && question ? (
                <div className="st-confirm" role="alertdialog" aria-label={question.title}>
                  <b>{question.title}</b>
                  <span>{question.detail}</span>
                  <div>
                    <button className="keep" onClick={() => setAsking(false)}>
                      Keep it
                    </button>
                    <button className="rm" onClick={() => choose(null)}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button className="rm" role="menuitem" onClick={() => (question ? setAsking(true) : choose(null))}>
                  <X size={15} /> Remove from library
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Watch soon as a pill that lights up. */
function SoonChip({ details: d }: { details: TitleDetails }): React.JSX.Element {
  const on = useApp((s) => isWatchSoon(s.library, d.key))
  const setLibrary = useApp((s) => s.setLibrary)
  return (
    <button
      className={`st-chip ${on ? 'lit' : ''}`}
      aria-pressed={on}
      onClick={async () => setLibrary(await window.api.setWatchSoon({ key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }, !on))}
    >
      <Hourglass size={13} /> {on ? 'On Watch soon' : 'Watch soon'}
    </button>
  )
}

/** Top right, under the count: the service it's on, yours first. */
function WhereChip({ type, id, onOpen }: { type: MediaType; id: number; onOpen: () => void }): React.JSX.Element | null {
  const mine = useApp((s) => preferencesOf(s.library).services)
  const [data, setData] = useState<WatchProviders | null>(null)
  useEffect(() => {
    let cancelled = false
    window.api.providers(type, id).then((r) => !cancelled && r.ok && setData(r.value.data))
    return () => {
      cancelled = true
    }
  }, [type, id])
  const pick = useMemo(() => {
    if (!data) return null
    const yours = [...data.stream, ...data.free].find((p) => mine.includes(p.id))
    if (yours) return { p: yours, note: 'In your services' }
    const free = data.free[0]
    if (free) return { p: free, note: 'Free to watch' }
    const other = data.stream[0]
    return other ? { p: other, note: 'Streaming' } : null
  }, [data, mine.join(',')])
  if (!pick) return null
  const icon = imageUrl(pick.p.logoPath, 'w92')
  return (
    <button className="st-where" onClick={onOpen} title="Where to watch">
      <span className="st-where-chip">
        {icon && <img src={icon} alt="" draggable={false} />} {serviceNameOf(pick.p.name)}
      </span>
      <span>{pick.note}</span>
    </button>
  )
}

/** The frosted panel on the right that the pills open. Escape closes it before going back a page. */
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <>
      <div className="st-scrim" onClick={onClose} aria-hidden />
      <aside className="st-drawer" role="dialog" aria-label={title}>
        <div className="st-drawer-head">
          <h2>{title}</h2>
          <button className="st-x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="st-drawer-body">{children}</div>
      </aside>
    </>
  )
}
