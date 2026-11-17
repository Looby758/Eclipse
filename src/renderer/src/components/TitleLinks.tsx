import { Check, Clapperboard, ListPlus, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { guidesWith, guideRefs } from '@core/guides'
import { customListsWith, listIdFor, listsOf } from '@core/lists'
import { imageUrl } from '@core/tmdb'
import type { Credits, TitleDetails, TitleRef } from '@core/types'
import type { FranchiseMatch } from '@shared/api'
import { useApp } from '../store/app'

/**
 * On a title page: who made it and who's in it (each opens their filmography), the film series
 * and watch orders it's part of, and your own lists (tick to add or take off).
 */
export default function TitleLinks({ details: d }: { details: TitleDetails }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const [credits, setCredits] = useState<Credits | null>(null)
  const [newList, setNewList] = useState<string | null>(null)
  const [franchise, setFranchise] = useState<FranchiseMatch | null>(null)

  useEffect(() => {
    let cancelled = false
    setCredits(null)
    setFranchise(null)
    window.api.credits(d.type, d.id).then((r) => !cancelled && r.ok && setCredits(r.value.data))
    // Titles in a curated guide already have their watch order.
    if (!guidesWith(d.key).length) window.api.franchiseForTitle(d.type, d.id).then((r) => !cancelled && r.ok && setFranchise(r.value))
    return () => {
      cancelled = true
    }
  }, [d.key])

  const ref: TitleRef = { key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }
  const own = listsOf(library).filter((l) => l.source.kind === 'custom')
  const onIt = new Set(customListsWith(library, d.key).map((l) => l.id))
  const guides = guidesWith(d.key)

  const person = (p: Credits['cast'][number], role: 'director' | 'actor'): React.JSX.Element => {
    const face = imageUrl(p.profilePath, 'w92')
    return (
      <button key={`${role}:${p.id}`} className="person-chip" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'person', personId: p.id, role }) })} title={`See ${p.name}’s ${role === 'director' ? 'films' : 'films and shows'}`}>
        {face ? <img src={face} alt="" draggable={false} /> : <span className="person-initial">{p.name.slice(0, 1)}</span>}
        <span className="person-text">
          <span className="person-name">{p.name}</span>
          {p.role && <span className="person-role">{p.role}</span>}
        </span>
      </button>
    )
  }

  return (
    <section className="title-links">
      {credits && (credits.directors.length > 0 || credits.cast.length > 0) && (
        <div className="links-block">
          <h2>
            <Users size={17} /> People
          </h2>
          <div className="people-row">
            {credits.directors.slice(0, 3).map((p) => person(p, 'director'))}
            {credits.cast.slice(0, 8).map((p) => person(p, 'actor'))}
          </div>
        </div>
      )}

      {(d.collection || guides.length > 0 || franchise) && (
        <div className="links-block">
          <h2>
            <Clapperboard size={17} /> Watch orders
          </h2>
          <div className="row">
            {d.collection && (
              <button className="chip" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'collection', collectionId: d.collection!.id }) })}>
                {d.collection.name}
              </button>
            )}
            {franchise && (
              <button className="chip" onClick={() => go({ name: 'list', id: franchise.id })}>
                {franchise.name}
                {franchise.position ? ` · #${franchise.position} of ${franchise.count}` : ` · ${franchise.count}`}
              </button>
            )}
            {guides.map((g) => {
              const n = guideRefs(g).findIndex((r) => r.key === d.key) + 1
              return (
                <button key={g.id} className="chip" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'guide', guideId: g.id }) })}>
                  {g.name} · #{n} of {g.entries.length}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="links-block">
        <h2>
          <ListPlus size={17} /> Your lists
        </h2>
        <div className="row">
          {own.map((l) => {
            const on = onIt.has(l.id)
            return (
              <button key={l.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={async () => setLibrary(await window.api.setInList(l.id, ref, !on))}>
                {on && <Check size={14} strokeWidth={3} />} {l.name}
              </button>
            )
          })}
          {newList === null ? (
            <button className="chip" onClick={() => setNewList('')}>
              <Plus size={14} /> New list
            </button>
          ) : (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!newList.trim()) return
                setLibrary((await window.api.createList(newList, [ref])).library)
                setNewList(null)
              }}
            >
              <input className="text-input" autoFocus placeholder="List name" value={newList} onChange={(e) => setNewList(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewList(null)} />
              <button className="btn glass" disabled={!newList.trim()}>
                Make it
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
