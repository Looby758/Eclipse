import { Clapperboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { guideForQuery } from '@core/guides'
import { matchesPhrase, normalizeName } from '@core/franchise'
import type { FranchiseMatch } from '@shared/api'
import type { SearchResult } from '@core/types'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import TitleCard from './TitleCard'
import Credits from './Credits'
import AvailabilityFilter from './AvailabilityFilter'
import { useAvailability } from '../lib/availability'
import { FILTER_LABELS, passesFilter, type AvailabilityFilter as Filter } from '@core/providers'

export default function SearchSheet(): React.JSX.Element {
  const query = useApp((s) => s.query)
  const library = useApp((s) => s.library)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [filter, setFilter] = useState<Filter>('any')
  const { map, checking } = useAvailability(results.map((r) => r.key), filter !== 'any')
  const shown = results.filter((r) => passesFilter(filter, map[r.key]))
  const go = useApp((s) => s.go)
  const [order, setOrder] = useState<FranchiseMatch | null>(null)

  // A watch order for what you searched: a curated one, or worked out when two or more results share the name.
  useEffect(() => {
    setOrder(null)
    const q = query.trim()
    const phrase = normalizeName(q)
    if (!guideForQuery(q) && results.filter((r) => matchesPhrase(r.name, phrase)).length < 2) return
    let cancelled = false
    window.api.franchiseForQuery(q).then((r) => !cancelled && r.ok && setOrder(r.value))
    return () => {
      cancelled = true
    }
  }, [results])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    // Wait until typing pauses, so TMDB isn't asked on every key.
    const timer = setTimeout(async () => {
      const r = await window.api.search(q)
      if (cancelled) return
      setLoading(false)
      if (r.ok) {
        setResults(r.value.data)
        setStale(r.value.stale)
        setError('')
      } else {
        setError(r.error)
        setResults([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <Sheet>
      <div className="sheet-head">
        <h1>{query.trim() ? `“${query.trim()}”` : 'Search'}</h1>
        {loading && <span className="muted">Searching…</span>}
      </div>
      {stale && <p className="notice">Offline: showing results saved earlier.</p>}
      {error && <p className="error">{error}</p>}
      {!query.trim() && <p className="muted">Type a film or show in the search box below.</p>}
      {order && (
        <button className="order-card" onClick={() => go({ name: 'list', id: order.id })}>
          <Clapperboard size={22} />
          <span className="order-card-text">
            <span className="order-card-name">{order.name} watch order</span>
            <span className="muted small">
              {order.count} titles{order.curated ? ', in release or story order' : ' in release order'}
            </span>
          </span>
        </button>
      )}
      {results.length > 0 && <AvailabilityFilter value={filter} onChange={setFilter} checking={checking} />}
      {query.trim() && !loading && !error && results.length === 0 && <p className="muted">No films or shows found.</p>}
      {results.length > 0 && shown.length === 0 && !checking && <p className="muted">None of these are {FILTER_LABELS[filter].toLowerCase()}.</p>}
      <div className="grid">
        {shown.map((r) => (
          <TitleCard key={r.key} type={r.type} id={r.id} name={r.name} year={r.year} posterPath={r.posterPath} status={library.entries[r.key]?.status} />
        ))}
      </div>
      <Credits justWatch={filter !== 'any'} />
    </Sheet>
  )
}
