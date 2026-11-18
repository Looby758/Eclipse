import { Film, Tv } from 'lucide-react'
import { useState } from 'react'
import { imageUrl, type PosterSize } from '@core/tmdb'
import type { MediaType } from '@core/types'
import { useApp } from '../store/app'

/**
 * A poster, or a plain placeholder when there isn't one (or it can't load offline). Given the
 * title's id, it shows the poster you chose for it (phase 55) instead of TMDB's default.
 */
export default function Poster({ path, type, id, name, size = 'w342' }: { path: string | null; type: MediaType; id?: number; name: string; size?: PosterSize }): React.JSX.Element {
  const chosen = useApp((s) => (id === undefined ? undefined : s.library.posters?.[`${type}:${id}`]))
  const [failed, setFailed] = useState<string | null>(null)
  const shown = chosen ?? path
  const url = imageUrl(shown, size)
  if (!url || failed === url) {
    const Icon = type === 'movie' ? Film : Tv
    return (
      <div className="poster poster-empty" aria-label={name}>
        <Icon size={28} />
        <span>{name}</span>
      </div>
    )
  }
  return <img className="poster" src={url} alt={name} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} />
}
