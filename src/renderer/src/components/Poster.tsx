import { Film, Tv } from 'lucide-react'
import { useState } from 'react'
import { imageUrl, type PosterSize } from '@core/tmdb'
import type { MediaType } from '@core/types'

/** A poster, or a plain placeholder when there isn't one (or it can't load offline). */
export default function Poster({ path, type, name, size = 'w342' }: { path: string | null; type: MediaType; name: string; size?: PosterSize }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const url = imageUrl(path, size)
  if (!url || failed) {
    const Icon = type === 'movie' ? Film : Tv
    return (
      <div className="poster poster-empty" aria-label={name}>
        <Icon size={28} />
        <span>{name}</span>
      </div>
    )
  }
  return <img className="poster" src={url} alt={name} loading="lazy" draggable={false} onError={() => setFailed(true)} />
}
