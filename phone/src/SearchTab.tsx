import { useEffect, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { activeEntry } from '@core/library'
import { STATUS_LABELS, type SearchResult } from '@core/types'
import { usePhone } from './store'
import { Poster, itemOf, openTitle } from './ui'

/** Search TMDB for films and shows, and add them to Want to watch in one tap. */
export default function SearchTab(): React.JSX.Element {
  const tmdb = usePhone((s) => s.tmdb)
  const [query, setQuery] = useState(() => sessionStorage.getItem('eclipse.phone.search') ?? '')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    sessionStorage.setItem('eclipse.phone.search', query)
    const q = query.trim()
    if (!q || !tmdb) {
      setResults(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      tmdb.search(q).then(
        (r) => {
          if (!live) return
          setResults(r)
          setError(null)
        },
        (err) => live && setError(err instanceof Error ? err.message : String(err))
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, tmdb])

  return (
    <section className="tab">
      <input className="field search-field" type="search" placeholder="Search films and shows" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoCorrect="off" />
      {error && <p className="error">{error}</p>}
      {results && !results.length && <p className="empty">Nothing found on TMDB.</p>}
      {!query.trim() && <p className="empty">Type a name to search TMDB.</p>}
      <ul className="rows">
        {results?.map((r) => (
          <ResultRow key={r.key} r={r} />
        ))}
      </ul>
    </section>
  )
}

function ResultRow({ r }: { r: SearchResult }): React.JSX.Element {
  const raw = usePhone((s) => s.view.entries[r.key])
  const act = usePhone((s) => s.act)
  const entry = activeEntry(raw)
  return (
    <li className="row">
      <button className="row-main" onClick={() => openTitle(r.type, r.id)}>
        <Poster path={r.posterPath} name={r.name} size="w92" className="row-poster" />
        <span className="row-text">
          <b>{r.name}</b>
          <span className="sub">{[r.year, r.type === 'tv' ? 'Show' : 'Film'].filter(Boolean).join(' · ')}</span>
          {entry && <span className="sub accent">{STATUS_LABELS[entry.status]}</span>}
        </span>
      </button>
      {entry ? (
        <span className="added" aria-label="In your library">
          <Check size={18} />
        </span>
      ) : (
        <button className="add-btn" onClick={() => act({ kind: 'status', item: itemOf(r), status: 'want', was: null })} aria-label={`Add ${r.name} to Want to watch`}>
          <Plus size={20} />
        </button>
      )}
    </li>
  )
}
