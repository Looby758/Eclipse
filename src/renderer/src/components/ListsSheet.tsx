import { Plus } from 'lucide-react'
import { useState } from 'react'
import { GUIDES } from '@core/guides'
import { listIdFor, listsOf, progressOf, sourceOf } from '@core/lists'
import { localDate, recommenders } from '@core/library'
import { imageUrl } from '@core/tmdb'
import { useApp } from '../store/app'
import { kindLabel, useList } from '../lib/lists'
import Sheet from './Sheet'
import Poster from './Poster'
import ProgressBar from './ProgressBar'
import Credits from './Credits'

/** One list as a card: a few posters, its name and how far through you are. */
function ListCard({ id, name }: { id: string; name: string }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const { view, error } = useList(id)
  const progress = view ? progressOf(view.items, library, localDate(new Date())) : null
  const posters = (view?.items ?? []).filter((i, n, all) => i.posterPath && all.findIndex((o) => o.key === i.key) === n).slice(0, 4)
  const image = imageUrl(view?.imagePath, 'w185')
  return (
    <button className="list-card" onClick={() => go({ name: 'list', id })}>
      <span className="list-card-art">
        {sourceOf(id)?.kind === 'person' && image ? (
          <img className="list-card-face" src={image} alt="" draggable={false} />
        ) : posters.length ? (
          posters.map((p, i) => (
            <span key={p.key} className="list-card-poster" style={{ ['--i' as string]: i }}>
              <Poster path={p.posterPath} type={p.type} name={p.name} size="w185" />
            </span>
          ))
        ) : (
          <span className="list-card-empty" />
        )}
      </span>
      <span className="list-card-kind">{kindLabel(id)}</span>
      <span className="list-card-name">{view?.name ?? name}</span>
      {progress ? (
        <>
          <ProgressBar seen={progress.seen} total={progress.total} />
          <span className="list-card-count">
            {progress.total ? `${progress.seen} of ${progress.total} seen` : sourceOf(id)?.kind === 'custom' ? 'Empty' : 'Nothing out yet'}
          </span>
        </>
      ) : (
        <span className="list-card-count">{error ? 'Couldn’t load' : 'Loading…'}</span>
      )}
    </button>
  )
}

/** Turns "8", "https://www.themoviedb.org/list/8-best-picture" or "list/8" into 8. */
const listNumber = (text: string): number | null => {
  const m = /(?:list\/)?(\d+)/.exec(text.trim())
  return m ? Number(m[1]) : null
}

/** Lists: watch orders, the people and series you follow, your own lists and TMDB lists. */
export default function ListsSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { setLibrary, go } = useApp.getState()
  const [newName, setNewName] = useState('')
  const [tmdbText, setTmdbText] = useState('')
  const [tmdbError, setTmdbError] = useState('')
  const lists = listsOf(library)
  const orders = [
    ...GUIDES.map((g) => ({ id: listIdFor({ kind: 'guide', guideId: g.id }), name: g.name })),
    ...lists.filter((l) => l.source.kind === 'collection').map((l) => ({ id: l.id, name: l.name }))
  ]
  const people = lists.filter((l) => l.source.kind === 'person')
  const own = lists.filter((l) => l.source.kind === 'custom')
  const tmdb = lists.filter((l) => l.source.kind === 'tmdbList')
  const picks = recommenders(library)

  return (
    <Sheet>
      <div className="sheet-head">
        <h1>Lists</h1>
      </div>
      <p className="muted lists-lede">Watch orders, the directors and actors you follow, and your own lists, with how far through each you are.</p>

      <h2 className="list-sub">Watch orders</h2>
      <div className="list-cards">
        {orders.map((o) => (
          <ListCard key={o.id} id={o.id} name={o.name} />
        ))}
      </div>
      <p className="muted small">Film series appear here when you add them from a film’s page (“Part of …”). Want another watch order? Ask for it and it gets added by hand.</p>

      <h2 className="list-sub">People</h2>
      {people.length ? (
        <div className="list-cards">
          {people.map((l) => (
            <ListCard key={l.id} id={l.id} name={l.name} />
          ))}
        </div>
      ) : (
        <p className="muted">Open a film, click a director or actor, then “Add to your lists” to track how many of theirs you’ve seen.</p>
      )}

      <h2 className="list-sub">Recommended by</h2>
      {picks.length ? (
        <div className="list-cards">
          {picks.map((p) => (
            <ListCard key={p.name} id={listIdFor({ kind: 'from', name: p.name })} name={`${p.name}’s picks`} />
          ))}
        </div>
      ) : (
        <p className="muted">On a film or show’s page, fill in <strong>From</strong> (“Sam”, “a podcast”) and everything from the same person or place gathers here.</p>
      )}

      <h2 className="list-sub">Your lists</h2>
      <div className="list-cards">
        {own.map((l) => (
          <ListCard key={l.id} id={l.id} name={l.name} />
        ))}
        <form
          className="list-card new"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newName.trim()) return
            const made = await window.api.createList(newName)
            setLibrary(made.library)
            setNewName('')
            go({ name: 'list', id: made.id })
          }}
        >
          <Plus size={22} />
          <input className="text-input" placeholder="New list, e.g. Best Picture winners" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn glass" disabled={!newName.trim()}>
            Make list
          </button>
        </form>
      </div>

      <h2 className="list-sub">TMDB lists</h2>
      {tmdb.length > 0 && (
        <div className="list-cards">
          {tmdb.map((l) => (
            <ListCard key={l.id} id={l.id} name={l.name} />
          ))}
        </div>
      )}
      <form
        className="row tmdb-import"
        onSubmit={async (e) => {
          e.preventDefault()
          const n = listNumber(tmdbText)
          if (!n) return setTmdbError('Paste the list’s number or its link from themoviedb.org.')
          const r = await window.api.tmdbList(n)
          if (!r.ok) return setTmdbError(r.kind === 'notFound' ? 'TMDB has no public list with that number.' : r.error)
          setTmdbError('')
          setTmdbText('')
          setLibrary(await window.api.followList({ name: r.value.data.name, source: { kind: 'tmdbList', listId: n }, imagePath: r.value.data.posterPath }))
          go({ name: 'list', id: listIdFor({ kind: 'tmdbList', listId: n }) })
        }}
      >
        <input className="text-input" placeholder="A public TMDB list’s number or link" value={tmdbText} onChange={(e) => setTmdbText(e.target.value)} />
        <button className="btn glass" disabled={!tmdbText.trim()}>
          Add list
        </button>
      </form>
      {tmdbError && <p className="error">{tmdbError}</p>}
      <Credits />
    </Sheet>
  )
}
