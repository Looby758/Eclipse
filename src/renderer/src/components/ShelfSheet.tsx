import { ChevronLeft, ChevronRight, Heart, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FAVOURITES_MAX } from '@core/favourites'
import { formatDate, formatMonth, plural } from '@core/format'
import { localDate } from '@core/library'
import { finishedShelf, type ComingSoon } from '@core/shelf'
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
export default function ShelfSheet({ room = 'shelf' }: { room?: Room }): React.JSX.Element {
  const [here, setHere] = useState<Room>(room)
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
  const shown = all ? finished : finished.slice(0, FIRST)

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
      <div className="shelf-row finished">
        {shown.map((b) => (
          <button key={b.key} className="box" onClick={() => go({ name: 'title', type: b.type, id: b.id })} title={b.name}>
            <span className="box-art">
              <Poster path={b.posterPath} type={b.type} id={b.id} name={b.name} size="w185" />
            </span>
            <span className="box-name">{b.name}</span>
            <span className="box-meta">{b.finishedOn ? `Finished ${formatMonth(b.finishedOn)}` : 'Seen before Eclipse'}</span>
          </button>
        ))}
      </div>
      {!all && finished.length > FIRST && (
        <button className="link-btn" onClick={() => setAll(true)}>
          Show all {finished.length}
        </button>
      )}
    </>
  )
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
      <div className="fav-empty">
        <Heart size={28} />
        <p>Your hall of fame. Open a film or show you love and press <b>Favourite</b>, and it hangs here as a framed poster.</p>
        <p className="muted small">Up to {FAVOURITES_MAX}. Drag them into your own order.</p>
      </div>
    )
  }

  return (
    <>
      <p className="muted small">Drag a frame to move it, or use the arrows. Up to {FAVOURITES_MAX}.</p>
      <ol className="fav-wall">
        {favourites.map((r, i) => (
          <li
            key={r.key}
            className={`fav ${dragFrom === i ? 'dragging' : ''} ${over === i && dragFrom !== null && dragFrom !== i ? 'over' : ''}`}
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
            <button className="fav-frame" onClick={() => go({ name: 'title', type: r.type, id: r.id })} title={`Open ${r.name}`}>
              <span className="fav-mat">
                <Poster path={r.posterPath} type={r.type} id={r.id} name={r.name} size="w342" />
              </span>
            </button>
            <span className="fav-plaque">
              <b>{r.name}</b>
              {r.year ? <span>{r.year}</span> : null}
            </span>
            <span className="fav-tools">
              <button aria-label={`Move ${r.name} earlier`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ChevronLeft size={15} />
              </button>
              <button aria-label={`Move ${r.name} later`} disabled={i === favourites.length - 1} onClick={() => move(i, i + 1)}>
                <ChevronRight size={15} />
              </button>
              <button aria-label={`Take ${r.name} off the wall`} onClick={() => remove(r)}>
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
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
