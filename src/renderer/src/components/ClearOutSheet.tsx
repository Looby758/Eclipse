import { ArrowLeft, ArrowRight, ExternalLink, RotateCcw, SkipForward, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { clearOutOrder } from '@core/library'
import { formatDate, formatRuntime, plural } from '@core/format'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'
import { useAvailability, useDetailsMany } from '../lib/availability'
import Sheet from './Sheet'
import Poster from './Poster'
import Credits from './Credits'

type Order = 'oldest' | 'newest' | 'notMine'
const ORDERS: { id: Order; label: string }[] = [
  { id: 'oldest', label: 'Oldest additions first' },
  { id: 'notMine', label: 'Not on my services first' },
  { id: 'newest', label: 'Newest first' }
]

/** "Recently dropped", with Put back. Also shown under the Library's Want to watch tab. */
export function RecentlyDropped({ limit }: { limit?: number }): React.JSX.Element | null {
  const dropped = useApp((s) => s.library.dropped)
  const setLibrary = useApp((s) => s.setLibrary)
  if (!dropped?.length) return null
  return (
    <section className="dropped">
      <h2 className="list-sub">Recently dropped</h2>
      <ul>
        {dropped.slice(0, limit).map((d) => (
          <li key={d.entry.key}>
            <span>
              {d.entry.title.name}
              <span className="muted small"> · dropped {formatDate(d.droppedAt.slice(0, 10))}</span>
            </span>
            <button className="link-btn inline small" onClick={async () => setLibrary(await window.api.restoreDropped(d.entry.key))}>
              <RotateCcw size={13} /> Put back
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Clear out the watchlist: one title at a time, with its trailer, Keep or Drop. Dropped titles go to
 * "Recently dropped", so nothing is lost by accident. Keys: → or K keep, ← or D drop, S skip.
 */
export default function ClearOutSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { setLibrary, go } = useApp.getState()
  const [order, setOrder] = useState<Order>('oldest')
  const [queue, setQueue] = useState<TitleKey[] | null>(null)
  const [pos, setPos] = useState(0)
  const [kept, setKept] = useState(0)
  const [dropped, setDropped] = useState(0)
  const want = Object.values(library.entries).filter((e) => e.status === 'want')
  const wantKeys = want.map((e) => e.key)
  const { map: avail, checking } = useAvailability(wantKeys, order === 'notMine' && !queue)
  const key = queue?.[pos]
  const { map: details } = useDetailsMany(queue ? queue.slice(pos, pos + 2) : [], !!queue)
  const entry = key ? library.entries[key] : undefined
  const d = key ? details[key] : undefined
  const done = !!queue && pos >= queue.length

  const start = (): void => {
    setQueue(clearOutOrder(library, order, (k) => (avail[k] === undefined ? undefined : avail[k] === 'mine')).map((e) => e.key))
    setPos(0)
    setKept(0)
    setDropped(0)
  }
  const keep = (): void => {
    setKept((n) => n + 1)
    setPos((p) => p + 1)
  }
  const drop = async (): Promise<void> => {
    if (!key) return
    setLibrary(await window.api.dropTitle(key))
    setDropped((n) => n + 1)
    setPos((p) => p + 1)
  }
  const skip = (): void => setPos((p) => p + 1)

  useEffect(() => {
    if (!queue || done) return
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'k') keep()
      else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'd') void drop()
      else if (e.key.toLowerCase() === 's') skip()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Something already gone (dropped elsewhere, or no longer Want to watch): move past it.
  useEffect(() => {
    if (queue && key && (!entry || entry.status !== 'want')) setPos((p) => p + 1)
  }, [queue, key, entry])

  if (!queue) {
    return (
      <Sheet className="clearout">
        <div className="sheet-head">
          <h1>Clear out the watchlist</h1>
        </div>
        <p className="muted">
          Go through your {plural(want.length, 'title')} to watch one at a time, with its trailer, and decide: <strong>Keep</strong> or <strong>Drop</strong>. Dropped titles go to <em>Recently dropped</em>, so you can put back
          anything you didn’t mean to.
        </p>
        <div className="segmented">
          {ORDERS.map((o) => (
            <button key={o.id} className={order === o.id ? 'on' : ''} onClick={() => setOrder(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary big" disabled={!want.length || (order === 'notMine' && checking)} onClick={start}>
            {order === 'notMine' && checking ? 'Checking your services…' : 'Start'}
          </button>
        </div>
        <RecentlyDropped />
        <Credits />
      </Sheet>
    )
  }

  if (done) {
    return (
      <Sheet className="clearout">
        <div className="sheet-head">
          <h1>All done</h1>
        </div>
        <p>
          You kept {kept} and dropped {dropped}.{' '}
          {want.length ? `${plural(want.length, 'title')} still on your watchlist.` : 'Your watchlist is empty.'}
        </p>
        <div className="row">
          <button className="btn glass" onClick={() => setQueue(null)}>
            Go through again
          </button>
          <button className="btn glass" onClick={() => go({ name: 'library' })}>
            Back to Library
          </button>
        </div>
        <RecentlyDropped />
        <Credits />
      </Sheet>
    )
  }

  return (
    <Sheet className="clearout">
      <div className="clearout-top">
        <span className="muted small">
          {pos + 1} of {queue.length} · kept {kept} · dropped {dropped}
        </span>
        <button className="link-btn inline small" onClick={() => setQueue(null)}>
          Stop
        </button>
      </div>
      {entry && (
        <div className="clearout-card">
          <div className="clearout-poster">
            <Poster path={entry.title.posterPath} type={entry.type} id={entry.id} name={entry.title.name} size="w342" />
          </div>
          <div className="clearout-body">
            <h1>{entry.title.name}</h1>
            <p className="muted">
              {[entry.type === 'movie' ? 'Film' : 'Show', entry.title.year, d?.genres.slice(0, 2).join(' · '), entry.type === 'movie' && d?.runtime ? formatRuntime(d.runtime) : d?.numberOfSeasons ? plural(d.numberOfSeasons, 'season') : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="muted small">
              On your watchlist since {formatDate(entry.addedAt.slice(0, 10))}
              {entry.from ? `, from ${entry.from}` : ''}
            </p>
            {d?.trailer ? (
              <div className="clearout-trailer">
                <iframe
                  key={d.trailer}
                  src={`https://www.youtube-nocookie.com/embed/${d.trailer}?rel=0&modestbranding=1`}
                  title={`${entry.title.name} trailer`}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <p className="clearout-overview">{d ? d.overview || 'No trailer or summary on TMDB.' : 'Loading…'}</p>
            )}
            {d?.trailer && (
              <button className="link-btn inline small" onClick={() => window.api.openExternal(`https://www.youtube.com/watch?v=${d.trailer}`)}>
                <ExternalLink size={13} /> Trailer not playing? Watch it on YouTube
              </button>
            )}
            <div className="clearout-actions">
              <button className="btn big danger" onClick={() => void drop()}>
                <ArrowLeft size={18} /> <Trash2 size={18} /> Drop
              </button>
              <button className="btn big glass" onClick={skip} title="Decide later (S)">
                <SkipForward size={18} /> Skip
              </button>
              <button className="btn big primary" onClick={keep}>
                Keep <ArrowRight size={18} />
              </button>
            </div>
            <p className="muted small">Keys: → or K keep, ← or D drop, S skip.</p>
          </div>
        </div>
      )}
      <Credits />
    </Sheet>
  )
}
