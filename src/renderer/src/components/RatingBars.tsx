import { useState } from 'react'
import { buildHeatmap, type HeatCell } from '@core/heatmap'
import { localDate } from '@core/library'
import { imageUrl } from '@core/tmdb'
import type { LibraryEntry, SeasonDetails } from '@core/types'

/**
 * The Spotlight title page's "Every episode, by rating": one bar per episode, as tall as its TMDB
 * rating, lit once you've watched it, with the season under each run and "You are here" over your
 * next one. Hovering shows the episode, but its picture only once you've seen it, and its name only
 * up to where you've got to.
 */
export default function RatingBars({ seasons, entry, onPick }: { seasons: SeasonDetails[]; entry: LibraryEntry | undefined; onPick: (season: number, episode: number) => void }): React.JSX.Element | null {
  const [hover, setHover] = useState<number | null>(null)
  const map = buildHeatmap(seasons, entry, localDate(new Date()))
  const cells = map.rows.flatMap((r) => r.cells)
  if (!cells.length) return null

  const stills = new Map(seasons.flatMap((s) => s.episodes.map((e) => [`${s.number}:${e.number}`, e.stillPath ?? null] as const)))
  const rated = cells.filter((c) => c.trusted).map((c) => c.rating!)
  // Stretched to this show's own range, so the ups and downs show even in a steady show.
  const lo = rated.length ? Math.min(...rated) - 0.4 : 0
  const hi = rated.length ? Math.max(...rated) + 0.05 : 10
  const height = (c: HeatCell): number => (c.rating === null ? 8 : Math.max(12, Math.min(100, 12 + (88 * (c.rating - lo)) / (hi - lo || 1))))
  const at = (i: number): string => `${((i + 0.5) / cells.length) * 100}%`

  let start = 0
  const labels = map.rows.map((r) => {
    const mid = start + r.cells.length / 2 - 0.5
    start += r.cells.length
    return { season: r.season, left: at(mid), first: start - r.cells.length }
  })
  const next = cells.findIndex((c) => c.next)
  const shown = hover !== null ? cells[hover] : null
  const still = shown?.watched ? imageUrl(stills.get(`${shown.season}:${shown.episode}`), 'w300') : null

  return (
    <section className="st-bars">
      <div className="st-head">
        <h3>Every episode, by rating</h3>
        <span>{entry ? 'Lit bars are watched · hover for the episode' : 'Hover for the episode'}</span>
      </div>
      <div className="st-bars-wrap" style={{ ['--n' as string]: cells.length }}>
        <div className="st-bars-row" onMouseLeave={() => setHover(null)}>
          {cells.map((c, i) => (
            <button
              key={`${c.season}:${c.episode}`}
              className={`st-bar ${c.watched ? 'w' : ''} ${c.next ? 'nx' : ''} ${!c.trusted ? 'dim' : ''} ${labels.some((l) => l.first === i && i > 0) ? 'gap' : ''}`}
              style={{ height: `${height(c)}%` }}
              aria-label={describe(c)}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onPick(c.season, c.episode)}
            />
          ))}
          {next >= 0 && hover === null && (
            <span className="st-here" style={{ left: at(next), bottom: `${height(cells[next])}%` }}>
              You are here
            </span>
          )}
          {shown && (
            <div className={`st-tip ${hover! > cells.length * 0.75 ? 'end' : hover! < cells.length * 0.25 ? 'start' : ''}`} style={{ left: at(hover!), bottom: `calc(${height(shown)}% + 10px)` }} role="tooltip">
              {still && <img src={still} alt="" draggable={false} />}
              <div>
                <b>
                  S{shown.season} E{shown.episode}
                  {!shown.spoiler && shown.title ? ` · ${shown.title}` : ''}
                </b>
                <span>
                  {!shown.aired ? 'Not out yet' : shown.rating === null ? 'No rating yet' : `★ ${shown.rating.toFixed(1)}${shown.trusted ? '' : ' (few votes)'}`}
                  {shown.watched ? ' · watched' : shown.next ? ' · up next' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="st-labels">
          {labels.map((l) => (
            <button key={l.season} style={{ left: l.left }} onClick={() => onPick(l.season, 1)}>
              S{l.season}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function describe(c: HeatCell): string {
  const parts = [`Season ${c.season} episode ${c.episode}`]
  if (!c.spoiler && c.title) parts.push(c.title)
  parts.push(!c.aired ? 'not out yet' : c.rating === null ? 'no rating yet' : `rated ${c.rating.toFixed(1)}`)
  if (c.watched) parts.push('watched')
  if (c.next) parts.push('up next')
  return parts.join(', ')
}
