import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { preferencesOf } from '@core/library'
import { imageUrl } from '@core/tmdb'
import type { Provider } from '@core/types'
import { useApp } from '../store/app'

const REGIONS: [string, string][] = [
  ['GB', 'United Kingdom'],
  ['IE', 'Ireland'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['NL', 'Netherlands']
]

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

/** Your country and the streaming services you pay for (saved in library.json, so both computers share them). */
export default function ServicesCard({ welcome }: { welcome?: boolean } = {}): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { setLibrary, setStatus } = useApp.getState()
  const prefs = preferencesOf(library)
  const [all, setAll] = useState<Provider[]>([])
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.services().then(async (r) => {
      if (cancelled) return
      if (!r.ok) return setError(r.error)
      setError('')
      // Nothing is ticked for you: pick your own (Phase 42).
      setAll(r.value.data)
    })
    return () => {
      cancelled = true
    }
  }, [prefs.region])

  const save = async (patch: Parameters<typeof window.api.setPreferences>[0]): Promise<void> => {
    setLibrary(await window.api.setPreferences(patch))
    if (patch.region) setStatus(await window.api.status())
  }
  const toggle = (id: number): Promise<void> => save({ services: prefs.services.includes(id) ? prefs.services.filter((s) => s !== id) : [...prefs.services, id] })

  const mine = all.filter((p) => prefs.services.includes(p.id))
  const list = showAll ? all : [...mine, ...all.filter((p) => !prefs.services.includes(p.id))].slice(0, Math.max(18, mine.length))

  return (
    <section className="card">
      {!welcome && (
        <>
          <h2>Your services</h2>
          <p className="muted">Pick the streaming services you pay for. Eclipse lights them up on title pages and uses them for the “On my services” filter.</p>
          <button className="link-btn" style={{ marginBottom: 12 }} onClick={() => useApp.getState().go({ name: 'services' })}>
            {prefs.services.length > 0 ? 'Do I still need them? Which services are best for my watchlist?' : 'Which services are best for my watchlist?'}
          </button>
        </>
      )}
      <label className="region-select">
        <span>Country</span>
        <select value={prefs.region} onChange={(e) => save({ region: e.target.value })}>
          {REGIONS.some(([c]) => c === prefs.region) ? null : <option value={prefs.region}>{prefs.region}</option>}
          {REGIONS.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="service-chips">
        {list.map((p) => {
          const on = prefs.services.includes(p.id)
          const logo = imageUrl(p.logoPath, 'w92')
          return (
            <button key={p.id} className={`service-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)}>
              {logo && <img src={logo} alt="" draggable={false} />}
              <span>{p.name}</span>
              {on && <Check size={14} strokeWidth={3} />}
            </button>
          )
        })}
      </div>
      {all.length > list.length && (
        <button className="link-btn" onClick={() => setShowAll(true)}>
          Show all {all.length} services
        </button>
      )}
      {mine.length > 0 && !welcome && (
        <div className="renewals">
          <div className="muted small">Renewal day (optional): lets a show page offer “finish it before it renews”.</div>
          {mine.map((p) => (
            <label key={p.id} className="renewal-row">
              <span>{p.name} renews on the</span>
              <select
                value={prefs.renewals[String(p.id)] ?? ''}
                onChange={(e) => {
                  const renewals = { ...prefs.renewals }
                  if (e.target.value) renewals[String(p.id)] = Number(e.target.value)
                  else delete renewals[String(p.id)]
                  save({ renewals })
                }}
              >
                <option value="">day I don’t know</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {ordinal(n)}
                  </option>
                ))}
              </select>
              <span>of each month</span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
