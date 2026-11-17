import { Search } from 'lucide-react'
import { useState } from 'react'
import { entriesWith } from '@core/library'
import type { LibraryEntry } from '@core/types'
import { useApp } from '../store/app'
import Poster from './Poster'
import { focusSearch } from './Dock'
import NextUp from './NextUp'

function greeting(now: Date): string {
  const h = now.getHours()
  return h < 5 ? 'Up late.' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'
}

/** What to suggest: things you're watching first (latest first), then your watchlist. */
function candidates(entries: LibraryEntry[]): LibraryEntry[] {
  const watching = entries.filter((e) => e.status === 'watching')
  const want = entries.filter((e) => e.status === 'want')
  return [...watching, ...want]
}

/** The home screen: one suggestion, big, over the moving poster wall. */
export default function HomeHero(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const [skip, setSkip] = useState(0)
  const all = entriesWith(library)
  const picks = candidates(all)
  const pick = picks.length ? picks[skip % picks.length] : null
  const others = picks.filter((e) => e !== pick).slice(0, 3)
  const watchingCount = all.filter((e) => e.status === 'watching').length

  if (!pick) {
    return (
      <div className="hero">
        <div className="hero-kicker">{greeting(new Date())}</div>
        <h1 className="hero-title">
          Find something <span className="glow-text">to watch</span>.
        </h1>
        <p className="hero-line">{all.length ? 'Nothing on your watchlist or in progress right now.' : 'Your library is empty. Search for a film or show, open it, and give it a status. It’ll show up here and on the wall behind.'}</p>
        <div className="hero-actions">
          <button className="btn primary big" onClick={focusSearch}>
            <Search size={17} /> Search
          </button>
          {all.length > 0 && (
            <button className="btn glass big" onClick={() => go({ name: 'library' })}>
              Your library
            </button>
          )}
        </div>
      </div>
    )
  }

  const verb = pick.status === 'watching' ? 'Pick up' : 'Start'
  const what = pick.type === 'movie' ? 'film' : 'show'
  return (
    <div className="hero">
      <div className="hero-kicker">{greeting(new Date())}</div>
      <h1 className="hero-title">
        {verb} <span className="glow-text">{pick.title.name}</span>?
      </h1>
      <p className="hero-line">
        {pick.status === 'watching'
          ? `You’re part-way through this ${what}${watchingCount > 1 ? `, one of ${watchingCount} you’re watching` : ''}.`
          : `It’s on your watchlist${pick.title.year ? ` (${pick.title.year})` : ''}.`}
      </p>
      <NextUp entry={pick} />
      <div className="hero-actions">
        <button className="btn primary big" onClick={() => go({ name: 'title', type: pick.type, id: pick.id })}>
          Open {pick.title.name}
        </button>
        {picks.length > 1 && (
          <button className="btn glass big" onClick={() => setSkip((n) => n + 1)}>
            Something else
          </button>
        )}
      </div>

      {others.length > 0 && (
        <>
          <div className="hero-sub">{others[0].status === 'watching' ? 'Also in progress' : 'Also on your list'}</div>
          <div className="mini-row">
            {others.map((e) => (
              <button key={e.key} className="mini-card" onClick={() => go({ name: 'title', type: e.type, id: e.id })}>
                <span className="mini-poster">
                  <Poster path={e.title.posterPath} type={e.type} name={e.title.name} size="w92" />
                </span>
                <span className="mini-text">
                  <span className="mini-name">{e.title.name}</span>
                  <span className="mini-sub">
                    {e.type === 'movie' ? 'Film' : 'Show'}
                    {e.title.year ? ` · ${e.title.year}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
