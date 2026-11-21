import { Film, Tv } from 'lucide-react'
import { useState } from 'react'
import { imageUrl, type PosterSize } from '@core/tmdb'
import type { MediaType } from '@core/types'
import { useApp } from '../store/app'
import { usePosterInfo, usePosterLook } from '../lib/posterLook'

/**
 * A poster, or a plain placeholder when there isn't one (or it can't load offline). Given the
 * title's id, it shows the poster you chose for it (phase 55) instead of TMDB's default, or else
 * the poster of the season you're on (phase 66). A show you're part-way through is in colour only
 * as far as you've got, with the rest in grey (phase 63, unless that's switched off).
 */
export default function Poster({ path, type, id, name, size = 'w342' }: { path: string | null; type: MediaType; id?: number; name: string; size?: PosterSize }): React.JSX.Element {
  const key = id === undefined ? undefined : `${type}:${id}`
  const chosen = useApp((s) => (key === undefined ? undefined : s.library.posters?.[key]))
  const info = usePosterInfo(key)
  const fillOn = usePosterLook((s) => s.fill)
  const [failed, setFailed] = useState<string | null>(null)
  const shown = chosen ?? info?.season ?? path
  // If the season's poster won't load, fall back to the title's own.
  const url = failed === imageUrl(shown, size) && shown !== path ? imageUrl(chosen ?? path, size) : imageUrl(shown, size)
  if (!url || failed === url) {
    const Icon = type === 'movie' ? Film : Tv
    return (
      <div className="poster poster-empty" aria-label={name}>
        <Icon size={28} />
        <span>{name}</span>
      </div>
    )
  }
  const fill = fillOn ? info?.fill : null
  if (fill != null) return <FilledPoster url={url} name={name} fill={fill} className="poster" onError={() => setFailed(url)} />
  return <img className="poster" src={url} alt={name} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} />
}

/** Phase 63: a poster in colour from the bottom up to `fill` (0 to 1), and grey above. */
export function FilledPoster({ url, name, fill, className, onError, ...rest }: { url: string; name: string; fill: number; className: string; onError?: () => void } & React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  const pct = `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%`
  return (
    <span className={`${className} poster-fill`} role="img" aria-label={name ? `${name}, ${Math.round(fill * 100)}% watched` : undefined} style={{ '--fill': pct } as React.CSSProperties} {...rest}>
      <img src={url} alt="" decoding="async" draggable={false} onError={onError} />
      <img className="poster-fill-grey" src={url} alt="" decoding="async" draggable={false} aria-hidden />
      <i className="poster-fill-line" aria-hidden />
    </span>
  )
}
