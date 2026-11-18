import { Check, ChevronDown, ChevronUp, Clapperboard, ListPlus, Lightbulb, Plus, Search, Users } from 'lucide-react'
import type { KnownFrom } from '@core/knownfrom'
import { useEffect, useState } from 'react'
import { guidesWith } from '@core/guides'
import { customListsWith, listIdFor, listsOf } from '@core/lists'
import { imageUrl } from '@core/tmdb'
import type { Credits, TitleDetails, TitleRef } from '@core/types'
import { useApp } from '../store/app'
import Poster from './Poster'
import PartEpisodes from './PartEpisodes'

/**
 * On a title page: who made it and who's in it (each opens their filmography), the film series
 * and watch orders it's part of, and your own lists (tick to add or take off).
 */
export default function TitleLinks({ details: d }: { details: TitleDetails }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const [credits, setCredits] = useState<Credits | null>(null)
  const [newList, setNewList] = useState<string | null>(null)
  const [known, setKnown] = useState<KnownFrom[]>([])
  const [fullCast, setFullCast] = useState(false)
  const [castQuery, setCastQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setCredits(null)
    window.api.credits(d.type, d.id).then((r) => !cancelled && r.ok && setCredits(r.value.data))
    setKnown([])
    setFullCast(false)
    setCastQuery('')
    window.api.knownFrom(d.type, d.id).then((r) => !cancelled && r.ok && setKnown(r.value))
    return () => {
      cancelled = true
    }
  }, [d.key])

  const ref: TitleRef = { key: d.key, type: d.type, id: d.id, name: d.name, year: d.year, posterPath: d.posterPath, date: d.date }
  const own = listsOf(library).filter((l) => l.source.kind === 'custom')
  const onIt = new Set(customListsWith(library, d.key).map((l) => l.id))
  const guides = guidesWith(d.key)

  const openPerson = (id: number, role: 'director' | 'actor'): void => go({ name: 'list', id: listIdFor({ kind: 'person', personId: id, role }) })
  const shownCast = credits?.cast.slice(0, 8) ?? []
  const everyone = credits?.fullCast ?? credits?.cast ?? []
  const q = castQuery.trim().toLowerCase()
  const castMatches = q ? everyone.filter((p) => p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) : everyone

  const person = (p: Credits['cast'][number], role: 'director' | 'actor'): React.JSX.Element => {
    const face = imageUrl(p.profilePath, 'w92')
    return (
      <button key={`${role}:${p.id}`} className="person-chip" onClick={() => openPerson(p.id, role)} title={`See ${p.name}’s ${role === 'director' ? 'films' : 'films and shows'}`}>
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
            {shownCast.map((p) => person(p, 'actor'))}
          </div>
          {everyone.length > shownCast.length && (
            <button className="link-btn full-cast-toggle" aria-expanded={fullCast} onClick={() => setFullCast(!fullCast)}>
              {fullCast ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {fullCast ? 'Hide full cast' : `Full cast (${everyone.length})`}
            </button>
          )}
          {fullCast && (
            <div className="full-cast">
              <label className="full-cast-search">
                <Search size={15} />
                <input className="text-input" autoFocus placeholder="Find someone by name or part" value={castQuery} onChange={(e) => setCastQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setCastQuery('')} />
              </label>
              {castMatches.length === 0 && <p className="muted">Nobody called “{castQuery.trim()}” in this.</p>}
              <ul className="full-cast-list">
                {castMatches.map((p) => {
                  const face = imageUrl(p.profilePath, 'w92')
                  return (
                    <li key={p.id}>
                      <button className="full-cast-row" onClick={() => openPerson(p.id, 'actor')} title={`See ${p.name}’s films and shows`}>
                        {face ? <img src={face} alt="" loading="lazy" draggable={false} /> : <span className="person-initial">{p.name.slice(0, 1)}</span>}
                        <span className="person-text">
                          <span className="person-name">{p.name}</span>
                          {p.role && <span className="person-role">{p.role}</span>}
                        </span>
                      </button>
                      {d.type === 'tv' && !!p.episodes && <PartEpisodes tvId={d.id} personId={p.id} creditIds={p.creditIds ?? []} count={p.episodes} />}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {known.length > 0 && (
        <div className="links-block">
          <h2>
            <Lightbulb size={17} /> Where you know them from
          </h2>
          <ul className="known">
            {known.map(({ person: p, titles }) => {
              const face = imageUrl(p.profilePath, 'w92')
              return (
                <li key={p.id}>
                  <button className="known-person" onClick={() => openPerson(p.id, 'actor')} title={`See ${p.name}’s films and shows`}>
                    {face ? <img src={face} alt="" draggable={false} /> : <span className="person-initial">{p.name.slice(0, 1)}</span>}
                    <span className="person-text">
                      <span className="person-name">{p.name}</span>
                      {p.role && <span className="person-role">Here: {p.role}</span>}
                    </span>
                  </button>
                  <div className="known-titles">
                    {titles.map((t) => (
                      <button key={t.key} className="known-title" onClick={() => go({ name: 'title', type: t.type, id: t.id })} title={`Open ${t.name}`}>
                        <span className="known-poster">
                          <Poster path={t.posterPath} type={t.type} name={t.name} size="w92" />
                        </span>
                        <span className="known-name">{t.name}</span>
                        {t.role && <span className="known-role">as {t.role}</span>}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(d.collection || guides.length > 0) && (
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
            {guides.map((g) => (
              <button key={g.id} className="chip" onClick={() => go({ name: 'list', id: listIdFor({ kind: 'guide', guideId: g.id }) })}>
                {g.name} watch order
              </button>
            ))}
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
