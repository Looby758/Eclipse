import { useEffect, useMemo, useRef, useState } from 'react'
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
export default function PosterWall({ rows = false, alive = false }: { rows?: boolean; alive?: boolean }): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement>(null)
  usePointerLift(rowsRef, rows && alive)
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
      <img key={t.key} className="wall-tile" src={t.url} alt="" draggable={false} />
    ) : (
      <div key={t.key} className="wall-tile" style={{ background: `linear-gradient(165deg, hsl(${t.hue} 85% 62%), hsl(272 65% 28%) 70%, hsl(250 50% 10%))` }} />
    )

  if (rows) {
    return (
      <div className="wall rows" ref={rowsRef} aria-hidden>
        <div className="wall-rows">
          {lines.map((row, r) => (
            <div key={r} className={`wall-row ${r % 2 ? 'right' : 'left'}`} style={{ animationDuration: `calc(var(--row-speed) + ${r * 9}s)` }}>
              {row.map(tile)}
            </div>
          ))}
        </div>
        <div className="wall-torch" />
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

/**
 * Spotlight Home only: a soft light follows the mouse over the drifting rows, and the poster under
 * it lifts and brightens. The wall can't be clicked (it sits behind the page), so this watches the
 * pointer on the window and finds the poster under it. It also checks a few times a second while the
 * mouse is still, because the rows keep drifting underneath. Off over the dial, buttons and panels,
 * with "Keep the poster wall still", and with the computer's reduce-animations setting.
 */
function usePointerLift(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean): void {
  useEffect(() => {
    const wall = ref.current
    if (!enabled || !wall) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let x = 0
    let y = 0
    let inside = false
    let frame = 0
    let lifted: Element | null = null

    const lift = (el: Element | null): void => {
      if (el === lifted) return
      lifted?.classList.remove('lifted')
      el?.classList.add('lifted')
      lifted = el
    }
    const update = (): void => {
      frame = 0
      if (!inside || reduce.matches || document.documentElement.hasAttribute('data-still')) {
        wall.classList.remove('lit')
        lift(null)
        return
      }
      const box = wall.getBoundingClientRect()
      wall.style.setProperty('--px', `${x - box.left}px`)
      wall.style.setProperty('--py', `${y - box.top}px`)
      wall.classList.add('lit')
      let hit: Element | null = null
      for (const tile of wall.querySelectorAll('.wall-tile')) {
        const r = tile.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          hit = tile
          break
        }
      }
      lift(hit)
    }
    const queue = (): void => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onMove = (e: PointerEvent): void => {
      x = e.clientX
      y = e.clientY
      // Over the dial, buttons, pills or a panel the wall stays as it is.
      const over = e.target instanceof Element ? e.target.closest('.spot-center, .spot-pills, .spot-panel, .spot-foryou, button, a, input, select') : null
      inside = !over
      queue()
    }
    const onLeave = (): void => {
      inside = false
      queue()
    }
    const tick = window.setInterval(() => inside && queue(), 150)
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.clearInterval(tick)
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      wall.classList.remove('lit')
      lift(null)
    }
  }, [enabled])
}
