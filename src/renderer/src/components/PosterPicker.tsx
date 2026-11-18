import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PosterOption } from '@core/posters'
import { imageUrl } from '@core/tmdb'
import type { TitleDetails } from '@core/types'
import { useApp } from '../store/app'

/** How many posters show before "Show more". */
const FIRST = 24

/**
 * Phase 55, "Change poster": every poster TMDB has for the title in a grid. The one you pick is
 * used everywhere (the wall, the shelf, Home, lists) and saved in the library, so both computers
 * agree. Reset goes back to TMDB's default. Eclipse never asks about this on its own.
 */
export default function PosterPicker({ details: d }: { details: TitleDetails }): React.JSX.Element {
  const chosen = useApp((s) => s.library.posters?.[d.key])
  const setLibrary = useApp((s) => s.setLibrary)
  const [options, setOptions] = useState<PosterOption[] | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    window.api.posterOptions(d.type, d.id).then((r) => {
      if (!live) return
      if (r.ok) setOptions(r.value)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [d.type, d.id])

  const pick = async (path: string | null): Promise<void> => {
    setBusy(true)
    try {
      setLibrary(await window.api.setPoster(d.key, path))
    } finally {
      setBusy(false)
    }
  }

  const current = chosen ?? d.posterPath
  // The one in use always shows, even if TMDB has since dropped it.
  const list = options ? (chosen && !options.some((o) => o.path === chosen) ? [{ path: chosen, language: null, votes: 0, width: 0, height: 0 }, ...options] : options) : []
  const shown = all ? list : list.slice(0, FIRST)

  return (
    <div className="poster-picker">
      <p className="muted small">
        Pick the poster you like best. It’s used everywhere: the wall, the shelf, Home and your lists.
        {chosen ? ' ' : ' Eclipse uses TMDB’s usual one until you choose.'}
      </p>
      {chosen && (
        <button className="btn glass" onClick={() => pick(null)} disabled={busy}>
          <RotateCcw size={15} /> Reset to the usual poster
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {!options && !error && <p className="muted">Finding posters…</p>}
      {options && !list.length && <p className="muted">TMDB only has the one poster for this.</p>}
      <div className="poster-grid" role="radiogroup" aria-label="Posters">
        {shown.map((o) => {
          const on = o.path === current
          return (
            <button key={o.path} role="radio" aria-checked={on} className={`poster-option ${on ? 'on' : ''}`} disabled={busy} onClick={() => !on && pick(o.path === d.posterPath ? null : o.path)} title={o.path === d.posterPath ? 'The usual poster' : o.language ? `Poster (${o.language})` : 'Poster with no text'}>
              <img src={imageUrl(o.path, 'w185') ?? ''} alt="" loading="lazy" decoding="async" draggable={false} />
              {on && (
                <span className="poster-option-tick" aria-hidden>
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              {o.path === d.posterPath && <span className="poster-option-tag">Usual</span>}
            </button>
          )
        })}
      </div>
      {!all && list.length > FIRST && (
        <button className="link-btn" onClick={() => setAll(true)}>
          Show all {list.length}
        </button>
      )}
    </div>
  )
}
