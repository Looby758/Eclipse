import { useMemo } from 'react'
import { imageUrl } from '@core/tmdb'
import { useApp } from '../store/app'

const COLUMNS = 7
const PER_COLUMN = 8
// Cool stand-in colours for empty spots on the wall, before your library fills it.
const HUES = [330, 195, 265, 285, 240, 220, 210, 300, 200, 250, 180, 310]

interface Tile {
  key: string
  url: string | null
  hue: number
}

/**
 * The slowly moving, tilted wall of posters behind every screen, made from your library. Each
 * column drifts up or down; the columns hold two copies of their posters so they loop smoothly.
 * Purely decoration: it can't be clicked, and screen readers skip it.
 */
export default function PosterWall(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const columns = useMemo(() => {
    const posters = Object.values(library.entries)
      .filter((e) => e.title.posterPath)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((e) => imageUrl(e.title.posterPath, 'w185'))
    const cols: Tile[][] = []
    for (let c = 0; c < COLUMNS; c++) {
      const col: Tile[] = []
      for (let k = 0; k < PER_COLUMN; k++) {
        const n = c * PER_COLUMN + k
        // Your posters, mixed with coloured stand-ins while the library is still small.
        const usePoster = posters.length > 0 && (posters.length >= 6 || n % 2 === 0)
        const url = usePoster ? posters[(n * 5 + c) % posters.length] : null
        col.push({ key: `${c}-${k}`, url, hue: HUES[(c * 5 + k) % HUES.length] })
      }
      cols.push([...col, ...col.map((t) => ({ ...t, key: `${t.key}b` }))])
    }
    return cols
  }, [library])

  return (
    <div className="wall" aria-hidden>
      <div className="wall-tilt">
        {columns.map((col, c) => (
          <div key={c} className={`wall-col ${c % 2 ? 'down' : 'up'}`} style={{ animationDuration: `calc(var(--wall-speed) + ${c * 6}s)` }}>
            {col.map((t) =>
              t.url ? (
                <img key={t.key} className="wall-tile" src={t.url} alt="" draggable={false} loading="lazy" />
              ) : (
                <div key={t.key} className="wall-tile" style={{ background: `linear-gradient(165deg, hsl(${t.hue} 85% 62%), hsl(272 65% 28%) 70%, hsl(250 50% 10%))` }} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
