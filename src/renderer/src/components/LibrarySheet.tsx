import { useState } from 'react'
import { countByStatus, entriesWith } from '@core/library'
import type { MediaType, WatchStatus } from '@core/types'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import TitleCard from './TitleCard'
import Credits from './Credits'
import { focusSearch } from './Dock'

export default function LibrarySheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const counts = countByStatus(library)
  // Open on the first status that has something in it.
  const [tab, setTab] = useState<WatchStatus>(() => WATCH_STATUSES.find((s) => counts[s] > 0) ?? 'want')
  const [type, setType] = useState<MediaType | undefined>()
  const entries = entriesWith(library, tab, type)
  const empty = Object.keys(library.entries).length === 0

  return (
    <Sheet>
      <div className="sheet-head">
        <h1>Your library</h1>
        <div className="segmented">
          {([undefined, 'movie', 'tv'] as const).map((t) => (
            <button key={t ?? 'all'} className={type === t ? 'on' : ''} onClick={() => setType(t)}>
              {t === 'movie' ? 'Films' : t === 'tv' ? 'Shows' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <nav className="tabs">
        {WATCH_STATUSES.map((s) => (
          <button key={s} className={tab === s ? 'on' : ''} onClick={() => setTab(s)}>
            {STATUS_LABELS[s]} <span className="count">{counts[s]}</span>
          </button>
        ))}
      </nav>
      {empty ? (
        <div className="empty">
          <p>Nothing here yet.</p>
          <button className="btn primary" onClick={focusSearch}>
            Search for something
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <p>
            Nothing marked “{STATUS_LABELS[tab]}”{type ? ` in ${type === 'movie' ? 'films' : 'shows'}` : ''}.
          </p>
        </div>
      ) : (
        <div className="grid">
          {entries.map((e) => (
            <TitleCard key={e.key} type={e.type} id={e.id} name={e.title.name} year={e.title.year} posterPath={e.title.posterPath} />
          ))}
        </div>
      )}
      <Credits />
    </Sheet>
  )
}
