import { memo, useEffect, useMemo, useState } from 'react'
import { imageUrl } from '@core/tmdb'
import { OWN_ENOUGH, WALL_COLUMNS, WALL_PER_COLUMN, wallPosters } from '../lib/wall'
import { useApp } from '../store/app'

const ROWS = 6
const PER_ROW = 14

// Cool stand-in colours, only used if there are no posters at all (offline on first launch).
const HUES = [330, 195, 265, 285, 240, 220, 210, 300, 200, 250, 180, 310]

interface Tile {
  key: string
  url: string | null
  hue: number
}

/**
 * The slowly moving, tilted wall of posters behind every screen: your library, topped up with
 * this week's trending titles while it's small. Each column drifts up or down and holds two copies
 * of its posters so it loops smoothly. Decoration only: it can't be clicked and screen readers skip it.
 */
function PosterWall({ rows = false }: { rows?: boolean }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const hasKey = useApp((s) => !!s.status?.hasKey)
  const [trending, setTrending] = useState<string[]>([])

  const own = useMemo(
    () =>
      Object.values(library.entries)
        .filter((e) => e.title.posterPath)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((e) => e.title.posterPath!),
    [library]
  )
  const needTrending = hasKey && new Set(own).size < OWN_ENOUGH

  useEffect(() => {
    if (!needTrending || trending.length) return
    window.api.trending().then((r) => {
      if (r.ok) setTrending(r.value.data.map((t) => t.posterPath!).filter(Boolean))
    })
  }, [needTrending])

  const columns = useMemo(() => {
    const posters = wallPosters(own, trending)
    const cols: Tile[][] = []
    for (let c = 0; c < WALL_COLUMNS; c++) {
      const col: Tile[] = []
      for (let k = 0; k < WALL_PER_COLUMN; k++) {
        const path = posters[c + k * WALL_COLUMNS]
        col.push({ key: `${c}-${k}`, url: path ? imageUrl(path, 'w185') : null, hue: HUES[(c * 5 + k) % HUES.length] })
      }
      cols.push([...col, ...col.map((t) => ({ ...t, key: `${t.key}b` }))])
    }
    return cols
  }, [own, trending])

  // Spotlight Home: flat rows drifting sideways, alternate rows the other way.
  const lines = useMemo(() => {
    const posters = wallPosters(own, trending, ROWS * PER_ROW)
    return Array.from({ length: ROWS }, (_, r) => {
      const row: Tile[] = Array.from({ length: PER_ROW }, (_, k) => {
        const path = posters[r + k * ROWS]
        return { key: `${r}-${k}`, url: path ? imageUrl(path, 'w185') : null, hue: HUES[(r * 5 + k) % HUES.length] }
      })
      return [...row, ...row.map((t) => ({ ...t, key: `${t.key}b` }))]
    })
  }, [own, trending])

  const tile = (t: Tile): React.JSX.Element =>
    t.url ? (
      <img key={t.key} className="wall-tile" src={t.url} alt="" decoding="async" draggable={false} />
    ) : (
      <div key={t.key} className="wall-tile" style={{ background: `linear-gradient(165deg, hsl(${t.hue} 85% 62%), hsl(272 65% 28%) 70%, hsl(250 50% 10%))` }} />
    )

  if (rows) {
    return (
      <div className="wall rows" aria-hidden>
        <div className="wall-rows">
          {lines.map((row, r) => (
            <div key={r} className={`wall-row ${r % 2 ? 'right' : 'left'}`} style={{ animationDuration: `calc(var(--row-speed) + ${r * 9}s)` }}>
              {row.map(tile)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="wall" aria-hidden>
      <div className="wall-tilt">
        {columns.map((col, c) => (
          <div key={c} className={`wall-col ${c % 2 ? 'down' : 'up'}`} style={{ animationDuration: `calc(var(--wall-speed) + ${c * 6}s)` }}>
            {col.map(tile)}
          </div>
        ))}
      </div>
    </div>
  )
}

// Only redraws when the posters change, not every time you open a page.
export default memo(PosterWall)
