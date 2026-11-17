import { Clock } from 'lucide-react'
import { formatHours, type HoursBucket } from '@core/time'
import type { WatchStatus } from '@core/types'

/** "Your watchlist is 214 hours long", split by service. */
export default function WatchlistHours({ tab, hours, loading, unknown }: { tab: WatchStatus; hours: { minutes: number; titles: number; buckets: HoursBucket[] }; loading: boolean; unknown: number }): React.JSX.Element {
  const total = formatHours(hours.minutes)
  const biggest = Math.max(1, ...hours.buckets.map((b) => b.minutes))
  return (
    <section className="hours">
      <div className="hours-head">
        <Clock size={18} />
        <h2>
          {loading && !hours.minutes ? (
            'Adding it up…'
          ) : tab === 'want' ? (
            <>
              Your watchlist is <span className="glow-text">{total}</span> long
            </>
          ) : (
            <>
              <span className="glow-text">{total}</span> left of what you’re watching
            </>
          )}
        </h2>
      </div>
      {hours.buckets.length > 0 && (
        <ul className="hours-buckets">
          {hours.buckets.map((b) => (
            <li key={b.label} className={b.serviceId ? 'yours' : ''}>
              <span className="hours-bar" style={{ width: `${Math.max(4, (b.minutes / biggest) * 100)}%` }} aria-hidden />
              <span className="hours-label">{b.label}</span>
              <span className="hours-value">
                {formatHours(b.minutes)} · {b.titles}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(loading || unknown > 0) && <p className="muted small">{loading ? 'Still adding up some titles…' : `${unknown} couldn’t be checked, so aren’t counted.`}</p>}
    </section>
  )
}
