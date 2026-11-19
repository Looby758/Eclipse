import { Check, Flame } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildHeatmap, compareMine, heatColour, MIN_VOTES, type HeatCell, type MineCell } from '@core/heatmap'
import { activeEntry, localDate } from '@core/library'
import { reactionsOf } from '@core/reactions'
import { episodeKey, REACTION_LIST, REACTIONS, type SeasonDetails, type TitleDetails } from '@core/types'
import { hsl } from '../lib/posterColour'
import { useHeatView } from '../lib/heatView'
import { useApp } from '../store/app'
import HeatToggle from './HeatToggle'

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

/** Phase 47: a square in the Mine view, said out loud. */
function describeMine(c: HeatCell, m: MineCell | undefined): string {
  const parts = [label(c)]
  if (!c.spoiler && c.title) parts.push(`“${c.title}”`)
  if (m) parts.push(`${REACTIONS[m.reaction].emoji} ${REACTIONS[m.reaction].label}`)
  else if (c.watched) parts.push('watched, no reaction yet (open it to add one)')
  else parts.push('not watched yet')
  if (c.rating !== null) parts.push(`★ ${c.rating.toFixed(1)} on TMDB`)
  if (m?.differs) parts.push(m.differs === 'dragged' ? 'everyone else loved it' : 'everyone else rated it lower')
  return parts.join(' · ')
}

/** "Does it get good?": every episode as a square, coloured by its TMDB rating (or, in Mine, by how it hit you). */
export default function Heatmap({ details, onPick }: { details: TitleDetails; onPick: (season: number, episode: number) => void }): React.JSX.Element | null {
  const raw = useApp((s) => s.library.entries[details.key])
  const entry = activeEntry(raw)
  const view = useHeatView((s) => s.view)
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
  const mine = compareMine(map, reactionsOf(raw))
  const showMine = view === 'mine' && !!raw
  const verdict = showMine
    ? mine.total === 0
      ? 'No reactions yet. Tick an episode and tap how it hit you.'
      : `You’ve reacted to ${mine.total} episode${mine.total === 1 ? '' : 's'}. ${mine.differ.length ? `You and TMDB disagree on ${mine.differ.length}.` : 'You and TMDB mostly agree.'}`
    : map.best && map.worst && map.best !== map.worst
      ? `Peaks at ${label(map.best)} (★ ${map.best.rating!.toFixed(1)}). Lowest is ${label(map.worst)} (★ ${map.worst.rating!.toFixed(1)}).`
      : map.best
        ? `Best so far: ${label(map.best)} (★ ${map.best.rating!.toFixed(1)}).`
        : 'Not enough ratings yet.'

  return (
    <section className="heatmap">
      <div className="heatmap-head">
        <Flame size={17} />
        <h2>Does it get good?</h2>
        {raw && <HeatToggle mine={mine.total} />}
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
                  if (showMine) {
                    const m = mine.cells[episodeKey(c.season, c.episode)]
                    const mcls = ['heat-cell', 'mine', m ? `r-${m.reaction}` : c.watched ? 'mine-seen' : 'none', m?.differs ? 'differs' : '', c.next ? 'next' : ''].filter(Boolean).join(' ')
                    return (
                      <td key={i}>
                        <button className={mcls} title={describeMine(c, m)} aria-label={describeMine(c, m)} onClick={() => onPick(c.season, c.episode)}>
                          {m ? <span aria-hidden>{REACTIONS[m.reaction].emoji}</span> : c.watched ? <Check size={12} strokeWidth={3} aria-hidden /> : ''}
                        </button>
                      </td>
                    )
                  }
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
                <td className="heat-avg">{showMine ? '' : row.average !== null ? row.average.toFixed(1) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showMine && mine.differ.length > 0 && (
        <ul className="heat-differ" aria-label="Where you and TMDB disagree">
          {mine.differ.slice(0, 4).map((m) => (
            <li key={label(m.cell)}>
              <button className="link-btn" onClick={() => onPick(m.cell.season, m.cell.episode)}>
                <b>{label(m.cell)}</b>
                {!m.cell.spoiler && m.cell.title ? ` “${m.cell.title}”` : ''}
              </button>
              <span>
                {REACTIONS[m.reaction].emoji} for you, ★ {m.cell.rating!.toFixed(1)} on TMDB{' '}
                <span className="muted">({m.differs === 'dragged' ? 'one of its best' : 'one of its lowest'})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {showMine ? (
        <div className="heat-legend">
          {REACTION_LIST.map((r) => (
            <span key={r} className="heat-key">
              <span className={`heat-swatch r-${r}`} aria-hidden>
                {REACTIONS[r].emoji}
              </span>
              {REACTIONS[r].label}
              {mine.counts[r] ? ` (${mine.counts[r]})` : ''}
            </span>
          ))}
          <span className="heat-key differs-key">Ringed: you and TMDB disagree</span>
          <span className="muted">Click a square to open that episode and change how it hit you.</span>
        </div>
      ) : (
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
      )}
    </section>
  )
}
