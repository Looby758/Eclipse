import { ExternalLink, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TitleDetails } from '@core/types'

/**
 * On a title page: plays its trailer (the one TMDB lists on YouTube) over the page. Escape, the ✕ or
 * clicking outside closes it. Hidden when TMDB has no trailer.
 */
export default function TrailerButton({ details: d, className }: { details: TitleDetails; className: string }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!d.trailer) return null
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Play size={13} /> Trailer
      </button>
      {open && <TrailerOverlay name={d.name} youtubeKey={d.trailer} onClose={() => setOpen(false)} />}
    </>
  )
}

function TrailerOverlay({ name, youtubeKey, onClose }: { name: string; youtubeKey: string; onClose: () => void }): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    // Escape closes the trailer before it goes back a page.
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return createPortal(
    <div className="trailer-layer" role="dialog" aria-label={`${name} trailer`} onClick={onClose}>
      <div className="trailer-box" onClick={(e) => e.stopPropagation()}>
        <div className="trailer-head">
          <b>{name}</b>
          <button className="link-btn inline small" onClick={() => window.api.openExternal(`https://www.youtube.com/watch?v=${youtubeKey}`)}>
            <ExternalLink size={13} /> Open on YouTube
          </button>
          <button ref={closeRef} className="trailer-x" onClick={onClose} aria-label="Close the trailer">
            <X size={18} />
          </button>
        </div>
        <div className="clearout-trailer">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeKey}?rel=0&modestbranding=1&autoplay=1`}
            title={`${name} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
