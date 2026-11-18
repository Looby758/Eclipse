import { useEffect, useState } from 'react'
import type { KnownFrom } from '@core/knownfrom'
import { listIdFor } from '@core/lists'
import { imageUrl } from '@core/tmdb'
import type { UniverseItem } from '@core/universe'
import type { Credits, TitleDetails } from '@core/types'
import { useApp } from '../store/app'

/** "The Walking Dead: Daryl Dixon" → "Daryl Dixon" on a Walking Dead page (the universe's name is already said). */
export function shortName(name: string, universe: string): string {
  const i = name.indexOf(':')
  return i > 0 && name.slice(0, i).trim().toLowerCase() === universe.toLowerCase() ? name.slice(i + 1).trim() : name
}

/**
 * The Spotlight title page's cast: the first seven, each opening their films and shows. People you
 * know from things you've watched (or are part-way through) are ringed, with "Also in …"; nothing
 * you haven't started is ever named, so it can't give a spin-off away.
 */
export function CastStrip({ details: d, universe, onMore }: { details: TitleDetails; universe: string; onMore: () => void }): React.JSX.Element | null {
  const [credits, setCredits] = useState<Credits | null>(null)
  const [known, setKnown] = useState<KnownFrom[]>([])
  const go = useApp((s) => s.go)

  useEffect(() => {
    let cancelled = false
    setCredits(null)
    setKnown([])
    window.api.credits(d.type, d.id).then((r) => !cancelled && r.ok && setCredits(r.value.data))
    window.api.knownFrom(d.type, d.id).then((r) => !cancelled && r.ok && setKnown(r.value))
    return () => {
      cancelled = true
    }
  }, [d.key])

  const cast = credits?.cast.slice(0, 7) ?? []
  if (!cast.length) return null
  const alsoIn = new Map(known.map((k) => [k.person.id, k.titles[0]?.name ?? '']))

  return (
    <section className="st-cast">
      <div className="st-k">
        <span>Cast</span>
        <span className="st-k-note">
          {cast.some((p) => alsoIn.get(p.id)) && <b>Ringed: people you know from your other shows · </b>}
          <button className="st-link" onClick={onMore}>
            Full cast and crew
          </button>
        </span>
      </div>
      <div className="st-cast-row">
        {cast.map((p) => {
          const face = imageUrl(p.profilePath, 'w185')
          const also = alsoIn.get(p.id)
          return (
            <button key={p.id} className={`st-person ${also ? 'kn' : ''}`} onClick={() => go({ name: 'list', id: listIdFor({ kind: 'person', personId: p.id, role: 'actor' }) })} title={`See ${p.name}’s films and shows`}>
              {face ? <img src={face} alt="" draggable={false} /> : <span className="st-initial">{p.name.slice(0, 1)}</span>}
              <span className="st-person-text">
                <b>{p.name}</b>
                {also ? <span className="kn">Also in {shortName(also, universe)}</span> : <span>{p.role}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The same universe, from your library only: a card for each show or film (this one outlined), in
 * the order they came out, with how far through you are. Hidden when nothing else in your library
 * belongs with it.
 */
export function UniverseStrip({ name, items }: { name: string; items: UniverseItem[] }): React.JSX.Element | null {
  const go = useApp((s) => s.go)
  if (items.length < 2) return null
  return (
    <section className="st-world">
      <div className="st-k">
        <span>{name} universe · in your library</span>
        <span className="st-k-note">In the order they came out</span>
      </div>
      <div className="st-cards">
        {items.map((u) => {
          const art = imageUrl(u.backdropPath ?? u.posterPath, 'w780')
          return (
            <button
              key={u.key}
              className={`st-card ${u.current ? 'on' : ''}`}
              style={art ? { backgroundImage: `url("${art}")` } : undefined}
              onClick={() => !u.current && go({ name: 'title', type: u.type, id: u.id })}
              aria-current={u.current || undefined}
            >
              {u.year && <em>{u.year}</em>}
              <div>
                <b>{shortName(u.name, name)}</b>
                {u.line && <span>{u.line}</span>}
                <span className="st-pb">
                  <i style={{ width: `${u.total ? Math.round((u.seen / u.total) * 100) : 0}%` }} />
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
