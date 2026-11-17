import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { countByStatus, entriesWith, localDate, preferencesOf } from '@core/library'
import type { MediaType, WatchStatus } from '@core/types'
import { STATUS_LABELS, WATCH_STATUSES } from '@core/types'
import { FILTER_LABELS, passesFilter, type AvailabilityFilter as Filter } from '@core/providers'
import { timeLeft, watchlistHours, type TimeLeft } from '@core/time'
import { formatRuntime, plural } from '@core/format'
import { useApp } from '../store/app'
import { useAvailability, useDetailsMany } from '../lib/availability'
import Sheet from './Sheet'
import TitleCard from './TitleCard'
import Credits from './Credits'
import { RecentlyDropped } from './ClearOutSheet'
import { focusSearch } from './Dock'
import AvailabilityFilter from './AvailabilityFilter'
import WatchlistHours from './WatchlistHours'

type Sort = 'recent' | 'quickest'

/** "2h 46m" for a film, "9h left · 12 eps" for a show. */
function leftLabel(type: MediaType, left: TimeLeft | undefined, status: WatchStatus): string | undefined {
  if (!left || status === 'watched' || status === 'stopped') return undefined
  if (type === 'movie') return left.minutes ? formatRuntime(left.minutes) : undefined
  if (!left.episodes) return 'Up to date'
  return `${left.minutes < 60 ? `${left.minutes}m` : `${Math.round(left.minutes / 60)}h`} left · ${plural(left.episodes, 'ep')}`
}

export default function LibrarySheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const services = preferencesOf(library).services
  const counts = countByStatus(library)
  // Open on the first status that has something in it.
  const [tab, setTab] = useState<WatchStatus>(() => WATCH_STATUSES.find((s) => counts[s] > 0) ?? 'want')
  const [type, setType] = useState<MediaType | undefined>()
  const [filter, setFilter] = useState<Filter>('any')
  const [sort, setSort] = useState<Sort>('recent')
  const timed = tab === 'want' || tab === 'watching'
  const inTab = entriesWith(library, tab, type)
  const keys = inTab.map((e) => e.key)
  const { map, providers, checking } = useAvailability(keys, filter !== 'any' || timed)
  const { map: details, checking: loadingTimes } = useDetailsMany(keys, timed)
  const today = localDate(new Date())
  const left: Record<string, TimeLeft> = {}
  for (const e of inTab) if (details[e.key]) left[e.key] = timeLeft(details[e.key], e, today)

  let entries = inTab.filter((e) => passesFilter(filter, map[e.key]))
  if (timed && sort === 'quickest') {
    const mins = (k: string): number => (left[k] ? left[k].minutes || Infinity : Infinity)
    entries = [...entries].sort((a, b) => mins(a.key) - mins(b.key))
  }
  const hours = timed ? watchlistHours(entries.filter((e) => left[e.key]).map((e) => ({ key: e.key, left: left[e.key] })), providers, services) : null
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
      {tab === 'want' && counts.want > 0 && (
        <div className="row clearout-link">
          <button className="btn glass" onClick={() => useApp.getState().go({ name: 'clearout' })}>
            <Sparkles size={16} /> Clear out the watchlist
          </button>
        </div>
      )}
      {hours && entries.length > 0 && <WatchlistHours tab={tab} hours={hours} loading={loadingTimes} unknown={entries.length - entries.filter((e) => left[e.key]).length} />}
      {!empty && (
        <div className="library-controls">
          <AvailabilityFilter value={filter} onChange={setFilter} checking={checking && filter !== 'any'} />
          {timed && (
            <div className="segmented" role="radiogroup" aria-label="Sort">
              {(['recent', 'quickest'] as const).map((s) => (
                <button key={s} role="radio" aria-checked={sort === s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
                  {s === 'recent' ? 'Recent' : 'Quickest to finish'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
            {checking && filter !== 'any'
              ? 'Checking where to watch…'
              : `Nothing marked “${STATUS_LABELS[tab]}”${type ? ` in ${type === 'movie' ? 'films' : 'shows'}` : ''}${filter !== 'any' ? ` that’s ${FILTER_LABELS[filter].toLowerCase()}` : ''}.`}
          </p>
        </div>
      ) : (
        <div className="grid">
          {entries.map((e) => (
            <TitleCard key={e.key} type={e.type} id={e.id} name={e.title.name} year={e.title.year} posterPath={e.title.posterPath} extra={leftLabel(e.type, left[e.key], e.status)} />
          ))}
        </div>
      )}
      {tab === 'want' && <RecentlyDropped limit={5} />}
      <Credits justWatch={filter !== 'any' || timed} />
    </Sheet>
  )
}
