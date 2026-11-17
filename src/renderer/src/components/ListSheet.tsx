import { ArrowDown, ArrowUp, Check, Copy, GripVertical, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { findList, isItemSeen, itemKey, progressOf, sourceOf } from '@core/lists'
import { isRowSeenUndated, localDate, preferencesOf } from '@core/library'
import { onMyServices, type AvailabilityFilter as Filter, passesFilter, FILTER_LABELS } from '@core/providers'
import { formatShortDay, stingerShort } from '@core/format'
import { imageUrl } from '@core/tmdb'
import { parseEpisodeKey, STATUS_LABELS, type TitleRef } from '@core/types'
import { useApp } from '../store/app'
import { useAvailability, useDetailsMany } from '../lib/availability'
import { kindLabel, progressSentence, useList } from '../lib/lists'
import Sheet from './Sheet'
import Poster from './Poster'
import ProgressBar from './ProgressBar'
import AvailabilityFilter from './AvailabilityFilter'
import Credits from './Credits'

type Show = 'all' | 'left'

/**
 * One list: a person's films, a film series, a watch-order guide, a TMDB list or your own.
 * Shows how far through you are, highlights what's next and where it's on, and (for your own
 * lists) lets you reorder it as your own watch order.
 */
export default function ListSheet({ id }: { id: string }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const { view, error, reload } = useList(id)
  const source = sourceOf(id)
  const saved = findList(library, id)
  const own = source?.kind === 'custom'
  const [order, setOrder] = useState<'story' | 'release'>('release')
  const [show, setShow] = useState<Show>('all')
  const [filter, setFilter] = useState<Filter>('any')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [section, setSection] = useState<string | null>(null)
  const today = localDate(new Date())
  const services = preferencesOf(library).services

  const ordered = view ? (order === 'release' && view.releaseItems ? view.releaseItems : view.items) : []
  const items = section ? ordered.filter((i) => i.sections?.includes(section)) : ordered
  const progress = progressOf(items, library, today)
  const unseenKeys = [...new Set(progress.released.filter((i) => !isItemSeen(library, i)).map((i) => i.key))]
  const { map, providers, checking } = useAvailability(unseenKeys, unseenKeys.length > 0)
  // Films' details (saved copies), for "stay for the credits" on each row.
  const filmKeys = [...new Set(progress.released.filter((r) => r.type === 'movie').map((r) => r.key))]
  const { map: films } = useDetailsMany(filmKeys, filmKeys.length > 0)

  if (!view) {
    return (
      <Sheet>
        <div className="sheet-head">
          <h1>{saved?.name ?? 'List'}</h1>
        </div>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading{source?.kind === 'guide' ? ' the watch order (the first time takes a few seconds)' : ''}…</p>}
      </Sheet>
    )
  }

  const rows = progress.released.filter((i) => (show === 'all' || !isItemSeen(library, i)) && (filter === 'any' || (!isItemSeen(library, i) && passesFilter(filter, map[i.key]))))
  const numberOf = new Map(items.map((i, n) => [itemKey(i), n + 1]))
  const label = (r: TitleRef): string => (r.season ? `${r.name}, season ${r.season}` : r.name)
  const follow = async (): Promise<void> => {
    if (!source || own) return
    setLibrary(saved ? await window.api.removeList(id) : await window.api.followList({ name: view.name, source, imagePath: view.imagePath }))
  }

  const where = (r: TitleRef): React.JSX.Element | null => {
    if (isItemSeen(library, r)) return null
    const p = providers[r.key]
    if (!p) return null
    const yours = onMyServices(p, services)
    if (yours.length) return <span className="where-chip yours">On {yours[0].name}</span>
    if (p.stream.length || p.free.length) return <span className="where-chip">On {(p.stream[0] ?? p.free[0]).name}</span>
    if (p.rent.length || p.buy.length) return <span className="where-chip">Rent or buy</span>
    return <span className="where-chip none">Not streaming</span>
  }

  const row = (r: TitleRef, index: number): React.JSX.Element => {
    const entry = library.entries[r.key]
    const seen = isItemSeen(library, r)
    const next = !!progress.next && itemKey(progress.next) === itemKey(r)
    const pos = own ? items.findIndex((i) => itemKey(i) === itemKey(r)) : -1
    const ticked = r.season && !seen ? Object.keys(entry?.episodes ?? {}).filter((k) => parseEpisodeKey(k)?.season === r.season).length : 0
    const canDrag = own && show === 'all' && filter === 'any'
    return (
      <li
        key={itemKey(r)}
        className={`list-row ${seen ? 'seen' : ''} ${next ? 'next' : ''} ${dragFrom === pos && canDrag ? 'dragging' : ''}`}
        draggable={canDrag}
        onDragStart={() => setDragFrom(pos)}
        onDragOver={(e) => canDrag && e.preventDefault()}
        onDrop={async () => {
          if (dragFrom !== null && dragFrom !== pos) setLibrary(await window.api.moveInList(id, dragFrom, pos))
          setDragFrom(null)
        }}
        onDragEnd={() => setDragFrom(null)}
      >
        {canDrag && <GripVertical className="list-grip" size={16} aria-hidden />}
        <span className="list-num">{numberOf.get(itemKey(r)) ?? index + 1}</span>
        <button className="list-open" onClick={() => go({ name: 'title', type: r.type, id: r.id })}>
          <span className="list-poster">
            <Poster path={r.posterPath} type={r.type} name={r.name} size="w92" />
          </span>
          <span className="list-text">
            <span className="list-name">{r.name}</span>
            <span className="list-meta">
              {r.season ? `Season ${r.season}` : r.type === 'movie' ? 'Film' : 'Show'}
              {r.year ? ` · ${r.year}` : ''}
              {r.season ? (ticked ? ` · ${ticked} of ${r.episodes ?? '?'} episodes` : '') : entry && !seen ? ` · ${STATUS_LABELS[entry.status]}` : ''}
              {next ? ' · Up next' : ''}
              {r.type === 'movie' && stingerShort(films[r.key]?.stingers) && <span className="stinger-chip">{stingerShort(films[r.key]?.stingers)}</span>}
            </span>
          </span>
        </button>
        <span className="list-end">
          {where(r)}
          {seen &&
            (isRowSeenUndated(library, r) ? (
              <button className="list-seen undo" title="Seen before, no date. Click to take the tick off." onClick={async () => setLibrary(await window.api.markRowSeen(r, false))}>
                <Check size={15} strokeWidth={3} /> Seen
              </button>
            ) : (
              <span className="list-seen">
                <Check size={15} strokeWidth={3} /> Seen
              </span>
            ))}
          {!seen && (!r.season || !!r.episodes) && (
            <button
              className="list-tick"
              aria-label={`Seen ${r.season ? `${r.name} season ${r.season}` : r.name}`}
              title={r.season ? `Seen season ${r.season} (no date)` : 'Seen it (no date)'}
              onClick={async () => setLibrary(await window.api.markRowSeen(r, true))}
            >
              <Check size={15} strokeWidth={3} />
            </button>
          )}
          {own && (
            <span className="list-tools">
              <button aria-label="Move up" disabled={pos <= 0} onClick={async () => setLibrary(await window.api.moveInList(id, pos, pos - 1))}>
                <ArrowUp size={14} />
              </button>
              <button aria-label="Move down" disabled={pos >= items.length - 1} onClick={async () => setLibrary(await window.api.moveInList(id, pos, pos + 1))}>
                <ArrowDown size={14} />
              </button>
              <button aria-label="Take off this list" onClick={async () => setLibrary(await window.api.setInList(id, r, false))}>
                <X size={14} />
              </button>
            </span>
          )}
        </span>
      </li>
    )
  }

  const image = imageUrl(view.imagePath, 'w185')
  return (
    <Sheet>
      <div className="list-head">
        {image && <img className={`list-image ${source?.kind === 'person' ? 'round' : ''}`} src={image} alt="" draggable={false} />}
        <div className="list-head-text">
          <div className="list-kind">{kindLabel(id)}</div>
          {renaming !== null ? (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault()
                setLibrary(await window.api.renameList(id, renaming))
                setRenaming(null)
              }}
            >
              <input className="text-input big" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
              <button className="btn primary">Save</button>
            </form>
          ) : (
            <h1>{view.name}</h1>
          )}
          {view.description && <p className="muted list-desc">{view.description}</p>}
          <div className="list-progress">
            <ProgressBar seen={progress.seen} total={progress.total} big />
            <div className="list-progress-text">
              {progress.total ? progressSentence(id, section ? `${view.name}: ${section}` : view.name, progress.seen, progress.total) : 'Nothing out yet.'}
              {progress.total > 0 && progress.seen === progress.total ? ' All done.' : ''}
            </div>
          </div>
          <div className="row list-actions">
            {!own && source?.kind !== 'guide' && (
              <button className={`btn ${saved ? 'glass' : 'primary'}`} onClick={follow}>
                {saved ? <Check size={15} /> : <Plus size={15} />} {saved ? 'In your lists' : 'Add to your lists'}
              </button>
            )}
            {progress.next && (
              <button className="btn glass" onClick={() => go({ name: 'title', type: progress.next!.type, id: progress.next!.id })}>
                Next: {label(progress.next)}
              </button>
            )}
            {own && renaming === null && (
              <button className="btn glass" onClick={() => setRenaming(view.name)}>
                <Pencil size={15} /> Rename
              </button>
            )}
            {own &&
              (confirmDelete ? (
                <>
                  <button
                    className="btn glass danger"
                    onClick={async () => {
                      setLibrary(await window.api.removeList(id))
                      go({ name: 'lists' })
                    }}
                  >
                    Yes, delete “{view.name}”
                  </button>
                  <button className="btn glass" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button className="btn glass danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={15} /> Delete list
                </button>
              ))}
            {source?.kind === 'guide' && (
              <button
                className="btn glass"
                title="Make a copy you can reorder, add to and take things off"
                onClick={async () => {
                  const made = await window.api.createList(view.name, items)
                  setLibrary(made.library)
                  go({ name: 'list', id: made.id })
                }}
              >
                <Copy size={15} /> Copy to your lists
              </button>
            )}
            {!own && (
              <button className="btn glass" onClick={() => reload(true)} title="Get the latest from TMDB">
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="library-controls list-controls">
        <div className="row">
          {view.releaseItems && (
            <div className="segmented" role="radiogroup" aria-label="Order">
              {(['story', 'release'] as const).map((o) => (
                <button key={o} role="radio" aria-checked={order === o} className={order === o ? 'on' : ''} onClick={() => setOrder(o)}>
                  {o === 'story' ? 'Story order' : 'Release order'}
                </button>
              ))}
            </div>
          )}
          <div className="segmented" role="radiogroup" aria-label="Show">
            {(['all', 'left'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={show === s} className={show === s ? 'on' : ''} onClick={() => setShow(s)}>
                {s === 'all' ? 'Everything' : 'What’s left'}
              </button>
            ))}
          </div>
        </div>
        {view.sections && view.sections.length > 0 && (
          <div className="row section-chips" role="radiogroup" aria-label="Part of the order">
            {[null, ...view.sections].map((s) => (
              <button key={s ?? 'all'} role="radio" aria-checked={section === s} className={`chip ${section === s ? 'on' : ''}`} onClick={() => setSection(s)}>
                {s ?? 'Whole order'}
              </button>
            ))}
          </div>
        )}
        <AvailabilityFilter value={filter} onChange={setFilter} checking={checking && filter !== 'any'} />
      </div>

      {own && !items.length && <p className="muted">Nothing on this list yet. Open any film or show and add it from “Your lists” on its page.</p>}
      {rows.length === 0 && items.length > 0 && (
        <p className="muted">{show === 'left' && filter === 'any' ? 'You’ve seen everything that’s out.' : `Nothing left that’s ${FILTER_LABELS[filter].toLowerCase()}.`}</p>
      )}
      <ol className="list-rows">{rows.map(row)}</ol>

      {progress.upcoming.length > 0 && (
        <>
          <h2 className="list-sub">Coming up</h2>
          <ol className="list-rows">
            {progress.upcoming.map((r) => (
              <li key={itemKey(r)} className="list-row upcoming">
                <span className="list-num">{numberOf.get(itemKey(r))}</span>
                <button className="list-open" onClick={() => go({ name: 'title', type: r.type, id: r.id })}>
                  <span className="list-poster">
                    <Poster path={r.posterPath} type={r.type} name={r.name} size="w92" />
                  </span>
                  <span className="list-text">
                    <span className="list-name">{r.name}</span>
                    <span className="list-meta">
                      {r.season ? `Season ${r.season} · ` : ''}Out {formatShortDay(r.date)} {r.date?.slice(0, 4)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
      <Credits justWatch />
    </Sheet>
  )
}
