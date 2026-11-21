import { CalendarClock, Minus, Pencil, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatDate, plural } from '@core/format'
import { localDate } from '@core/library'
import { posterFor } from '@core/posters'
import type { ComingSoon } from '@core/shelf'
import { dayNumber, packLanes, type Era, type Timeline, type TimelineDay, type TimelineSpan } from '@core/timeline'
import { imageUrl } from '@core/tmdb'
import { parseEpisodeKey } from '@core/types'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import { flipPoster } from './PosterFlip'

/**
 * Phase 64, "My timeline, with eras": every film and show you've watched, laid out along a line of
 * dates from your first Sequel entry to today, and on past today into what's coming. Scroll
 * sideways through it, zoom from years down to single weeks (Ctrl + scroll, or the buttons), and
 * the eras of your watching are named above it (click one to rename it). Zoomed right in, a show's
 * stretch shows each day you watched it and which episodes.
 */

/** Pixels per day at each zoom step, from whole years to single weeks. */
const ZOOMS = [0.3, 0.6, 1.2, 2.5, 5, 10, 20, 36, 56]
const DEFAULT_ZOOM = 3
/** Zoom steps the three quick buttons jump to. */
const PRESETS: [string, number][] = [
  ['Years', 1],
  ['Months', 4],
  ['Weeks', 7]
]
/** From this zoom on, stretches show their days and episodes. */
const DAYS_FROM = 6

const POSTER_W = 44
const LANE_H = 112
const AXIS_H = 40
const ERA_H = 40
const PAD_DAYS = 45

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10)

/** "S2 E4", "S2 E4–6", "S1 E10, S2 E1" for one day's episodes. */
export function episodesLabel(eps: string[]): string {
  const parsed = eps.map((k) => parseEpisodeKey(k)!).filter(Boolean)
  if (!parsed.length) return ''
  const bySeason = new Map<number, number[]>()
  for (const p of parsed) bySeason.set(p.season, [...(bySeason.get(p.season) ?? []), p.episode])
  return [...bySeason.entries()]
    .map(([s, list]) => {
      const sorted = [...list].sort((a, b) => a - b)
      const run = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
      return sorted.length === 1 ? `S${s} E${sorted[0]}` : run ? `S${s} E${sorted[0]}–${sorted[sorted.length - 1]}` : `S${s} E${sorted.join(', ')}`
    })
    .join(', ')
}

type Item = { kind: 'span'; span: TimelineSpan } | { kind: 'soon'; soon: ComingSoon & { date: string } }

export default function TimelineSheet({ focus }: { focus?: string }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const [data, setData] = useState<Timeline | null>(null)
  const [error, setError] = useState('')
  const [soon, setSoon] = useState<ComingSoon[]>([])
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [lit, setLit] = useState<string | null>(focus ?? null)
  const scroller = useRef<HTMLDivElement>(null)
  // Where to keep the view steady when zooming: a day, and where it sits in the window.
  const anchor = useRef<{ day: number; x: number } | null>(null)
  const placed = useRef(false)

  useEffect(() => {
    let live = true
    window.api.timeline().then((r) => {
      if (!live) return
      if (r.ok) {
        setData(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [library])
  useEffect(() => {
    window.api.comingSoon().then((r) => r.ok && setSoon(r.value))
  }, [])

  const today = localDate(new Date())
  const todayN = dayNumber(today)
  const ppd = ZOOMS[zoom]
  const future = useMemo(() => soon.filter((s): s is ComingSoon & { date: string } => !!s.date && s.date > today), [soon, today])

  const startN = (data?.first ? dayNumber(data.first) : todayN - 365) - PAD_DAYS
  const lastFuture = future.reduce((m, s) => Math.max(m, dayNumber(s.date)), todayN)
  const endN = Math.max(todayN + 30, lastFuture) + PAD_DAYS
  const width = (endN - startN) * ppd
  const x = (day: string | number): number => ((typeof day === 'number' ? day : dayNumber(day)) - startN) * ppd

  // Everything on the line, packed into lanes so nothing overlaps (worked out again for each zoom).
  const laid = useMemo(() => {
    const items: Item[] = [...(data?.spans ?? []).map((span) => ({ kind: 'span' as const, span })), ...future.map((s) => ({ kind: 'soon' as const, soon: s }))]
    items.sort((a, b) => (a.kind === 'span' ? a.span.from : a.soon.date).localeCompare(b.kind === 'span' ? b.span.from : b.soon.date))
    const boxes = items.map((it) => {
      const from = it.kind === 'span' ? it.span.from : it.soon.date
      const days = it.kind === 'span' ? dayNumber(it.span.to) - dayNumber(it.span.from) + 1 : 1
      return { start: x(from), width: Math.max(days * ppd, POSTER_W + 8) }
    })
    const lanes = packLanes(boxes, 6)
    return items.map((it, i) => ({ it, lane: lanes[i], left: boxes[i].start, barWidth: it.kind === 'span' ? Math.max(ppd, (dayNumber(it.span.to) - dayNumber(it.span.from) + 1) * ppd) : 0 }))
  }, [data, future, ppd, startN])
  const laneCount = Math.max(1, ...laid.map((l) => l.lane + 1))

  // First view: centred on what you asked to see, or ending at today.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !data || placed.current) return
    placed.current = true
    const target = focus ? data.spans.find((s) => s.key === focus) : undefined
    if (target) {
      const mid = (dayNumber(target.from) + dayNumber(target.to)) / 2
      el.scrollLeft = x(mid) - el.clientWidth / 2
      const lane = laid.find((l) => l.it.kind === 'span' && l.it.span.id === target.id)?.lane ?? 0
      el.scrollTop = Math.max(0, lane * LANE_H - el.clientHeight / 3)
    } else el.scrollLeft = x(todayN) - el.clientWidth * 0.75
  }, [data, laid])

  // Zooming keeps the same day under the mouse (or the middle of the window).
  useLayoutEffect(() => {
    const el = scroller.current
    const a = anchor.current
    if (!el || !a) return
    el.scrollLeft = (a.day - startN) * ppd - a.x
    anchor.current = null
  }, [ppd])

  const zoomTo = (next: number, atX?: number): void => {
    const el = scroller.current
    const z = Math.max(0, Math.min(ZOOMS.length - 1, next))
    if (!el || z === zoom) return
    const px = atX ?? el.clientWidth / 2
    anchor.current = { day: startN + (el.scrollLeft + px) / ppd, x: px }
    setZoom(z)
  }
  const zoomRef = useRef(zoomTo)
  zoomRef.current = zoomTo

  // Ctrl + scroll zooms; plain scrolling moves along the line (Shift + scroll goes up and down the lanes).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const box = el.getBoundingClientRect()
        zoomRef.current(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX - box.left)
      } else if (e.shiftKey) {
        e.preventDefault()
        el.scrollTop += e.deltaY || e.deltaX
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // The scroller only appears once the timeline has loaded.
  }, [zoom, !!data?.spans.length])

  // The date marks along the top: years, then months, then weeks as you zoom in.
  const marks = useMemo(() => {
    const out: { x: number; label: string; major: boolean }[] = []
    const a = new Date(startN * 86_400_000)
    const b = endN
    if (ppd < 1) {
      for (let y = a.getUTCFullYear(); ; y++) {
        const n = dayNumber(`${y}-01-01`)
        if (n > b) break
        if (n >= startN) out.push({ x: x(n), label: String(y), major: true })
      }
    } else if (ppd < ZOOMS[DAYS_FROM]) {
      for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); ; m++) {
        if (m === 12) {
          m = 0
          y++
        }
        const n = dayNumber(`${y}-${String(m + 1).padStart(2, '0')}-01`)
        if (n > b) break
        if (n >= startN) out.push({ x: x(n), label: m === 0 ? String(y) : ppd >= 2.5 ? MONTHS[m] : '', major: m === 0 })
      }
    } else {
      // Mondays, with the month named at the first one of each month.
      let n = startN + ((4 - (startN % 7) + 7) % 7) // 1970-01-05 (day 4) was a Monday
      for (; n <= b; n += 7) {
        const d = dayOf(n)
        const first = Number(d.slice(8, 10)) <= 7
        out.push({ x: x(n), label: `${Number(d.slice(8, 10))}${first || out.length === 0 ? ` ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : ''}`, major: first })
      }
    }
    return out
  }, [startN, endN, ppd])

  const open = (type: 'movie' | 'tv', id: number): void => go({ name: 'title', type, id })
  const poster = (key: string, path: string | null): string | null => imageUrl(posterFor(library, key, path), 'w92')

  return (
    <Sheet className="timeline-sheet">
      <div className="sheet-head">
        <h1>Your timeline</h1>
        <div className="tl-tools">
          <div className="segmented" role="radiogroup" aria-label="Zoom">
            {PRESETS.map(([label, z]) => (
              <button key={label} role="radio" aria-checked={zoom === z} className={zoom === z ? 'on' : ''} onClick={() => zoomTo(z)}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn glass icon-btn" aria-label="Zoom out" title="Zoom out (Ctrl + scroll)" onClick={() => zoomTo(zoom - 1)} disabled={zoom === 0}>
            <Minus size={16} />
          </button>
          <button className="btn glass icon-btn" aria-label="Zoom in" title="Zoom in (Ctrl + scroll)" onClick={() => zoomTo(zoom + 1)} disabled={zoom === ZOOMS.length - 1}>
            <Plus size={16} />
          </button>
          <button
            className="btn glass"
            onClick={() => {
              const el = scroller.current
              if (el) el.scrollTo({ left: x(todayN) - el.clientWidth * 0.75, behavior: 'smooth' })
            }}
          >
            <CalendarClock size={16} /> Today
          </button>
        </div>
      </div>
      {lit && data && (
        <p className="tl-lit">
          Lighting up <b>{library.entries[lit as keyof typeof library.entries]?.title.name ?? 'one title'}</b>
          <button className="link-btn" onClick={() => setLit(null)}>
            Show everything
          </button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Laying everything out…</p>}
      {data && !data.spans.length && <p>Nothing with a date yet. Tick an episode or mark a film as watched and it appears here on the day you watched it.</p>}
      {data && data.spans.length > 0 && (
        <p className="muted small tl-lede">
          Scroll to move along (Shift + scroll for up and down), Ctrl + scroll to zoom, and click a poster to open it (right-click turns it over).
          {data.undated > 0 ? ` ${plural(data.undated, 'watch')} from before Eclipse ${data.undated === 1 ? 'has' : 'have'} no date, so ${data.undated === 1 ? 'it isn’t' : 'they aren’t'} on here.` : ''}
        </p>
      )}
      {data && data.spans.length > 0 && (
        <div className="tl-scroll" ref={scroller} tabIndex={0} aria-label="Your timeline" onKeyDown={(e) => {
          const el = e.currentTarget
          if (e.key === 'ArrowRight') el.scrollLeft += 200
          else if (e.key === 'ArrowLeft') el.scrollLeft -= 200
          else if (e.key === '+' || e.key === '=') zoomTo(zoom + 1)
          else if (e.key === '-') zoomTo(zoom - 1)
          else return
          e.preventDefault()
          e.stopPropagation()
        }}>
          <div className="tl-canvas" style={{ width, height: AXIS_H + ERA_H + laneCount * LANE_H + 24 }}>
            <div className="tl-axis" style={{ width }}>
              {marks.map((m, i) => (
                <span key={i} className={`tl-mark ${m.major ? 'major' : ''}`} style={{ left: m.x }}>
                  {m.label && <b>{m.label}</b>}
                </span>
              ))}
            </div>
            {marks.map((m, i) => (
              <i key={i} className={`tl-grid ${m.major ? 'major' : ''}`} style={{ left: m.x }} aria-hidden />
            ))}
            <div className="tl-eras" style={{ top: AXIS_H }}>
              {data.eras.map((era, i) => {
                const next = data.eras[i + 1]
                return (
                  <EraBand
                    key={era.id}
                    era={era}
                    left={x(`${era.from}-01`)}
                    right={x(endOfMonth(era.to)) + ppd}
                    // A name can run past its months, but stops short of the next era's.
                    room={next ? x(`${next.from}-01`) - x(`${era.from}-01`) - 6 : undefined}
                    onLight={() => setLit(lit === era.key ? null : era.key)}
                  />
                )
              })}
            </div>
            <div className="tl-today" style={{ left: x(todayN) + ppd / 2 }}>
              <span>Today</span>
            </div>
            <div className="tl-lanes" style={{ top: AXIS_H + ERA_H }}>
              {laid.map(({ it, lane, left, barWidth }) => {
                const top = lane * LANE_H
                if (it.kind === 'soon') {
                  const s = it.soon
                  const url = poster(s.key, s.posterPath)
                  return (
                    <button key={`soon-${s.key}-${s.season ?? ''}`} className="tl-item soon" style={{ left, top }} onClick={() => open(s.type, s.id)} title={`${s.name} · ${s.label} · ${formatDate(s.date)}`}>
                      {url ? <img src={url} alt="" draggable={false} loading="lazy" /> : <span className="tl-noposter">{s.name}</span>}
                      <span className="tl-when">{shortDate(s.date)}</span>
                    </button>
                  )
                }
                const s = it.span
                const url = poster(s.key, s.posterPath)
                const span = s.from === s.to ? formatDate(s.from) : `${formatDate(s.from)} to ${formatDate(s.to)}`
                const what = s.type === 'tv' ? ` · ${plural(s.episodes, 'episode')}` : ''
                return (
                  <div key={s.id} className={`tl-item ${s.going ? 'going' : ''} ${lit === s.key ? 'lit' : ''} ${lit && lit !== s.key ? 'dim' : ''}`} style={{ left, top }}>
                    <button
                      className="tl-poster"
                      onClick={() => open(s.type, s.tmdbId)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        flipPoster({ key: s.key, type: s.type, id: s.tmdbId, name: s.name, year: library.entries[s.key]?.title.year ?? null, posterPath: s.posterPath })
                      }}
                      title={`${s.name}${s.label !== 'First time' ? ` · ${s.label}` : ''}\n${span}${what}${s.going ? ' · still going' : ''}`}
                    >
                      {url ? <img src={url} alt={s.name} draggable={false} loading="lazy" /> : <span className="tl-noposter">{s.name}</span>}
                    </button>
                    <div className="tl-bar" style={{ width: barWidth }} />
                    {ppd >= ZOOMS[DAYS_FROM] && s.days.length > 0 && <Days span={s} days={s.days} x={(d) => x(d) - left} ppd={ppd} />}
                    {ppd < ZOOMS[DAYS_FROM] && barWidth > 120 && <span className="tl-name" style={{ maxWidth: barWidth - POSTER_W - 8 }}>{s.name}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** "18 Dec 2026". */
const shortDate = (d: string): string => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

/** Zoomed in: a dot for every day you watched it, with the episodes that day. */
function Days({ span, days, x, ppd }: { span: TimelineSpan; days: TimelineDay[]; x: (d: string) => number; ppd: number }): React.JSX.Element {
  return (
    <div className="tl-days" style={{ '--day-w': `${Math.max(16, ppd - 4)}px` } as React.CSSProperties}>
      {days.map((d) => {
        const label = span.type === 'tv' ? episodesLabel(d.episodes) : 'Watched'
        return (
          <span key={d.day} className="tl-day" style={{ left: x(d.day) + ppd / 2 }} title={`${span.name}: ${label} · ${formatDate(d.day)}`}>
            <i />
            {ppd >= 20 && span.type === 'tv' && <em>{label.replace(/^S\d+ (?=E[^S]*$)/, '')}</em>}
          </span>
        )
      })}
    </div>
  )
}

/** One era above the timeline. Click its name to rename it (empty gives it back Eclipse's name). */
function EraBand({ era, left, right, room, onLight }: { era: Era; left: number; right: number; room?: number; onLight: () => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(era.name)
  const setLibrary = useApp((s) => s.setLibrary)
  useEffect(() => setName(era.name), [era.name])
  const save = async (): Promise<void> => {
    setEditing(false)
    const clean = name.trim()
    if (clean === era.name) return
    setLibrary(await window.api.setEraName(era.id, clean && clean !== era.auto ? clean : null))
  }
  return (
    <div className="tl-era" style={{ left, width: Math.max(8, right - left) }} title={`${era.name}\n${formatDate(`${era.from}-01`).replace(/^1 /, '')} to ${formatDate(endOfMonth(era.to)).replace(/^\d+ /, '')}`}>
      <span className="tl-era-range" aria-hidden />
      <span className="tl-era-label" style={editing ? undefined : { maxWidth: room !== undefined ? Math.max(28, room) : undefined }}>
      {editing ? (
        <input
          autoFocus
          value={name}
          aria-label="Name this era"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') {
              setName(era.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <>
          <button className="tl-era-name" onClick={onLight} title="Light up everything in this era’s show">
            {era.name}
          </button>
          <button className="tl-era-edit" aria-label={`Rename ${era.name}`} onClick={() => setEditing(true)}>
            <Pencil size={11} />
          </button>
        </>
      )}
      </span>
    </div>
  )
}
