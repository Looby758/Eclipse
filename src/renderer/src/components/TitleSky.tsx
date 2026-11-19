import { Check, Map as MapIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { guidesWith } from '@core/guides'
import { localDate } from '@core/library'
import { progressOf } from '@core/lists'
import { buildStarMap, focusOf, starMapFor } from '@core/starmaps'
import type { TitleDetails } from '@core/types'
import { useApp } from '../store/app'
import { useList } from '../lib/lists'
import StarMap from './StarMap'

/**
 * Phase 49, on a show's page: scroll past the cast and the picture blurs into a night sky, with
 * the whole watch order's star map below. The show's own constellation says "You're here", the
 * ones linked to it stay bright, and the show's name and Tick it stay pinned at the top.
 * (SpotlightTitle sets `--sky` from how far you've scrolled into it.)
 */
export default function TitleSky({ details, logo, canTick, busy, onTick }: { details: TitleDetails; logo: string | null; canTick: boolean; busy: boolean; onTick: () => void }): React.JSX.Element | null {
  const guides = useMemo(() => guidesWith(details.key).filter((g) => starMapFor(g.id)), [details.key])
  const [pick, setPick] = useState(0)
  const ref = useRef<HTMLElement>(null)
  // Only fetch the watch order once you're on your way down to it.
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near, guides.length])

  if (!guides.length) return null
  const guide = guides[Math.min(pick, guides.length - 1)]
  return (
    <section className="st-sky" ref={ref} aria-label={`${guide.name} star map`}>
      <div className="st-sky-head">
        {logo ? <img src={logo} alt={details.name} draggable={false} /> : <b>{details.name}</b>}
        {canTick && (
          <button className="st-pill pri" onClick={onTick} disabled={busy}>
            <Check size={17} /> Tick it
          </button>
        )}
      </div>
      {near ? (
        <Sky key={guide.id} guideId={guide.id} titleKey={details.key}>
          {guides.length > 1 && (
            <div className="st-sky-tabs" role="radiogroup" aria-label="Watch order">
              {guides.map((g, i) => (
                <button key={g.id} role="radio" aria-checked={g === guide} className={`st-chip ${g === guide ? 'on' : ''}`} onClick={() => setPick(i)}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </Sky>
      ) : (
        <div className="st-sky-loading" />
      )}
    </section>
  )
}

function Sky({ guideId, titleKey, children }: { guideId: string; titleKey: string; children?: React.ReactNode }): React.JSX.Element {
  const id = `guide:${guideId}`
  const { view, error } = useList(id)
  const library = useApp((s) => s.library)
  const today = localDate(new Date())
  const layout = starMapFor(guideId)!
  const map = useMemo(() => (view ? buildStarMap(layout, view.items, library, today, progressOf(view.items, library, today).next) : null), [layout, view, library, today])
  const focus = useMemo(() => (map ? focusOf(map, titleKey) : undefined), [map, titleKey])

  return (
    <>
      <div className="st-sky-title">
        <div>
          <h2>{view?.name ?? 'Watch order'}</h2>
          {map && (
            <p>
              {map.seen} lit, {map.partial} partway, {map.total - map.seen - map.partial} to go
              {map.next ? ` · Up next: ${map.next.name}` : ''}
            </p>
          )}
        </div>
        <div className="st-sky-tabs">
          {children}
          <button className="st-chip" onClick={() => useApp.getState().go({ name: 'list', id, map: true })}>
            <MapIcon size={13} /> Open the map
          </button>
        </div>
      </div>
      {map ? <StarMap map={map} focus={focus} onDark /> : <div className="st-sky-loading">{error || 'Loading the watch order…'}</div>}
      <div className="st-sky-cue">Scroll back up for the show</div>
    </>
  )
}
