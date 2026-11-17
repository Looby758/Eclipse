import { useEffect, useState } from 'react'
import type { SearchResult } from '@core/types'
import { useApp } from '../store/app'
import TitleCard from './TitleCard'
import Credits from './Credits'

export default function SearchView(): React.JSX.Element {
  const query = useApp((s) => s.query)
  const library = useApp((s) => s.library)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setError('')
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
    <div className="page">
      <div className="page-head">
        <h1>{query.trim() ? `Results for “${query.trim()}”` : 'Search'}</h1>
        {loading && <span className="muted">Searching…</span>}
      </div>
      {stale && <p className="notice">Offline: showing results saved earlier.</p>}
      {error && <p className="error">{error}</p>}
      {!query.trim() && <p className="muted">Type a film or show name in the box at the top.</p>}
      {query.trim() && !loading && !error && results.length === 0 && <p className="muted">No films or shows found.</p>}
      <div className="grid">
        {results.map((r) => (
          <TitleCard key={r.key} type={r.type} id={r.id} name={r.name} year={r.year} posterPath={r.posterPath} status={library.entries[r.key]?.status} />
        ))}
      </div>
      <Credits />
    </div>
  )
}
