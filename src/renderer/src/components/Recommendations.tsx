import { RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Recommendation } from '@core/recommend'
import { FILTER_LABELS, passesFilter, type AvailabilityFilter as Filter } from '@core/providers'
import { useApp } from '../store/app'
import { useAvailability } from '../lib/availability'
import TitleCard from './TitleCard'
import AvailabilityFilter from './AvailabilityFilter'

type Kind = 'all' | 'movie' | 'tv'

/** Search with nothing typed: films and shows picked from what you've watched and are watching. */
export default function Recommendations(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [filter, setFilter] = useState<Filter>('any')
  const [round, setRound] = useState(0)
  const seeds = Object.values(library.entries).filter((e) => e.status === 'watched' || e.status === 'watching').length

  useEffect(() => {
    let live = true
    window.api.recommendations().then((r) => {
      if (!live) return
      if (r.ok) {
        setRecs(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      live = false
    }
    // Worked out again when something is watched or added, not on every library change.
  }, [seeds, round])

  const inLibrary = (key: string): boolean => !!library.entries[key] || (library.recsHidden ?? []).includes(key)
  const list = (recs ?? []).filter((r) => !inLibrary(r.key) && (kind === 'all' || r.type === kind))
  const { map, checking } = useAvailability(
    list.map((r) => r.key),
    filter !== 'any'
  )
  const shown = list.filter((r) => passesFilter(filter, map[r.key])).slice(0, 30)

  return (
    <section className="recs">
      <div className="recs-head">
        <h2>Recommended for you</h2>
        <div className="segmented" role="radiogroup" aria-label="Films or shows">
          {(
            [
              ['all', 'Both'],
              ['movie', 'Films'],
              ['tv', 'Shows']
            ] as [Kind, string][]
          ).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>
        <button className="link-btn inline" onClick={() => setRound((n) => n + 1)} aria-label="Refresh recommendations">
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="muted small">From what you’ve watched and are watching, with the ones you rated highly and watched lately counting most. Anything already in your library is left out.</p>
      {error && <p className="error">{error}</p>}
      {!seeds && <p className="muted">Mark a few films or shows as watched (or start one) and recommendations show up here.</p>}
      {seeds > 0 && recs === null && !error && <p className="muted">Finding things you’ll like…</p>}
      {recs && recs.length > 0 && <AvailabilityFilter value={filter} onChange={setFilter} checking={checking} />}
      {recs && list.length > 0 && shown.length === 0 && !checking && <p className="muted">None of these are {FILTER_LABELS[filter].toLowerCase()}.</p>}
      <div className="grid">
        {shown.map((r) => (
          <div key={r.key} className="rec-card">
            <TitleCard type={r.type} id={r.id} name={r.name} year={r.year} posterPath={r.posterPath} extra={r.year ? String(r.year) : undefined} />
            <div className="rec-why muted small" title={`Because you watched ${r.because.join(', ')}`}>
              Because you watched {r.because.slice(0, 2).join(' and ')}
              {r.because.length > 2 ? ` +${r.because.length - 2}` : ''}
            </div>
            <button
              className="rec-hide"
              aria-label={`Not for me: ${r.name}`}
              title="Not for me"
              onClick={async () => setLibrary(await window.api.hideRecommendation(r.key))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
