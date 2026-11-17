import { Check, Flame } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildHeatmap, heatColour, MIN_VOTES, type HeatCell } from '@core/heatmap'
import { localDate } from '@core/library'
import type { SeasonDetails, TitleDetails } from '@core/types'
import { hsl } from '../lib/posterColour'
import { useApp } from '../store/app'

const label = (c: HeatCell): string => `S${c.season} E${c.episode}`

function describe(c: HeatCell): string {
  const parts = [label(c)]
  if (!c.spoiler && c.title) parts.push(`“${c.title}”`)
  if (!c.aired) parts.push('not out yet')
  else if (c.rating === null) parts.push('no rating yet')
  else parts.push(`★ ${c.rating.toFixed(1)} from ${c.votes} vote${c.votes === 1 ? '' : 's'}${c.trusted ? '' : ' (too few to trust)'}`)
  if (c.watched) parts.push('watched')
  if (c.next) parts.push('up next')
  return parts.join(' · ')
}

/** "Does it get good?": every episode as a square, coloured by its TMDB rating. */
export default function Heatmap({ details, onPick }: { details: TitleDetails; onPick: (season: number, episode: number) => void }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[details.key])
  const [seasons, setSeasons] = useState<SeasonDetails[] | null>(null)
  const [failed, setFailed] = useState(false)
  const numbers = details.seasons.filter((s) => s.number > 0).map((s) => s.number)

  useEffect(() => {
    let cancelled = false
    setSeasons(null)
    setFailed(false)
    Promise.all(numbers.map((n) => window.api.season(details.id, n))).then((results) => {
      if (cancelled) return
      const ok = results.flatMap((r) => (r.ok ? [r.value.data] : []))
      if (ok.length) setSeasons(ok)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [details.id, numbers.join(',')])

  if (!numbers.length) return null
  if (!seasons) {
    return (
      <section className="heatmap">
        <div className="heatmap-head">
          <Flame size={17} />
          <h2>Does it get good?</h2>
        </div>
        <p className="muted">{failed ? 'Couldn’t load the episode ratings.' : 'Loading episode ratings…'}</p>
      </section>
    )
  }

  const map = buildHeatmap(seasons, entry, localDate(new Date()))
  const longest = Math.max(...map.rows.map((r) => r.cells.length))
  const verdict =
    map.best && map.worst && map.best !== map.worst
      ? `Peaks at ${label(map.best)} (★ ${map.best.rating!.toFixed(1)}). Lowest is ${label(map.worst)} (★ ${map.worst.rating!.toFixed(1)}).`
      : map.best
        ? `Best so far: ${label(map.best)} (★ ${map.best.rating!.toFixed(1)}).`
        : 'Not enough ratings yet.'

  return (
    <section className="heatmap">
      <div className="heatmap-head">
        <Flame size={17} />
        <h2>Does it get good?</h2>
        <span className="muted small">{verdict}</span>
      </div>
      <div className="heatmap-scroll">
        <table className="heatmap-grid" style={{ ['--cols' as string]: longest }}>
          <thead>
            <tr>
              <th />
              {Array.from({ length: longest }, (_, i) => (
                <th key={i} scope="col">
                  {i + 1}
                </th>
              ))}
              <th className="heat-avg-head">Avg</th>
            </tr>
          </thead>
          <tbody>
            {map.rows.map((row) => (
              <tr key={row.season}>
                <th scope="row">S{row.season}</th>
                {Array.from({ length: longest }, (_, i) => {
                  const c = row.cells[i]
                  if (!c) return <td key={i} />
                  const colour = c.trusted ? heatColour(c.rating!, map.low, map.high) : null
                  const cls = ['heat-cell', colour ? 'rated' : c.rating !== null ? 'few' : 'none', c.watched ? 'seen' : '', c.next ? 'next' : ''].filter(Boolean).join(' ')
                  return (
                    <td key={i}>
                      <button className={cls} style={colour ? { background: hsl(colour) } : undefined} title={describe(c)} aria-label={describe(c)} onClick={() => onPick(c.season, c.episode)}>
                        {c.rating !== null ? c.rating.toFixed(1) : '–'}
                        {c.watched && <Check className="heat-seen" size={10} strokeWidth={3.5} aria-hidden />}
                      </button>
                    </td>
                  )
                })}
                <td className="heat-avg">{row.average !== null ? row.average.toFixed(1) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heat-legend">
        <span className="heat-scale" aria-hidden style={{ background: `linear-gradient(90deg, ${hsl(heatColour(map.low, map.low, map.high))}, ${hsl(heatColour((map.low + map.high) / 2, map.low, map.high))}, ${hsl(heatColour(map.high, map.low, map.high))})` }} />
        <span>
          ★ {map.low.toFixed(1)} to {map.high.toFixed(1)}
        </span>
        <span className="heat-key few">Grey: under {MIN_VOTES} votes</span>
        <span className="heat-key">
          <Check size={11} strokeWidth={3.5} /> watched
        </span>
        {entry && <span className="heat-key next-key">Glowing: up next</span>}
        <span className="muted">Click a square to open that episode.{entry ? ' Titles past where you are stay hidden.' : ''}</span>
      </div>
    </section>
  )
}
