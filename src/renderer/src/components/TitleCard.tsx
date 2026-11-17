import type { MediaType, WatchStatus } from '@core/types'
import { STATUS_LABELS } from '@core/types'
import { useApp } from '../store/app'
import Poster from './Poster'

/** A poster with its name and year underneath; opens the title's page. */
export default function TitleCard({ type, id, name, year, posterPath, status }: { type: MediaType; id: number; name: string; year: number | null; posterPath: string | null; status?: WatchStatus }): React.JSX.Element {
  const go = useApp((s) => s.go)
  return (
    <button className="title-card" onClick={() => go({ name: 'title', type, id })} title={name}>
      <div className="title-card-poster">
        <Poster path={posterPath} type={type} name={name} />
        {status && <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>}
      </div>
      <div className="title-card-name">{name}</div>
      <div className="title-card-meta">
        {type === 'movie' ? 'Film' : 'Show'}
        {year ? ` · ${year}` : ''}
      </div>
    </button>
  )
}
