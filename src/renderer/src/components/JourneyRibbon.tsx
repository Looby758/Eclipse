import { formatDate, formatMonth, plural } from '@core/format'
import { gapLabel, type Journey, type JourneyStint } from '@core/journey'
import { localDate } from '@core/library'

const DAY = 86400000
const toMs = (d: string): number => Date.parse(`${d}T12:00:00Z`)
/** The narrowest a season can be drawn, as a share of the ribbon, so a binge still shows. */
const MIN_W = 2.6
const NUDGE = 0.5

/**
 * Phase 57, "My journey with a show": a ribbon per watch (your first time through, rewatches,
 * watching with someone), each season a block placed on the calendar from your first tick in it
 * to your last, with the long breaks in between labelled. Seasons seen before Eclipse sit at the
 * start under "Before". Only seasons you've reached are drawn.
 */
export default function JourneyRibbon({ journey: j, onSeason }: { journey: Journey; onSeason?: (season: number) => void }): React.JSX.Element {
  const today = localDate(new Date())
  const going = j.lanes.some((l) => l.going)
  const start = j.start ?? today
  const end = going && j.end && j.end < today ? today : (j.end ?? today)
  const span = Math.max(DAY * 14, toMs(end) - toMs(start))
  const hasUndated = j.lanes.some((l) => l.stints.some((s) => !s.from))
  // Seasons seen before Eclipse get a strip at the start; the calendar fills the rest.
  const lead = hasUndated ? 12 : 0
  const at = (d: string): number => lead + ((toMs(d) - toMs(start)) / span) * (100 - lead - MIN_W)

  const years: { year: number; left: number }[] = []
  for (let y = Number(start.slice(0, 4)) + 1; y <= Number(end.slice(0, 4)); y++) years.push({ year: y, left: at(`${y}-01-01`) })

  const longest = j.gaps.reduce<(typeof j.gaps)[number] | null>((a, g) => (!a || g.days > a.days ? g : a), null)
  const first = j.lanes[0]
  const summary = [
    j.start ? `Started ${formatMonth(j.start)}` : 'Started before Eclipse',
    plural(new Set(j.lanes.flatMap((l) => l.stints.map((s) => s.season))).size, 'season'),
    j.lanes.length > 1 ? `${j.lanes.length} watches` : '',
    longest ? `longest break ${gapLabel(longest.days)}, after season ${longest.afterSeason}` : ''
  ].filter(Boolean)

  return (
    <section className="journey" aria-label="Your journey with this show">
      <p className="journey-summary">{summary.join(' · ')}</p>
      <div className="journey-lanes">
        {j.lanes.map((lane, li) => {
          let right = 0
          const blocks = lane.stints.map((s) => {
            const left = s.from ? Math.max(at(s.from), right + (right ? NUDGE : 0)) : Math.min(right + (right ? NUDGE : 0), lead - MIN_W)
            const width = s.from && s.to ? Math.max(MIN_W, at(s.to) - at(s.from)) : MIN_W * 1.6
            right = left + width
            return { s, left, width }
          })
          return (
            <div key={li} className={`journey-lane ${lane.kind}`}>
              <span className="journey-label">
                {lane.label}
                {lane.going && <small>going</small>}
              </span>
              <div className="journey-track">
                {hasUndated && <span className="journey-before" style={{ width: `${lead - 1}%` }} aria-hidden />}
                {years.map((y) => (
                  <span key={y.year} className="journey-year-line" style={{ left: `${y.left}%` }} aria-hidden />
                ))}
                {j.gaps
                  .filter((g) => g.lane === li)
                  .map((g) => {
                    const a = blocks.find((b) => b.s.season === g.afterSeason)!
                    const b = blocks.find((x) => x.s.season === g.beforeSeason)!
                    return (
                      <span key={g.afterSeason} className="journey-gap" style={{ left: `${a.left + a.width}%`, width: `${Math.max(0, b.left - a.left - a.width)}%` }}>
                        <em>{gapLabel(g.days)}</em>
                      </span>
                    )
                  })}
                {blocks.map(({ s, left, width }) => (
                  <button
                    key={s.season}
                    className={`journey-season ${s.total && s.seen >= s.total ? 'done' : 'part'}`}
                    style={{ left: `${left}%`, width: `${width}%`, ['--hue' as string]: hueOf(s.season) }}
                    title={describe(s)}
                    aria-label={describe(s)}
                    onClick={() => onSeason?.(s.season)}
                  >
                    S{s.season}
                  </button>
                ))}
                {lane.going && <span className="journey-now" style={{ left: `${at(today)}%` }} title="Today" aria-hidden />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="journey-axis" aria-hidden>
        <span className="journey-label" />
        <div className="journey-track">
          {hasUndated && <span className="journey-tick" style={{ left: 0 }}>Before</span>}
          <span className="journey-tick" style={{ left: `${lead}%` }}>
            {formatMonth(start)}
          </span>
          {years
            .filter((y) => y.left > lead + 12 && y.left < 88)
            .map((y) => (
              <span key={y.year} className="journey-tick" style={{ left: `${y.left}%` }}>
                {y.year}
              </span>
            ))}
          <span className="journey-tick end">{going ? 'Now' : formatMonth(end)}</span>
        </div>
      </div>
      {first && first.stints.length > 0 && (
        <ol className="journey-list">
          {j.lanes.flatMap((lane, li) =>
            lane.stints.map((s) => (
              <li key={`${li}:${s.season}`}>
                <span className="journey-dot" style={{ ['--hue' as string]: hueOf(s.season) }} />
                <b>{j.lanes.length > 1 ? `${lane.label}, season ${s.season}` : `Season ${s.season}`}</b> {describe(s, false)}
              </li>
            ))
          )}
        </ol>
      )}
    </section>
  )
}

/** Each season its own cool hue, stepping round the wheel so neighbours differ. */
const hueOf = (season: number): number => [195, 250, 280, 215, 170, 300, 230, 185][(season - 1) % 8]

function describe(s: JourneyStint, name = true): string {
  const when = !s.from ? 'seen before Eclipse' : s.from === s.to ? formatDate(s.from) : `${formatDate(s.from)} to ${formatDate(s.to)}`
  const count = s.total ? `${s.seen} of ${s.total} episodes` : plural(s.seen, 'episode')
  const days = s.from && s.to && s.from !== s.to ? ` (${plural(Math.round((toMs(s.to) - toMs(s.from)) / DAY) + 1, 'day')})` : ''
  return `${name ? `Season ${s.season}: ` : ''}${when}${days} · ${count}`
}
