import { Clapperboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { guideForQuery, guideTitleCount } from '@core/guides'
import { parseTitleLink } from '@core/links'
import { listIdFor } from '@core/lists'
import { plural } from '@core/format'
import type { PersonResult, SearchResult } from '@core/types'
import { imageUrl } from '@core/tmdb'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import TitleCard from './TitleCard'
import Credits from './Credits'
import Recommendations from './Recommendations'
import AvailabilityFilter from './AvailabilityFilter'
import { useAvailability } from '../lib/availability'
import { FILTER_LABELS, passesFilter, type AvailabilityFilter as Filter } from '@core/providers'

export default function SearchSheet(): React.JSX.Element {
  const query = useApp((s) => s.query)
  const library = useApp((s) => s.library)
  const [results, setResults] = useState<SearchResult[]>([])
  const [people, setPeople] = useState<PersonResult[]>([])
  const [morePeople, setMorePeople] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [filter, setFilter] = useState<Filter>('any')
  const { map, checking } = useAvailability(results.map((r) => r.key), filter !== 'any')
  const shown = results.filter((r) => passesFilter(filter, map[r.key]))
  const go = useApp((s) => s.go)
  // A hand-made watch order for what you searched ("walking dead", "MCU").
  const order = guideForQuery(query)

  useEffect(() => {
    const q = query.trim()
    setMorePeople(false)
    if (!q) {
      setPeople([])
      setResults([])
      setError('')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    // A pasted TMDB or IMDb link goes straight to that title (the box is cleared, so Back doesn't jump again).
    const link = parseTitleLink(q)
    if (link) {
      setPeople([])
      setResults([])
      setError('')
      const open = (type: 'movie' | 'tv', id: number): void => {
        useApp.getState().setQuery('')
        useApp.getState().go({ name: 'title', type, id })
      }
      if (link.kind === 'tmdb') {
        open(link.type, link.id)
        return
      }
      window.api.findImdb(link.imdbId).then((r) => {
        if (cancelled) return
        setLoading(false)
        if (!r.ok) setError(r.error)
        else if (!r.value.data) setError('TMDB doesn’t know that IMDb link.')
        else open(r.value.data.type, r.value.data.id)
      })
      return () => {
        cancelled = true
      }
    }
    // Wait until typing pauses, so TMDB isn't asked on every key.
    const timer = setTimeout(async () => {
      const [r, p] = await Promise.all([window.api.search(q), window.api.searchPeople(q)])
      if (cancelled) return
      // People are a bonus: if that search fails, films and shows still show.
      setPeople(p.ok ? p.value.data : [])
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
      {!query.trim() && <p className="muted">Type a film, show or person in the search box below (or paste a TMDB or IMDb link), or pick from these.</p>}
      {!query.trim() && <Recommendations />}
      {order && (
        <button className="order-card" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'guide', guideId: order.id }) })}>
          <Clapperboard size={22} />
          <span className="order-card-text">
            <span className="order-card-name">{order.name} watch order</span>
            <span className="muted small">
              {plural(guideTitleCount(order), order.entries.every((e) => e.type === 'tv') ? 'show' : 'film and show', order.entries.every((e) => e.type === 'tv') ? 'shows' : 'films and shows')}, season by season
            </span>
          </span>
        </button>
      )}
      {people.length > 0 && (
        <>
          <h2 className="search-sub">People</h2>
          <div className="people-results">
            {people.slice(0, morePeople ? 20 : 4).map((p) => {
              const face = imageUrl(p.profilePath, 'w92')
              const role = p.knownFor === 'Directing' ? 'director' : 'actor'
              return (
                <button key={p.id} className="person-chip" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'person', personId: p.id, role }) })} title={`See ${p.name}’s ${role === 'director' ? 'films' : 'films and shows'}`}>
                  {face ? <img src={face} alt="" draggable={false} /> : <span className="person-initial">{p.name.slice(0, 1)}</span>}
                  <span className="person-text">
                    <span className="person-name">{p.name}</span>
                    <span className="person-role">{p.knownTitles.length ? p.knownTitles.join(', ') : p.knownFor}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {people.length > 4 && !morePeople && (
            <button className="link-btn" onClick={() => setMorePeople(true)}>
              More people
            </button>
          )}
          {results.length > 0 && <h2 className="search-sub">Films and shows</h2>}
        </>
      )}
      {results.length > 0 && <AvailabilityFilter value={filter} onChange={setFilter} checking={checking} />}
      {query.trim() && !loading && !error && results.length === 0 && people.length === 0 && <p className="muted">Nothing found.</p>}
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
