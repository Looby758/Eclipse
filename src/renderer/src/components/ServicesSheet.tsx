import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { activeEntry, localDate, preferencesOf } from '@core/library'
import { daysAfter, lastTicked } from '@core/nudges'
import { serviceReports, servicesNews, type ServiceReport } from '@core/services'
import { formatShortDay, plural } from '@core/format'
import { formatHours } from '@core/time'
import { imageUrl } from '@core/tmdb'
import type { Library, Provider } from '@core/types'
import { useApp } from '../store/app'
import { useAvailability, useDetailsMany } from '../lib/availability'
import { useServiceHistory } from '../lib/services'
import Sheet from './Sheet'
import Credits from './Credits'
import BestServices from './BestServices'

/** Titles that matter here: what you want to watch, are watching, and anything watched in the last 30 days. */
function relevantKeys(library: Library, today: string): string[] {
  const since = daysAfter(today, -30)
  const keys = new Set<string>((library.watchSoon ?? []).map((r) => r.key))
  for (const raw of Object.values(library.entries)) {
    const e = activeEntry(raw)!
    const recent =
      (raw.watchedOn ?? '') >= since ||
      (lastTicked(raw.episodes) ?? '') >= since ||
      (raw.rewatches ?? []).some((r) => (r.finishedOn ?? '') >= since || (lastTicked(r.episodes) ?? '') >= since)
    if (e.status === 'want' || e.status === 'watching' || recent) keys.add(raw.key)
  }
  return [...keys]
}

function verdict(r: ServiceReport): { text: string; tone: 'pause' | 'quiet' | 'keep' } {
  const when = r.renews ? ` before it renews on ${formatShortDay(r.renews)}` : ''
  if (r.pause) return { text: `Nothing you want is on it. Pause it${when}.`, tone: 'pause' }
  if (!r.queuedMinutes) return { text: `Nothing you want is on it right now${r.renews ? `, but it doesn’t renew until ${formatShortDay(r.renews)}` : ''}.`, tone: 'quiet' }
  if (!r.recentMinutes) return { text: `${formatHours(r.queuedMinutes)} waiting on it, but you haven’t watched it in the last month.`, tone: 'quiet' }
  return { text: 'Worth keeping: you’re using it and there’s more to watch.', tone: 'keep' }
}

/** Your services: "Do I still need NOW TV this month?" */
export default function ServicesSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go } = useApp.getState()
  const prefs = preferencesOf(library)
  const today = localDate(new Date())
  const [all, setAll] = useState<Provider[]>([])
  const history = useServiceHistory()
  const keys = relevantKeys(library, today)
  const { providers, checking } = useAvailability(keys, keys.length > 0)
  const { map: details, checking: loading } = useDetailsMany(keys, keys.length > 0)

  useEffect(() => {
    let cancelled = false
    window.api.services().then((r) => !cancelled && r.ok && setAll(r.value.data))
    return () => {
      cancelled = true
    }
  }, [prefs.region])

  const mine = prefs.services.map((id) => all.find((p) => p.id === id) ?? { id, name: `Service ${id}`, logoPath: null })
  const reports = serviceReports(library, mine, providers, details, prefs.renewals, today)
  const news = servicesNews(history, prefs.services, today, 30)

  return (
    <Sheet className="services">
      <div className="sheet-head">
        <h1>Your services</h1>
      </div>
      <p className="muted">Which services are best for what you want to watch, and for each one you pay for: what’s waiting, how much you’ve used it lately, and when it renews.</p>
      {!mine.length && (
        <p className="muted">
          You haven’t picked your services yet.{' '}
          <button className="link-btn inline" onClick={() => go({ name: 'settings' })}>
            Pick them in Settings
          </button>
        </p>
      )}
      {(checking || loading) && <p className="muted small">Checking where everything is streaming…</p>}
      {!checking && !loading && <BestServices providers={providers} details={details} />}
      <div className="service-reports">
        {reports.map((r) => {
          const logo = imageUrl(r.provider.logoPath, 'w92')
          const v = verdict(r)
          const arrived = news.find((n) => n.providerId === r.provider.id && n.kind === 'arrived')
          const left = news.find((n) => n.providerId === r.provider.id && n.kind === 'left')
          return (
            <section key={r.provider.id} className={`card service-report ${v.tone}`}>
              <div className="service-report-head">
                {logo && <img src={logo} alt="" draggable={false} />}
                <h2>{r.provider.name}</h2>
              </div>
              <p className={`service-verdict ${v.tone}`}>{v.text}</p>
              <dl className="service-facts">
                <div>
                  <dt>Waiting for you</dt>
                  <dd>{r.queued.length ? `${formatHours(r.queuedMinutes)} across ${plural(r.queued.length, 'title')}` : 'Nothing'}</dd>
                </div>
                <div>
                  <dt>Watched in the last 30 days</dt>
                  <dd>{r.recentMinutes ? `${formatHours(r.recentMinutes)} (${r.recentTitles.slice(0, 3).join(', ')}${r.recentTitles.length > 3 ? '…' : ''})` : 'Nothing'}</dd>
                </div>
                <div>
                  <dt>Renews</dt>
                  <dd>
                    {r.renews ? (
                      `${formatShortDay(r.renews)}${r.daysToRenewal === 0 ? ', today' : r.daysToRenewal === 1 ? ', tomorrow' : `, in ${r.daysToRenewal} days`}`
                    ) : (
                      <button className="link-btn inline small" onClick={() => go({ name: 'settings' })}>
                        <Settings size={13} /> Set the day in Settings
                      </button>
                    )}
                  </dd>
                </div>
              </dl>
              {r.queued.length > 0 && (
                <ul className="service-queue">
                  {r.queued.slice(0, 5).map((q) => {
                    const [type, id] = q.key.split(':')
                    return (
                      <li key={q.key}>
                        <button className="note-open" onClick={() => go({ name: 'title', type: type as 'movie' | 'tv', id: Number(id) })}>
                          {q.name}
                        </button>
                        <span className="muted small"> · {formatHours(q.minutes)}</span>
                      </li>
                    )
                  })}
                  {r.queued.length > 5 && <li className="muted small">and {r.queued.length - 5} more</li>}
                </ul>
              )}
              {(arrived || left) && (
                <p className="muted small">
                  {arrived && `Arrived lately: ${arrived.titles.map((t) => t.name).join(', ')}. `}
                  {left && `Left lately: ${left.titles.map((t) => t.name).join(', ')}.`}
                </p>
              )}
            </section>
          )
        })}
      </div>
      <Credits />
    </Sheet>
  )
}
