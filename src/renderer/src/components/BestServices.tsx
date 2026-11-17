import { Sparkles } from 'lucide-react'
import { activeEntry, localDate, preferencesOf } from '@core/library'
import { bestServices, type WantedTitle } from '@core/services'
import { plural } from '@core/format'
import { formatHours, timeLeft } from '@core/time'
import { imageUrl } from '@core/tmdb'
import type { Library, TitleDetails, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

/** Everything you still want to watch: your watchlist, what you're part-way through, and Watch soon. */
export function wantedTitles(library: Library, details: Record<string, TitleDetails>, today: string): WantedTitle[] {
  const keys = new Set<string>((library.watchSoon ?? []).map((r) => r.key))
  for (const raw of Object.values(library.entries)) {
    const e = activeEntry(raw)!
    if (e.status === 'want' || e.status === 'watching') keys.add(raw.key)
  }
  return [...keys].flatMap((key) => {
    const d = details[key]
    const e = library.entries[key]
    if (!d) return []
    const left = timeLeft(d, activeEntry(e), today)
    return left.minutes > 0 ? [{ key, name: d.name ?? e?.title.name ?? key, minutes: left.minutes }] : []
  })
}

const names = (ts: WantedTitle[], n = 3): string => ts.slice(0, n).map((t) => t.name).join(', ') + (ts.length > n ? ` and ${ts.length - n} more` : '')

/** "Which services should I get?": the few services that cover the most of what you want to watch. */
export default function BestServices({ providers, details }: { providers: Record<string, WatchProviders>; details: Record<string, TitleDetails> }): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const prefs = preferencesOf(library)
  const wanted = wantedTitles(library, details, localDate(new Date()))
  if (!wanted.length) return null
  const b = bestServices(wanted, providers, prefs.services)
  const total = wanted.reduce((n, t) => n + t.minutes, 0)
  const covered = b.combo.reduce((n, c) => n + c.addsMinutes, 0)
  const freeMinutes = b.free.reduce((n, t) => n + t.minutes, 0)

  return (
    <section className="card best-services">
      <div className="service-report-head">
        <Sparkles size={20} />
        <h2>Best services for your watchlist</h2>
      </div>
      <p className="muted">
        From the {formatHours(total)} you still want to watch ({plural(wanted.length, 'title')}), the fewest services that get you the most of it. Each one adds what the ones before it don’t have.
      </p>
      {b.combo.length ? (
        <ol className="best-combo">
          {b.combo.map((c, i) => {
            const logo = imageUrl(c.provider.logoPath, 'w92')
            return (
              <li key={c.provider.id}>
                <span className="best-rank">{i + 1}</span>
                {logo ? <img src={logo} alt="" draggable={false} /> : <span className="best-logo" />}
                <div className="best-text">
                  <strong>
                    {c.provider.name}
                    {c.mine && <span className="best-mine">You have it</span>}
                  </strong>
                  <span className="muted small">
                    {i === 0 ? '' : 'Adds '}
                    {formatHours(c.addsMinutes)} across {plural(c.adds.length, 'title')}: {names(c.adds)}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="muted">None of it is on a subscription service in your country right now.</p>
      )}
      {b.combo.length > 0 && (
        <p className="small">
          {b.combo.length === 1 ? 'That covers' : `Between these ${b.combo.length}`}: <b>{formatHours(covered)}</b> of your {formatHours(total)}
          {freeMinutes ? `, plus ${formatHours(freeMinutes)} free on BBC iPlayer, ITVX and the like (${names(b.free, 2)})` : ''}.
        </p>
      )}
      {b.nowhere.length > 0 && <p className="muted small">Not on any subscription or free service: {names(b.nowhere, 4)} (rent or buy, or not streaming).</p>}
      {b.unchecked > 0 && <p className="muted small">Still checking {plural(b.unchecked, 'title')}…</p>}
      {b.ranking.length > b.combo.length && (
        <details className="best-all">
          <summary>Every service with something you want</summary>
          <ul>
            {b.ranking.map((c) => (
              <li key={c.provider.id}>
                <span>
                  {c.provider.name}
                  {c.mine && <span className="best-mine">You have it</span>}
                </span>
                <span className="muted small">
                  {formatHours(c.minutes)} · {plural(c.titles.length, 'title')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">Prices aren’t included (TMDB doesn’t have them). Where things stream changes, so this is worked out fresh each time.</p>
    </section>
  )
}
