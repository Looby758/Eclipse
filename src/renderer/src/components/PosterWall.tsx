import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { imageUrl } from '@core/tmdb'
import { OWN_ENOUGH, WALL_COLUMNS, WALL_PER_COLUMN, wallPosters } from '../lib/wall'
import type { MediaType, SearchResult } from '@core/types'
import { useApp } from '../store/app'
import { isTyping } from '../lib/keys'

const ROWS = 6
const PER_ROW = 14

// Cool stand-in colours, only used if there are no posters at all (offline on first launch).
const HUES = [330, 195, 265, 285, 240, 220, 210, 300, 200, 250, 180, 310]

interface Tile {
  key: string
  url: string | null
  path: string | null
  hue: number
}

type TitleRef = { type: MediaType; id: number }

/**
 * The slowly moving, tilted wall of posters behind every screen: your library with recommendations
 * for you mixed in, topped up with this week's trending titles while it's small. Each column drifts up or down and holds two copies
 * of its posters so it loops smoothly. Screen readers skip it; on Spotlight Home its posters can be clicked (see usePointerLift).
 */
function PosterWall({ rows = false, alive = false }: { rows?: boolean; alive?: boolean }): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement>(null)
  const library = useApp((s) => s.library)
  const hasKey = useApp((s) => !!s.status?.hasKey)
  const go = useApp((s) => s.go)
  const [trendingTitles, setTrendingTitles] = useState<SearchResult[]>([])
  const trending = useMemo(() => trendingTitles.map((t) => t.posterPath!).filter(Boolean), [trendingTitles])
  const [recTitles, setRecTitles] = useState<SearchResult[]>([])

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
      if (r.ok) setTrendingTitles(r.value.data.filter((t) => t.posterPath))
    })
  }, [needTrending])

  // Recommendations for you (the same ones Search shows), mixed in among your own posters. Worked
  // out again when something is watched or started, not on every library change.
  const seeds = Object.values(library.entries).filter((e) => e.status === 'watched' || e.status === 'watching').length
  useEffect(() => {
    if (!hasKey || !seeds) return
    let live = true
    window.api.recommendations().then((r) => {
      if (live && r.ok) setRecTitles(r.value.filter((t) => t.posterPath))
    })
    return () => {
      live = false
    }
  }, [hasKey, seeds])
  const recs = useMemo(() => {
    const hidden = new Set(library.recsHidden ?? [])
    return recTitles.filter((t) => !library.entries[t.key] && !hidden.has(t.key)).map((t) => t.posterPath!)
  }, [recTitles, library])

  // Which title each poster belongs to, so clicking a poster on Spotlight Home opens its page.
  const titles = useMemo(() => {
    const map = new Map<string, TitleRef>()
    for (const e of Object.values(library.entries)) if (e.title.posterPath && !map.has(e.title.posterPath)) map.set(e.title.posterPath, { type: e.type, id: e.id })
    for (const t of recTitles) if (t.posterPath && !map.has(t.posterPath)) map.set(t.posterPath, { type: t.type, id: t.id })
    for (const t of trendingTitles) if (t.posterPath && !map.has(t.posterPath)) map.set(t.posterPath, { type: t.type, id: t.id })
    return map
  }, [library, recTitles, trendingTitles])
  usePointerLift(rowsRef, rows && alive, (path) => {
    const ref = titles.get(path)
    if (ref) go({ name: 'title', type: ref.type, id: ref.id })
  })

  const columns = useMemo(() => {
    const posters = wallPosters(own, trending, undefined, recs)
    const cols: Tile[][] = []
    for (let c = 0; c < WALL_COLUMNS; c++) {
      const col: Tile[] = []
      for (let k = 0; k < WALL_PER_COLUMN; k++) {
        const path = posters[c + k * WALL_COLUMNS]
        col.push({ key: `${c}-${k}`, url: path ? imageUrl(path, 'w185') : null, path: path ?? null, hue: HUES[(c * 5 + k) % HUES.length] })
      }
      cols.push([...col, ...col.map((t) => ({ ...t, key: `${t.key}b` }))])
    }
    return cols
  }, [own, trending, recs])

  // Spotlight Home: flat rows drifting sideways, alternate rows the other way.
  const lines = useMemo(() => {
    const posters = wallPosters(own, trending, ROWS * PER_ROW, recs)
    return Array.from({ length: ROWS }, (_, r) => {
      const row: Tile[] = Array.from({ length: PER_ROW }, (_, k) => {
        const path = posters[r + k * ROWS]
        return { key: `${r}-${k}`, url: path ? imageUrl(path, 'w185') : null, path: path ?? null, hue: HUES[(r * 5 + k) % HUES.length] }
      })
      return [...row, ...row.map((t) => ({ ...t, key: `${t.key}b` }))]
    })
  }, [own, trending, recs])

  const tile = (t: Tile): React.JSX.Element =>
    t.url ? (
      <img key={t.key} className="wall-tile" src={t.url} alt="" decoding="async" draggable={false} data-path={t.path ?? undefined} />
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
 * it lifts and brightens. Clicking the lifted poster opens its page (onOpen gets its poster path). The wall can't be clicked (it sits behind the page), so this watches the
 * pointer on the window and finds the poster under it. It also checks a few times a second while the
 * mouse is still, because the rows keep drifting underneath. Off over the dial, buttons and panels,
 * with "Keep the poster wall still", and with the computer's reduce-animations setting.
 *
 * Holding Shift peeks at the wall: the dial, buttons, pills and panels fade away (the `wall-peek`
 * class on the page) and every poster can be lifted and clicked, even behind where the dial was and
 * with the wall kept still. Letting go of Shift, pressing another key, or leaving the window brings
 * everything back. Shift is left alone while you're typing in a field.
 */
function usePointerLift(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, onOpen: (path: string) => void): void {
  const open = useRef(onOpen)
  open.current = onOpen
  useEffect(() => {
    const wall = ref.current
    if (!enabled || !wall) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let x = 0
    let y = 0
    let inside = false
    let frame = 0
    let lifted: Element | null = null
    let peek = false
    let seen = false
    const root = document.documentElement

    const lift = (el: Element | null): void => {
      if (el === lifted) return
      lifted?.classList.remove('lifted')
      el?.classList.add('lifted')
      lifted = el
      // The page sits on top of the wall, so show the hand cursor on the whole page while a poster is lifted.
      root.classList.toggle('wall-pointing', !!el?.getAttribute('data-path'))
    }
    const update = (): void => {
      frame = 0
      if (!inside || (!peek && (reduce.matches || root.hasAttribute('data-still')))) {
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
    // Over the dial, buttons, pills or the Waiting for you column the wall stays as it is (while peeking they're faded
    // out and can't be pointed at, so everything counts as the wall).
    const OVER = '.spot-center, .spot-pills, .spot-waiting, button, a, input, select'
    const overUi = (t: EventTarget | null): boolean => !peek && t instanceof Element && !!t.closest(OVER)
    const onMove = (e: PointerEvent): void => {
      x = e.clientX
      y = e.clientY
      seen = true
      // Shift was let go somewhere we didn't hear about it.
      if (peek && !e.shiftKey) setPeek(false)
      inside = !overUi(e.target)
      queue()
    }
    const onLeave = (): void => {
      inside = false
      queue()
    }
    const setPeek = (on: boolean): void => {
      if (on === peek) return
      peek = on
      root.classList.toggle('wall-peek', on)
      // The mouse may not move: work out again what's under it now the page has faded in or out.
      if (seen) inside = !overUi(document.elementFromPoint(x, y))
      queue()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Shift' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) setPeek(true)
      // Shift as part of something else (Shift+Tab, a shortcut): not a peek.
      else if (e.key !== 'Shift') setPeek(false)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Shift') setPeek(false)
    }
    const onBlur = (): void => {
      setPeek(false)
      onLeave()
    }
    const onHidden = (): void => {
      if (document.hidden) setPeek(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (e.button !== 0 || !inside || !lifted || e.defaultPrevented || overUi(e.target)) return
      const path = lifted.getAttribute('data-path')
      if (path) open.current(path)
    }
    const tick = window.setInterval(() => inside && queue(), 150)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onHidden)
    root.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onBlur)
    return () => {
      window.clearInterval(tick)
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onHidden)
      root.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onBlur)
      root.classList.remove('wall-peek')
      wall.classList.remove('lit')
      lift(null)
    }
  }, [enabled])
}

// Only redraws when the posters change, not every time you open a page.
export default memo(PosterWall)
