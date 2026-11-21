import type { MediaType, WatchStatus } from '@core/types'
import { STATUS_LABELS } from '@core/types'
import { useApp } from '../store/app'
import Poster from './Poster'
import { flipPoster } from './PosterFlip'

/** A poster with its name and year underneath; opens the title's page. */
export default function TitleCard({ type, id, name, year, posterPath, status, extra, note }: { type: MediaType; id: number; name: string; year: number | null; posterPath: string | null; status?: WatchStatus; extra?: string; note?: { text: string; stalled?: boolean } }): React.JSX.Element {
  const go = useApp((s) => s.go)
  return (
    <button
      className="title-card"
      onClick={() => go({ name: 'title', type, id })}
      title={name}
      // Phase 65: right-click (or F) turns the poster over.
      onContextMenu={(e) => {
        e.preventDefault()
        flipPoster({ key: `${type}:${id}`, type, id, name, year, posterPath })
      }}
      onKeyDown={(e) => {
        if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          flipPoster({ key: `${type}:${id}`, type, id, name, year, posterPath })
        }
      }}
    >
      <div className="title-card-poster">
        <Poster path={posterPath} type={type} id={id} name={name} />
        {status && <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>}
      </div>
      <div className="title-card-name">{name}</div>
      <div className="title-card-meta">
        {type === 'movie' ? 'Film' : 'Show'}
        {extra ? ` · ${extra}` : year ? ` · ${year}` : ''}
      </div>
      {note && <div className={`title-card-note ${note.stalled ? 'stalled' : ''}`}>{note.text}</div>}
    </button>
  )
}
