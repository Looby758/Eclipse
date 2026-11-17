import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { guessServices } from '@core/providers'
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

/** Your country and the streaming services you pay for (saved in library.json, so both computers share them). */
export default function ServicesCard(): React.JSX.Element {
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
      setAll(r.value.data)
      // The first time: start with the services from the plan (Disney+ and NOW TV), found by name.
      if (!useApp.getState().library.preferences) {
        const guess = guessServices(r.value.data)
        if (guess.length) setLibrary(await window.api.setPreferences({ services: guess }))
      }
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
      <h2>Your services</h2>
      <p className="muted">Pick the streaming services you pay for. Eclipse lights them up on title pages and uses them for the “On my services” filter.</p>
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
    </section>
  )
}
