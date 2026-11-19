import { ChevronLeft, ChevronRight, Heart, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FAVOURITES_MAX } from '@core/favourites'
import { formatDate, formatMonth, plural } from '@core/format'
import { localDate } from '@core/library'
import { boxSetCard, finishedShelf, shelvesByYear, type BoxSetCard, type ComingSoon, type FinishedBox } from '@core/shelf'
import { formatHours } from '@core/time'
import type { TitleRef } from '@core/types'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import Poster from './Poster'

type Room = 'shelf' | 'favourites'

/** How many finished box sets show before "Show all". */
const FIRST = 60

/**
 * The shelf: what you're waiting for, shrink-wrapped with its date (phase 59), and a box set for
 * everything you've finished. Beside it, the favourites wall (phase 58): your all-time top films
 * and shows as framed posters, in your order.
 */
/** The room you were last in, so coming back from a title page lands where you left (and the poster shrinks back into place). */
let lastRoom: Room = 'shelf'

export default function ShelfSheet({ room }: { room?: Room }): React.JSX.Element {
  const [here, setRoom] = useState<Room>(room ?? lastRoom)
  const setHere = (r: Room): void => {
    lastRoom = r
    setRoom(r)
  }
  const favourites = useApp((s) => s.library.favourites?.length ?? 0)
  return (
    <Sheet className="shelf-sheet">
      <div className="sheet-head">
        <h1>Your shelf</h1>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={here === 'shelf'} className={here === 'shelf' ? 'on' : ''} onClick={() => setHere('shelf')}>
          Shelf
        </button>
        <button role="tab" aria-selected={here === 'favourites'} className={here === 'favourites' ? 'on' : ''} onClick={() => setHere('favourites')}>
          Favourites wall {favourites > 0 && <span className="count">{favourites}</span>}
        </button>
      </div>
      {here === 'shelf' ? <Shelf /> : <FavouritesWall />}
    </Sheet>
  )
}

function Shelf(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const [soon, setSoon] = useState<ComingSoon[] | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  const keys = Object.keys(library.entries).sort().join(',')

  useEffect(() => {
    let live = true
    window.api.comingSoon().then((r) => {
      if (!live) return
      if (r.ok) {
        setSoon(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [keys])

  const finished = useMemo(() => finishedShelf(library), [library])
  const shown = useMemo(() => (all ? finished : finished.slice(0, FIRST)), [all, finished])
  const shelves = useMemo(() => shelvesByYear(shown), [shown])
  const [pulled, setPulled] = useState<FinishedBox | null>(null)

  return (
    <>
      <h2 className="list-sub">Coming soon</h2>
      {error && <p className="error">{error}</p>}
      {!soon && !error && <p className="muted">Checking what’s coming…</p>}
      {soon && !soon.length && <p className="muted">Nothing announced yet for the shows you watch or the films on your watchlist.</p>}
      {soon && soon.length > 0 && (
        <div className="shelf-row soon">
          {soon.map((c) => (
            <button key={`${c.key}:${c.season ?? ''}`} className={`box ${c.out ? 'out' : 'wrapped'}`} onClick={() => go({ name: 'title', type: c.type, id: c.id })} title={c.name}>
              <span className="box-art">
                <Poster path={c.posterPath} type={c.type} id={c.id} name={c.name} size="w185" />
                {c.out ? <span className="box-wrap-off" aria-hidden /> : <span className="box-wrap" aria-hidden />}
                <span className={`box-sticker ${c.out ? 'out' : ''}`}>{c.out ? (c.date === localDate(new Date()) ? 'Out today' : 'Out now') : c.date ? shortDate(c.date) : 'Date TBA'}</span>
              </span>
              <span className="box-name">{c.name}</span>
              <span className="box-meta">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      <h2 className="list-sub">
        Finished <span className="muted small">{finished.length ? plural(finished.length, 'box set') : ''}</span>
      </h2>
      {!finished.length && <p className="muted">Everything you finish gets a box set here.</p>}
      {finished.length > 0 && <p className="muted small shelf-hint">Pull one out to see your history with it.</p>}
      <div className="shelf-room">
        {shelves.map((s) => (
          <section key={s.year ?? 'before'} className="shelf-unit">
            <h3 className="shelf-plate">
              <b>{s.year ?? 'Seen before Eclipse'}</b>
              <span>{plural(s.boxes.length, 'box set')}</span>
            </h3>
            <div className="shelf-row finished">
              {s.boxes.map((b) => (
                <button key={b.key} className={`box ${pulled?.key === b.key ? 'pulled' : ''}`} onClick={() => setPulled(b)} title={`Pull out ${b.name}`}>
                  <span className="box-art">
                    <Poster path={b.posterPath} type={b.type} id={b.id} name={b.name} size="w185" />
                  </span>
                  <span className="box-name">{b.name}</span>
                  <span className="box-meta">{b.finishedOn ? `Finished ${formatMonth(b.finishedOn)}` : b.year ? String(b.year) : 'Seen before Eclipse'}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!all && finished.length > FIRST && (
        <button className="link-btn" onClick={() => setAll(true)}>
          Show all {finished.length}
        </button>
      )}
      {pulled && <BoxCase box={pulled} onClose={() => setPulled(null)} />}
    </>
  )
}

/**
 * Phase 52: a box set pulled off the shelf. The front is its poster (click it to step into the
 * title's page); the back is your history with it: when you started and finished, the hours, who
 * you watched it with, your best-rated episode, and its credits, like the back of a DVD box.
 */
function BoxCase({ box, onClose }: { box: FinishedBox; onClose: () => void }): React.JSX.Element {
  const entry = useApp((s) => s.library.entries[box.key])
  const go = useApp((s) => s.go)
  // From your library straight away (dates, who with); TMDB's hours, cast and best episode follow.
  const quick = useMemo(() => (entry ? boxSetCard(entry) : null), [entry])
  const [full, setFull] = useState<BoxSetCard | null>(null)
  const [loading, setLoading] = useState(true)
  const putBack = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    window.api.boxSet(box.key).then((r) => {
      if (!live) return
      if (r.ok) setFull(r.value)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [box.key, entry])

  useEffect(() => {
    putBack.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Escape puts the box back rather than leaving the shelf.
      e.stopImmediatePropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  const c = full ?? quick
  const open = (): void => go({ name: 'title', type: box.type, id: box.id })
  if (!c) return <></>

  const facts: [string, React.ReactNode][] = []
  if (c.type === 'tv') {
    if (c.started) facts.push(['Started', formatDate(c.started)])
    if (c.finished) facts.push(['Finished', formatDate(c.finished)])
  } else if (c.finished) facts.push(['Watched', formatDate(c.finished)])
  if (c.binge) facts.push(['Most in one day', `${plural(c.binge.episodes, 'episode')}, ${formatDate(c.binge.day)}`])
  if (c.best)
    facts.push([
      'Best episode you saw',
      <>
        S{c.best.season} E{c.best.episode} · {c.best.name} <span className="case-star">★ {c.best.rating.toFixed(1)}</span>
      </>
    ])
  if (c.with.length) facts.push(['Watched with', c.with.join(', ')])
  if (c.from) facts.push(['Recommended by', c.from])
  if (c.rating != null) facts.push(['Your rating', `${c.rating} / 10`])

  // On the page itself, not inside the shelf's sheet, so it sits over everything (the dock too).
  return createPortal(
    <>
      <div className="case-scrim" onClick={onClose} aria-hidden />
      <div className="case" role="dialog" aria-modal="true" aria-label={`${c.name}: your box set`}>
        <button className="case-front" onClick={open} title={`Open ${c.name}`}>
          <span className="case-spine" aria-hidden />
          <Poster path={box.posterPath} type={box.type} id={box.id} name={c.name} size="w500" />
          <span className="case-gloss" aria-hidden />
        </button>
        <div className="case-back">
          <span className="case-kicker">{c.finished ? `Finished ${formatMonth(c.finished)}` : 'Seen before Eclipse'}</span>
          <h2>
            {c.name} {c.year ? <span className="case-year">{c.year}</span> : null}
          </h2>
          {c.tagline && <p className="case-tagline">{c.tagline}</p>}

          <div className="case-stats">
            <Stat value={c.minutes ? formatHours(c.minutes) : '—'} label={c.estimated ? 'about this long, every watch' : 'spent on it, every watch'} />
            {c.type === 'tv' && <Stat value={c.totalEpisodes ? `${c.episodes} / ${c.totalEpisodes}` : String(c.episodes)} label={c.seasons > 1 ? `episodes, ${c.seasons} seasons` : 'episodes'} />}
            {c.days && c.days > 1 && <Stat value={plural(c.days, 'day')} label="from first to last" />}
            {c.timesThrough > 1 && <Stat value={`${c.timesThrough}×`} label="all the way through" />}
          </div>

          {facts.length > 0 && (
            <dl className="case-facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {c.watches.length > 1 && (
            <ol className="case-watches">
              {c.watches.map((w, i) => (
                <li key={i}>
                  <b>{w.label}</b>
                  <span>{watchSpan(w)}</span>
                  {c.type === 'tv' && w.episodes > 0 && <em>{plural(w.episodes, 'episode')}</em>}
                </li>
              ))}
            </ol>
          )}

          {c.note && <blockquote className="case-note">“{c.note}”</blockquote>}

          {(c.starring.length > 0 || c.directors.length > 0) && (
            <div className="case-credits">
              {c.directors.length > 0 && (
                <p>
                  <span>Directed by</span> {c.directors.join(' & ')}
                </p>
              )}
              {c.starring.length > 0 && (
                <p>
                  <span>Starring</span> {c.starring.map((p) => p.name).join(' · ')}
                </p>
              )}
            </div>
          )}
          {loading && !full && <p className="muted small">Fetching the hours and credits…</p>}

          <div className="case-actions">
            <button className="btn primary" onClick={open}>
              Open its page
            </button>
            <button className="btn" ref={putBack} onClick={onClose}>
              Put it back
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

function Stat({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="case-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/** "3 Jan to 14 Mar 2025", "since 2 May 2026" or "before Eclipse". */
function watchSpan(w: { from: string | null; to: string | null; going: boolean }): string {
  if (w.going) return w.from ? `since ${formatDate(w.from)}` : 'still going'
  if (!w.from || !w.to) return w.to ? formatDate(w.to) : 'before Eclipse'
  if (w.from === w.to) return formatDate(w.from)
  return `${formatDate(w.from)} to ${formatDate(w.to)}`
}

/** "8 Apr 2027", short enough for a sticker. */
const shortDate = (day: string): string => {
  const [d, m, y] = formatDate(day).split(' ')
  return `${d} ${m.slice(0, 3)} ${y}`
}

function FavouritesWall(): React.JSX.Element {
  const favourites = useApp((s) => s.library.favourites ?? [])
  const setLibrary = useApp((s) => s.setLibrary)
  const go = useApp((s) => s.go)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const move = async (from: number, to: number): Promise<void> => {
    if (to < 0 || to >= favourites.length || from === to) return
    setLibrary(await window.api.moveFavourite(from, to))
  }
  const remove = async (ref: TitleRef): Promise<void> => setLibrary(await window.api.setFavourite(ref, false))

  if (!favourites.length) {
    return (
      <div className="hall fav-empty">
        <span className="hall-kicker">Your all-time favourites</span>
        <h2 className="hall-title">Hall of fame</h2>
        <Heart size={28} />
        <p>Your hall of fame. Open a film or show you love and press <b>Favourite</b>, and it hangs here as a framed poster.</p>
        <p className="muted small">Up to {FAVOURITES_MAX}. Drag them into your own order.</p>
      </div>
    )
  }

  return (
    <div className="hall">
      <header className="hall-head">
        <span className="hall-kicker">Your all-time favourites</span>
        <h2>Hall of fame</h2>
        <span className="hall-sub">
          {plural(favourites.length, 'title')} · drag a frame to change the order
        </span>
      </header>
      <ol className="fav-wall">
        {favourites.map((r, i) => (
          <li
            key={r.key}
            className={`fav ${i === 0 ? 'first' : ''} ${dragFrom === i ? 'dragging' : ''} ${over === i && dragFrom !== null && dragFrom !== i ? 'over' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragFrom(i)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(i)
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={async (e) => {
              e.preventDefault()
              if (dragFrom !== null) await move(dragFrom, i)
              setDragFrom(null)
              setOver(null)
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setOver(null)
            }}
          >
            <span className="fav-beam" aria-hidden />
            <span className="fav-glow" aria-hidden>
              <Poster path={r.posterPath} type={r.type} id={r.id} name="" size="w185" />
            </span>
            <button className="fav-frame" onClick={() => go({ name: 'title', type: r.type, id: r.id })} onMouseMove={tilt} onMouseLeave={untilt} title={`Open ${r.name}`}>
              <span className="fav-mat">
                <Poster path={r.posterPath} type={r.type} id={r.id} name={r.name} size={i === 0 ? 'w500' : 'w342'} />
                <span className="fav-glare" aria-hidden />
              </span>
              {i === 0 && <span className="fav-medal">No. 1</span>}
            </button>
            <span className="fav-plaque">
              <em>No. {i + 1}</em>
              <b>{r.name}</b>
              {r.year ? <span>{r.year}</span> : null}
            </span>
            <span className="fav-tools">
              <button aria-label={`Move ${r.name} up the wall`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ChevronLeft size={15} />
              </button>
              <button aria-label={`Move ${r.name} down the wall`} disabled={i === favourites.length - 1} onClick={() => move(i, i + 1)}>
                <ChevronRight size={15} />
              </button>
              <button aria-label={`Take ${r.name} off the wall`} onClick={() => remove(r)}>
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="hall-floor" aria-hidden />
    </div>
  )
}

/** The frame under the mouse leans towards it a little, and its glass catches the light. */
const tilt = (e: React.MouseEvent<HTMLElement>): void => {
  const root = document.documentElement
  if (root.hasAttribute('data-still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`)
  el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`)
  el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`)
}
const untilt = (e: React.MouseEvent<HTMLElement>): void => {
  for (const v of ['--rx', '--ry', '--gx', '--gy']) e.currentTarget.style.removeProperty(v)
}

/** Favourite, on a title page: hangs it on the wall or takes it down. */
export function FavouriteButton({ title: r, className }: { title: TitleRef; className: string }): React.JSX.Element {
  const on = useApp((s) => !!s.library.favourites?.some((f) => f.key === r.key))
  const full = useApp((s) => (s.library.favourites?.length ?? 0) >= FAVOURITES_MAX)
  const setLibrary = useApp((s) => s.setLibrary)
  return (
    <button
      className={`${className} ${on ? 'lit' : ''}`}
      aria-pressed={on}
      disabled={!on && full}
      title={!on && full ? `The wall is full (${FAVOURITES_MAX}). Take one down first.` : on ? 'On your favourites wall' : 'Hang it on your favourites wall'}
      onClick={async () => setLibrary(await window.api.setFavourite(r, !on))}
    >
      <Heart size={13} fill={on ? 'currentColor' : 'none'} /> {on ? 'Favourite' : 'Add to favourites'}
    </button>
  )
}
